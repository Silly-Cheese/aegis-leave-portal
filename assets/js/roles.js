import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

const roleForm = document.getElementById("roleForm");
const roleList = document.getElementById("roleList");
const roleSearchInput = document.getElementById("roleSearchInput");

let roles = [];

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildRoleCard(role) {
  const div = document.createElement("div");
  div.className = "loa-card";

  div.innerHTML = `
    <strong>${role.roleName}</strong>
    <p>${role.roleId} • ${role.companyId}</p>
    <span>Approve: ${role.permissions.canApproveLoas}</span>
    <span>End Early: ${role.permissions.canEndLoasEarly}</span>
    <span>Create For Others: ${role.permissions.canCreateLoasForOthers}</span>
  `;

  return div;
}

function renderRoles(filter = "") {
  roleList.innerHTML = "";
  const normalized = filter.toLowerCase();

  roles
    .filter(r => r.roleName.toLowerCase().includes(normalized) || r.companyId.includes(normalized))
    .forEach(r => roleList.appendChild(buildRoleCard(r)));
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const snapshot = await getDocs(collection(db, "customRoles"));
  snapshot.forEach(doc => roles.push(doc.data()));

  renderRoles();
});

roleForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const roleName = document.getElementById("roleName").value;
  const roleId = slugify(document.getElementById("roleId").value || roleName);
  const companyId = document.getElementById("companyId").value;

  const permissions = {
    canApproveLoas: document.getElementById("canApproveLoas").value === "true",
    canEndLoasEarly: document.getElementById("canEndLoasEarly").value === "true",
    canCreateLoasForOthers: document.getElementById("canCreateLoasForOthers").value === "true",
    canViewCompanyRecords: document.getElementById("canViewCompanyRecords").value === "true",
    canManageUsers: document.getElementById("canManageUsers").value === "true",
    canDeleteLoas: document.getElementById("canDeleteLoas").value === "true"
  };

  await addDoc(collection(db, "customRoles"), {
    roleName,
    roleId,
    companyId,
    permissions,
    createdAt: serverTimestamp()
  });

  location.reload();
});

roleSearchInput.addEventListener("input", (e) => {
  renderRoles(e.target.value);
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
