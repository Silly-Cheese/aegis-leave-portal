import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, getDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

let currentAdminData = null;

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

function rebuildRoleOptions() {
  const selectedAccountType = accountTypeSelect.value;
  const adminRole = normalizeRole(currentAdminData?.role);
  const adminAccountType = currentAdminData?.accountType;

  let options = [];

  if (adminAccountType === "managing_company" && adminRole === "owner") {
    options = selectedAccountType === "managing_company" ? ROLE_SETS.aegis : ROLE_SETS.customer;
  } else if (adminAccountType === "managing_company" && adminRole === "account_manager") {
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
    <div class="button-grid">
      <button class="secondary-btn" data-action="toggle-active" data-id="${docId}" data-active="${isActive}">${toggleLabel}</button>
    </div>
  `;

  return wrapper;
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
  userList.innerHTML = "";

  const snapshot = await getDocs(collection(db, "users"));
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    if (currentAdminData.accountType === "customer" && data.companyId !== currentAdminData.companyId) {
      return;
    }

    userList.appendChild(buildUserCard(docSnap.id, data));
  });

  attachUserCardHandlers();
}

function attachUserCardHandlers() {
  document.querySelectorAll('[data-action="toggle-active"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = button.dataset.id;
      const isCurrentlyActive = button.dataset.active === "true";

      try {
        await updateDoc(doc(db, "users", userId), {
          active: !isCurrentlyActive,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser.uid
        });

        showStatus(`Account ${isCurrentlyActive ? "disabled" : "enabled"} successfully.`);
        await loadUsers();
      } catch (error) {
        console.error(error);
        showStatus("Failed to update account status.");
      }
    });
  });
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
