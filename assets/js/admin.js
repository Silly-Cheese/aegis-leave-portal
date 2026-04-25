import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDocs, serverTimestamp, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
import { getUserWithPermissions } from "./permissions.js";

const firebaseConfig = {
  apiKey: "AIzaSyAmBLwVBVhY29tnMMHH-kVHo77OILX7PTM",
  authDomain: "aegis-leave-portal.firebaseapp.com",
  projectId: "aegis-leave-portal",
  storageBucket: "aegis-leave-portal.firebasestorage.app",
  messagingSenderId: "342840695573",
  appId: "1:342840695573:web:3a893612b564d97fd8271c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const secondaryApp = initializeApp(firebaseConfig, "SecondaryAdmin");
const secondaryAuth = getAuth(secondaryApp);

const form = document.getElementById("createUserForm");
const userList = document.getElementById("userList");
const statusBanner = document.getElementById("statusBanner");
const createUserButton = document.getElementById("createUserButton");
const accountTypeSelect = document.getElementById("accountType");
const roleSelect = document.getElementById("role");
const userSearchInput = document.getElementById("userSearchInput");
const companyIdInput = document.getElementById("companyId");
const companyNameInput = document.getElementById("companyName");

let currentAdminData = null;
let users = [];
let customRoles = [];

const ROLE_SETS = {
  aegis: [
    { value: "owner", label: "Owner" },
    { value: "account_manager", label: "Account Manager" },
    { value: "role_setter", label: "Role Setter" },
    { value: "community_manager", label: "Community Manager" },
    { value: "staff", label: "Staff" }
  ],
  customer: [
    { value: "company_owner", label: "Company Owner" },
    { value: "loa_manager", label: "LOA Manager" },
    { value: "staff", label: "Staff" }
  ]
};

function showStatus(message) {
  statusBanner.innerHTML = message;
  statusBanner.classList.remove("hidden");
}

function clearStatus() {
  statusBanner.innerHTML = "";
  statusBanner.classList.add("hidden");
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function humanize(value) {
  return String(value || "—").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getDefaultTempPassword() {
  return "AEGIS_TEMP";
}

function generateHiddenEmail(username, companyId) {
  return `${slugify(username)}.${slugify(companyId)}@aegis.local`;
}

async function logAudit(action, targetType, targetId, details = {}) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      action,
      actorUid: auth.currentUser?.uid || "unknown",
      actorName: currentAdminData?.discordUsername || "Unknown",
      targetType,
      targetId,
      companyId: details.companyId || currentAdminData?.companyId || null,
      details,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Audit logging failed:", error);
  }
}

function canAccessAdminPanel() {
  return currentAdminData?.permissions?.canManageUsers === true;
}

function canCreateRequestedRole(accountType, role, companyId) {
  const adminRole = normalizeRole(currentAdminData?.role);
  const requestedRole = normalizeRole(role);

  if (currentAdminData?.accountType === "managing_company" && ["owner", "account_manager"].includes(adminRole)) return true;

  if (currentAdminData?.accountType === "managing_company" && adminRole === "community_manager") {
    return accountType === "managing_company" && companyId === currentAdminData.companyId && ["community_manager", "staff"].includes(requestedRole);
  }

  if (currentAdminData?.accountType === "customer" && adminRole === "company_owner") {
    return accountType === "customer" && companyId === currentAdminData.companyId && requestedRole !== "company_owner";
  }

  return false;
}

function canManageTarget(targetUser) {
  if (!currentAdminData?.permissions?.canManageUsers) return false;
  if (currentAdminData.accountType === "managing_company") return true;
  return targetUser.accountType === "customer" && targetUser.companyId === currentAdminData.companyId;
}

function canDeleteUser(targetUser) {
  if (!canManageTarget(targetUser)) return false;
  if (targetUser.docId === auth.currentUser?.uid) return false;

  const adminRole = normalizeRole(currentAdminData.role);
  const targetRole = normalizeRole(targetUser.role);

  if (currentAdminData.accountType === "managing_company" && ["owner", "account_manager"].includes(adminRole)) {
    if (targetRole === "owner" && adminRole !== "owner") return false;
    return true;
  }

  if (currentAdminData.accountType === "customer" && adminRole === "company_owner") {
    return targetRole !== "company_owner";
  }

  return false;
}

async function loadCustomRoles() {
  customRoles = [];
  const snapshot = await getDocs(collection(db, "customRoles"));
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.active !== false) customRoles.push({ ...data, docId: docSnap.id });
  });
}

