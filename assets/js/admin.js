import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, getDoc, serverTimestamp, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

let currentAdminData = null;
let users = [];

const ROLE_SETS = {
  aegis: [
    { value: "owner", label: "Owner" },
    { value: "account_manager", label: "Account Manager" },
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

function generateHiddenEmail(discordUsername, companyId) {
  const safeUser = slugify(discordUsername) || "user";
  const safeCompany = slugify(companyId) || "company";
  return `${safeUser}.${safeCompany}@aegis.local`;
}

function canAccessAdminPanel(userData) {
  const role = normalizeRole(userData?.role);
  const accountType = userData?.accountType;

  if (accountType === "managing_company" && ["owner", "account_manager", "community_manager"].includes(role)) {
    return true;
  }

  if (accountType === "customer" && role === "company_owner") {
    return true;
  }

  return false;
}

function canCreateRequestedRole(adminData, requestedAccountType, requestedRole) {
  const adminRole = normalizeRole(adminData?.role);
  const adminAccountType = adminData?.accountType;
  const normalizedRequestedRole = normalizeRole(requestedRole);

  if (adminAccountType === "managing_company" && adminRole === "owner") {
    return true;
  }

  if (adminAccountType === "managing_company" && adminRole === "account_manager") {
    return true;
  }

  if (adminAccountType === "managing_company" && adminRole === "community_manager") {
    return requestedAccountType === "managing_company" && ["community_manager", "staff"].includes(normalizedRequestedRole);
  }

  if (adminAccountType === "customer" && adminRole === "company_owner") {
    return requestedAccountType === "customer" && ["loa_manager", "staff"].includes(normalizedRequestedRole);
  }

  return false;
}

function canDeleteUser(targetUser) {
  const adminRole = normalizeRole(currentAdminData?.role);

  if (currentAdminData?.accountType === "managing_company" && ["owner", "account_manager"].includes(adminRole)) {
    if (targetUser.role === "owner" && adminRole !== "owner") return false;
    return true;
  }

  if (currentAdminData?.accountType === "customer" && adminRole === "company_owner") {
    return targetUser.accountType === "customer" && targetUser.companyId === currentAdminData.companyId;
  }

  return false;
}

function canResetPassword(targetUser) {
  const adminRole = normalizeRole(currentAdminData?.role);

  if (currentAdminData?.accountType === "managing_company" && ["owner", "account_manager"].includes(adminRole)) {
    return true;
  }

  if (currentAdminData?.accountType === "customer" && currentAdminData?.role === "company_owner") {
    return targetUser.accountType === "customer" && targetUser.companyId === currentAdminData.companyId;
  }

  return false;
}

function rebuildRoleOptions() {
  const selectedAccountType = accountTypeSelect.value;
  const adminRole = normalizeRole(currentAdminData?.role);
  const adminAccountType = currentAdminData?.accountType;

  let options = [];

  if (adminAccountType === "managing_company" && ["owner", "account_manager"].includes(adminRole)) {
    options = selectedAccountType === "managing_company" ? ROLE_SETS.aegis : ROLE_SETS.customer;
  } else if (adminAccountType === "managing_company" && adminRole === "community_manager") {
    accountTypeSelect.value = "managing_company";
    options = ROLE_SETS.aegis.filter(role => ["community_manager", "staff"].includes(role.value));
  } else if (adminAccountType === "customer" && adminRole === "company_owner") {
    accountTypeSelect.value = "customer";
    options = ROLE_SETS.customer.filter(role => ["loa_manager", "staff"].includes(role.value));
  }

  roleSelect.innerHTML = `<option value="">Select a role</option>`;
  options.forEach((role) => {
    const option = document.createElement("option");
    option.value = role.value;
    option.textContent = role.label;
    roleSelect.appendChild(option);
  });
}

function buildUserCard(docId, data) {
  const wrapper = document.createElement("div");
  wrapper.className = "loa-card";

  const isActive = data.active !== false;
  const toggleLabel = isActive ? "Disable" : "Enable";

  wrapper.innerHTML = `
    <strong>${data.discordUsername}</strong>
    <p>${data.role} • ${data.accountType}</p>
    <span>${data.companyName || data.companyId}</span>
    <span>Status: ${isActive ? "active" : "inactive"}</span>
  `;

  const actions = document.createElement("div");
  actions.className = "button-grid";

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "secondary-btn";
  toggleBtn.type = "button";
  toggleBtn.textContent = toggleLabel;
  toggleBtn.addEventListener("click", async () => {
    try {
      await updateDoc(doc(db, "users", docId), {
        active: !isActive,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid
      });
      showStatus(`Account ${isActive ? "disabled" : "enabled"} successfully.`);
      await loadUsers();
    } catch (error) {
      console.error(error);
      showStatus("Failed to update account status.");
    }
  });
  actions.appendChild(toggleBtn);

  if (canResetPassword(data)) {
    const resetBtn = document.createElement("button");
    resetBtn.className = "secondary-btn";
    resetBtn.type = "button";
    resetBtn.textContent = "Reset Password";
    resetBtn.addEventListener("click", async () => {
      try {
        await updateDoc(doc(db, "users", docId), {
          mustChangePassword: true,
          tempPasswordIssued: true,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser.uid
        });
        showStatus(`Password reset flag applied. Temporary password should be ${getDefaultTempPassword()}.`);
      } catch (error) {
        console.error(error);
        showStatus("Failed to reset password flag.");
      }
    });
    actions.appendChild(resetBtn);
  }

  if (canDeleteUser(data)) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "secondary-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete Account";
    deleteBtn.addEventListener("click", async () => {
      const confirmation = prompt(`Type DELETE to remove ${data.discordUsername}.`);
      if (confirmation !== "DELETE") {
        showStatus("Account deletion cancelled.");
        return;
      }

      try {
        await deleteDoc(doc(db, "users", docId));
        showStatus("Account deleted successfully.");
        await loadUsers();
      } catch (error) {
        console.error(error);
        showStatus("Failed to delete account.");
      }
    });
    actions.appendChild(deleteBtn);
  }

  wrapper.appendChild(actions);
  return wrapper;
}

function renderUsers(filter = "") {
  userList.innerHTML = "";
  const normalized = filter.trim().toLowerCase();

  const filtered = users.filter((user) => {
    const haystack = [
      user.discordUsername,
      user.role,
      user.accountType,
      user.companyId,
      user.companyName || ""
    ].join(" ").toLowerCase();

    return haystack.includes(normalized);
  });

  if (!filtered.length) {
    userList.innerHTML = `<div class="loa-card"><strong>No matching users</strong><p>No users matched your search.</p></div>`;
    return;
  }

  filtered.forEach((user) => {
    userList.appendChild(buildUserCard(user.docId, user));
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
      window.location.href = "dashboard.html";
      return;
    }

    currentAdminData = userDoc.data();

    if (!canAccessAdminPanel(currentAdminData)) {
      showStatus("You do not have permission to access the accounts page.");
      form.classList.add("hidden");
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 1200);
      return;
    }

    rebuildRoleOptions();
    await loadUsers();
  } catch (error) {
    console.error(error);
    showStatus("Failed to load account administration data.");
  }
});

