import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDocs, getDoc, serverTimestamp, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

/* ---------------- AUDIT LOG ---------------- */

async function logAudit(action, targetType, targetId, details = {}) {
  await addDoc(collection(db, "auditLogs"), {
    action,
    actorUid: auth.currentUser.uid,
    actorName: currentAdminData.discordUsername,
    targetType,
    targetId,
    companyId: details.companyId || null,
    details,
    createdAt: serverTimestamp()
  });
}

/* ---------------- PERMISSIONS ---------------- */

function canAccessAdminPanel(user) {
  const role = normalizeRole(user?.role);
  if (user.accountType === "managing_company" &&
    ["owner", "account_manager", "community_manager"].includes(role)) return true;

  if (user.accountType === "customer" && role === "company_owner") return true;

  return false;
}

/* ---------------- UI ---------------- */

function rebuildRoleOptions() {
  const selectedType = accountTypeSelect.value;
  const role = normalizeRole(currentAdminData.role);

  let options = [];

  if (["owner", "account_manager"].includes(role)) {
    options = selectedType === "managing_company" ? ROLE_SETS.aegis : ROLE_SETS.customer;
  } else if (role === "community_manager") {
    options = ROLE_SETS.aegis.filter(r => ["community_manager", "staff"].includes(r.value));
  } else if (role === "company_owner") {
    options = ROLE_SETS.customer.filter(r => ["loa_manager", "staff"].includes(r.value));
  }

  roleSelect.innerHTML = `<option value="">Select a role</option>`;
  options.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.value;
    opt.textContent = r.label;
    roleSelect.appendChild(opt);
  });
}

/* ---------------- USER CARD ---------------- */

function buildUserCard(id, data) {
  const div = document.createElement("div");
  div.className = "loa-card";

  div.innerHTML = `
    <strong>${data.discordUsername}</strong>
    <p>${data.role}</p>
    <span>${data.companyName}</span>
  `;

  const actions = document.createElement("div");

  /* ENABLE / DISABLE */
  const toggle = document.createElement("button");
  toggle.textContent = data.active ? "Disable" : "Enable";
  toggle.onclick = async () => {
    await updateDoc(doc(db, "users", id), { active: !data.active });
    await logAudit(data.active ? "DISABLE_ACCOUNT" : "ENABLE_ACCOUNT", "user", id);
    loadUsers();
  };

  /* DELETE */
  const del = document.createElement("button");
  del.textContent = "Delete";
  del.onclick = async () => {
    if (prompt("Type DELETE") === "DELETE") {
      await deleteDoc(doc(db, "users", id));
      await logAudit("DELETE_ACCOUNT", "user", id);
      loadUsers();
    }
  };

  actions.appendChild(toggle);
  actions.appendChild(del);
  div.appendChild(actions);

  return div;
}

/* ---------------- LOAD USERS ---------------- */

async function loadUsers() {
  users = [];
  const snap = await getDocs(collection(db, "users"));

  snap.forEach(d => {
    const data = d.data();
    if (currentAdminData.accountType === "customer" &&
        data.companyId !== currentAdminData.companyId) return;

    users.push({ ...data, id: d.id });
  });

  renderUsers();
}

function renderUsers(filter = "") {
  userList.innerHTML = "";

  users
    .filter(u => u.discordUsername.toLowerCase().includes(filter.toLowerCase()))
    .forEach(u => userList.appendChild(buildUserCard(u.id, u)));
}

/* ---------------- AUTH ---------------- */

onAuthStateChanged(auth, async user => {
  if (!user) return location.href = "index.html";

  const docSnap = await getDoc(doc(db, "users", user.uid));
  currentAdminData = docSnap.data();

  if (!canAccessAdminPanel(currentAdminData)) {
    showStatus("No permission");
    return;
  }

  rebuildRoleOptions();
  loadUsers();
});

/* ---------------- CREATE USER ---------------- */

form.addEventListener("submit", async e => {
  e.preventDefault();

  const username = document.getElementById("discordUsername").value;
  const role = document.getElementById("role").value;
  const companyId = document.getElementById("companyId").value;
  const companyName = document.getElementById("companyName").value;

  const email = generateHiddenEmail(username, companyId);
  const password = getDefaultTempPassword();

  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);

  await setDoc(doc(db, "users", cred.user.uid), {
    discordUsername: username,
    role,
    companyId,
    companyName,
    active: true,
    mustChangePassword: true,
    createdAt: serverTimestamp()
  });

  await logAudit("CREATE_ACCOUNT", "user", cred.user.uid, {
    username,
    role,
    companyId
  });

  await signOut(secondaryAuth);
  showStatus("User created.");
  loadUsers();
});

/* ---------------- SEARCH ---------------- */

userSearchInput.addEventListener("input", e => {
  renderUsers(e.target.value);
});

/* ---------------- LOGOUT ---------------- */

document.getElementById("logoutButton").onclick = async () => {
  await signOut(auth);
  location.href = "index.html";
};