function rebuildRoleOptions() {
  const selectedType = accountTypeSelect.value;
  const adminRole = normalizeRole(currentAdminData?.role);
  const adminAccountType = currentAdminData?.accountType;
  const companyId = slugify(companyIdInput?.value || currentAdminData?.companyId || "");

  let options = [];

  if (adminAccountType === "managing_company" && ["owner", "account_manager"].includes(adminRole)) {
    options = selectedType === "managing_company" ? ROLE_SETS.aegis : ROLE_SETS.customer;
  } else if (adminAccountType === "managing_company" && adminRole === "community_manager") {
    accountTypeSelect.value = "managing_company";
    options = ROLE_SETS.aegis.filter(r => ["community_manager", "staff"].includes(r.value));
  } else if (adminAccountType === "customer" && adminRole === "company_owner") {
    accountTypeSelect.value = "customer";
    options = ROLE_SETS.customer.filter(r => ["loa_manager", "staff"].includes(r.value));
  }

  if (accountTypeSelect.value === "customer") {
    customRoles
      .filter(role => !companyId || role.companyId === companyId)
      .forEach(role => options.push({ value: role.roleId, label: `${role.roleName} (Custom)` }));
  }

  roleSelect.innerHTML = `<option value="">Select a role</option>`;
  options.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.value;
    opt.textContent = r.label;
    roleSelect.appendChild(opt);
  });
}

function buildUserCard(id, data) {
  const card = document.createElement("div");
  card.className = "loa-card";

  const isActive = data.active !== false;

  card.innerHTML = `
    <strong>${data.discordUsername || "Unnamed User"}</strong>
    <p>${humanize(data.role)} • ${humanize(data.accountType)}</p>
    <span>Company: ${data.companyName || data.companyId || "—"}</span>
    <span>Status: ${isActive ? "Active" : "Inactive"}</span>
  `;

  const actions = document.createElement("div");
  actions.className = "button-grid";

  const viewBtn = document.createElement("button");
  viewBtn.className = "primary-btn";
  viewBtn.type = "button";
  viewBtn.textContent = "View Profile";
  viewBtn.addEventListener("click", () => {
    window.location.href = `user-view.html?uid=${encodeURIComponent(id)}`;
  });
  actions.appendChild(viewBtn);

  if (canManageTarget({ ...data, docId: id })) {
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "secondary-btn";
    toggleBtn.type = "button";
    toggleBtn.textContent = isActive ? "Disable" : "Enable";
    toggleBtn.addEventListener("click", async () => {
      try {
        await updateDoc(doc(db, "users", id), {
          active: !isActive,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser.uid
        });
        await logAudit(isActive ? "DISABLE_ACCOUNT" : "ENABLE_ACCOUNT", "user", id, { targetName: data.discordUsername, companyId: data.companyId });
        showStatus(`Account ${isActive ? "disabled" : "enabled"} successfully.`);
        await loadUsers();
      } catch (error) {
        console.error(error);
        showStatus("Failed to update account status.");
      }
    });
    actions.appendChild(toggleBtn);

    const resetBtn = document.createElement("button");
    resetBtn.className = "secondary-btn";
    resetBtn.type = "button";
    resetBtn.textContent = "Require Password Change";
    resetBtn.addEventListener("click", async () => {
      try {
        await updateDoc(doc(db, "users", id), {
          mustChangePassword: true,
          tempPasswordIssued: true,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser.uid
        });
        await logAudit("REQUIRE_PASSWORD_CHANGE", "user", id, { targetName: data.discordUsername, companyId: data.companyId });
        showStatus(`Password-change requirement enabled. Temporary password reference: ${getDefaultTempPassword()}`);
      } catch (error) {
        console.error(error);
        showStatus("Failed to update password-change requirement.");
      }
    });
    actions.appendChild(resetBtn);
  }

  if (canDeleteUser({ ...data, docId: id })) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "secondary-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete Account";
    deleteBtn.addEventListener("click", async () => {
      if (prompt(`Type DELETE to remove ${data.discordUsername}.`) !== "DELETE") {
        showStatus("Account deletion cancelled.");
        return;
      }

      try {
        await deleteDoc(doc(db, "users", id));
        await logAudit("DELETE_ACCOUNT", "user", id, { targetName: data.discordUsername, companyId: data.companyId });
        showStatus("Account record deleted. Firebase Auth deletion requires server-side Admin SDK.");
        await loadUsers();
      } catch (error) {
        console.error(error);
        showStatus("Failed to delete account.");
      }
    });
    actions.appendChild(deleteBtn);
  }

  card.appendChild(actions);
  return card;
}