accountTypeSelect.addEventListener("change", rebuildRoleOptions);

userSearchInput.addEventListener("input", (e) => {
  renderUsers(e.target.value);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();

  createUserButton.disabled = true;
  createUserButton.dataset.originalText = createUserButton.dataset.originalText || createUserButton.textContent;
  createUserButton.textContent = "Creating User...";

  const discordUsername = document.getElementById("discordUsername").value.trim();
  const loginKey = slugify(discordUsername);
  const accountType = document.getElementById("accountType").value;
  const role = document.getElementById("role").value;
  const companyId = slugify(document.getElementById("companyId").value);
  const companyName = document.getElementById("companyName").value.trim();
  const authEmail = generateHiddenEmail(discordUsername, companyId);
  const tempPassword = getDefaultTempPassword();

  if (!discordUsername || !role || !companyId || !companyName) {
    showStatus("All account fields are required.");
    createUserButton.disabled = false;
    createUserButton.textContent = createUserButton.dataset.originalText;
    return;
  }

  if (!canCreateRequestedRole(currentAdminData, accountType, role)) {
    showStatus("You do not have permission to create that type of user.");
    createUserButton.disabled = false;
    createUserButton.textContent = createUserButton.dataset.originalText;
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, tempPassword);

    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      discordUsername,
      loginKey,
      authEmail,
      accountType,
      role,
      companyId,
      companyName,
      mustChangePassword: true,
      tempPasswordIssued: true,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid,
      lastLoginAt: null
    });

    showStatus(`
      <strong>User created successfully.</strong><br>
      Hidden email: <strong>${authEmail}</strong><br>
      Temporary password: <strong>${tempPassword}</strong><br>
      Tell the user to sign in once and change it immediately.
    `);

    form.reset();
    rebuildRoleOptions();
    await signOut(secondaryAuth);
    await loadUsers();
  } catch (error) {
    console.error(error);
    showStatus("User creation failed. The generated email may already exist, or the account details are invalid.");
  } finally {
    createUserButton.disabled = false;
    createUserButton.textContent = createUserButton.dataset.originalText;
  }
});

async function loadUsers() {
  users = [];
  const snapshot = await getDocs(collection(db, "users"));

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    if (currentAdminData.accountType === "customer" && data.companyId !== currentAdminData.companyId) {
      return;
    }

    users.push({ ...data, docId: docSnap.id });
  });

  renderUsers(userSearchInput.value || "");
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
