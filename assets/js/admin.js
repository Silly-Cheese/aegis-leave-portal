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
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

const form = document.getElementById("createUserForm");
const userList = document.getElementById("userList");
const statusBanner = document.getElementById("statusBanner");
const createUserButton = document.getElementById("createUserButton");

let currentAdminData = null;

function showStatus(msg) {
  statusBanner.textContent = msg;
  statusBanner.classList.remove("hidden");
}

function clearStatus() {
  statusBanner.textContent = "";
  statusBanner.classList.add("hidden");
}

function generateTempPassword() {
  const random = Math.random().toString(36).slice(2, 10);
  return `${random}A!7`;
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function canAccessAdminPanel(userData) {
  const role = normalizeRole(userData?.role);
  const accountType = userData?.accountType;

  if (accountType === "managing_company" && ["owner", "account_manager"].includes(role)) {
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
    return requestedAccountType === "customer" && ["company_owner", "loa_manager", "staff"].includes(normalizedRequestedRole);
  }

  if (adminAccountType === "customer" && adminRole === "company_owner") {
    return requestedAccountType === "customer" && ["loa_manager", "staff"].includes(normalizedRequestedRole);
  }

  return false;
}

function buildUserCard(docId, data) {
  const wrapper = document.createElement("div");
  wrapper.className = "loa-card";

  const isActive = data.active !== false;
  const toggleLabel = isActive ? "Disable" : "Enable";

  wrapper.innerHTML = `
    <strong>${data.discordUsername}</strong>
    <p>${data.role} • ${data.accountType}</p>
    <span>${data.companyId}</span>
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

  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists()) {
    window.location.href = "dashboard.html";
    return;
  }

  currentAdminData = userDoc.data();

  if (!canAccessAdminPanel(currentAdminData)) {
    showStatus("You do not have permission to access the admin panel.");
    form.classList.add("hidden");
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 1200);
    return;
  }

  loadUsers();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();
  createUserButton.disabled = true;
  createUserButton.dataset.originalText = createUserButton.dataset.originalText || createUserButton.textContent;
  createUserButton.textContent = "Creating User...";

  const discordUsername = document.getElementById("discordUsername").value.trim();
  const loginKey = discordUsername.toLowerCase();
  const authEmail = document.getElementById("authEmail").value.trim().toLowerCase();
  const accountType = document.getElementById("accountType").value;
  const role = document.getElementById("role").value;
  const companyId = document.getElementById("companyId").value.trim();
  const companyName = document.getElementById("companyName").value.trim();

  if (!canCreateRequestedRole(currentAdminData, accountType, role)) {
    showStatus("You do not have permission to create that type of user.");
    createUserButton.disabled = false;
    createUserButton.textContent = createUserButton.dataset.originalText;
    return;
  }

  const tempPassword = generateTempPassword();

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

    showStatus(`User created successfully. Temporary password: ${tempPassword}`);
    form.reset();
    await signOut(secondaryAuth);
    await loadUsers();
  } catch (err) {
    console.error(err);
    showStatus("User creation failed. Verify the email is unique and the account details are valid.");
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
      } catch (err) {
        console.error(err);
        showStatus("Failed to update account status.");
      }
    });
  });
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