function renderUsers(filter = "") {
  userList.innerHTML = "";
  const normalized = filter.trim().toLowerCase();

  const filtered = users.filter(user => {
    const haystack = [user.discordUsername, user.role, user.accountType, user.companyId, user.companyName || ""].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });

  if (!filtered.length) {
    userList.innerHTML = `<div class="loa-card"><strong>No matching users</strong><p>No accounts matched your search.</p></div>`;
    return;
  }

  filtered.forEach(user => userList.appendChild(buildUserCard(user.docId, user)));
}

async function loadUsers() {
  users = [];
  const snap = await getDocs(collection(db, "users"));

  snap.forEach(d => {
    const data = d.data();
    if (currentAdminData.accountType === "customer" && data.companyId !== currentAdminData.companyId) return;
    users.push({ ...data, docId: d.id });
  });

  renderUsers(userSearchInput.value || "");
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    currentAdminData = await getUserWithPermissions(db, user.uid);
    if (!currentAdminData) {
      showStatus("Your user record could not be found.");
      return;
    }

    if (!canAccessAdminPanel()) {
      showStatus("You do not have permission to access account administration.");
      form.classList.add("hidden");
      return;
    }

    if (currentAdminData.accountType === "customer") {
      accountTypeSelect.value = "customer";
      companyIdInput.value = currentAdminData.companyId || "";
      companyNameInput.value = currentAdminData.companyName || "";
    }

    await loadCustomRoles();
    rebuildRoleOptions();
    await loadUsers();
  } catch (error) {
    console.error(error);
    showStatus("Failed to load account administration data.");
  }
});

accountTypeSelect.addEventListener("change", rebuildRoleOptions);
companyIdInput.addEventListener("input", rebuildRoleOptions);
userSearchInput.addEventListener("input", e => renderUsers(e.target.value));

form.addEventListener("submit", async e => {
  e.preventDefault();
  clearStatus();

  createUserButton.disabled = true;
  createUserButton.dataset.originalText = createUserButton.dataset.originalText || createUserButton.textContent;
  createUserButton.textContent = "Creating User...";

  const username = document.getElementById("discordUsername").value.trim();
  const loginKey = slugify(username);
  const accountType = accountTypeSelect.value;
  const role = roleSelect.value;
  const companyId = slugify(companyIdInput.value);
  const companyName = companyNameInput.value.trim();
  const authEmail = generateHiddenEmail(username, companyId);
  const password = getDefaultTempPassword();

  if (!username || !loginKey || !role || !companyId || !companyName) {
    showStatus("All account fields are required.");
    createUserButton.disabled = false;
    createUserButton.textContent = createUserButton.dataset.originalText;
    return;
  }

  if (!canCreateRequestedRole(accountType, role, companyId)) {
    showStatus("You do not have permission to create that type of account.");
    createUserButton.disabled = false;
    createUserButton.textContent = createUserButton.dataset.originalText;
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, password);

    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      discordUsername: username,
      loginKey,
      authEmail,
      accountType,
      role,
      companyId,
      companyName,
      active: true,
      mustChangePassword: true,
      tempPasswordIssued: true,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid,
      lastLoginAt: null
    });

    await logAudit("CREATE_ACCOUNT", "user", cred.user.uid, { username, role, accountType, companyId });
    await signOut(secondaryAuth);

    showStatus(`<strong>User created successfully.</strong><br>Username: <strong>${username}</strong><br>Temporary password: <strong>${password}</strong>`);
    form.reset();
    rebuildRoleOptions();
    await loadUsers();
  } catch (error) {
    console.error(error);
    showStatus("User creation failed. The generated account may already exist or your rules may be blocking the action.");
  } finally {
    createUserButton.disabled = false;
    createUserButton.textContent = createUserButton.dataset.originalText;
  }
});

document.getElementById("logoutButton").onclick = async () => {
  await signOut(auth);
  window.location.href = "index.html";
};
