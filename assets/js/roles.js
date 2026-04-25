import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
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

const roleForm = document.getElementById("roleForm");
const roleList = document.getElementById("roleList");
const roleSearchInput = document.getElementById("roleSearchInput");
const statusBanner = document.getElementById("statusBanner");
const roleNameInput = document.getElementById("roleName");
const roleIdInput = document.getElementById("roleId");

let roles = [];
let currentUserData = null;

function showStatus(message) {
  statusBanner.textContent = message;
  statusBanner.classList.remove("hidden");
}

function clearStatus() {
  statusBanner.textContent = "";
  statusBanner.classList.add("hidden");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function canUseRoleBuilder() {
  if (!currentUserData) return false;
  return currentUserData.accountType === "managing_company" &&
    ["owner", "role_setter"].includes(String(currentUserData.role || "").toLowerCase());
}

async function logAudit(action, targetType, targetId, details = {}) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      action,
      actorUid: auth.currentUser?.uid || "unknown",
      actorName: currentUserData?.discordUsername || "Unknown",
      targetType,
      targetId,
      companyId: details.companyId || null,
      details,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Audit logging failed:", error);
  }
}

function buildRoleCard(role) {
  const div = document.createElement("div");
  div.className = "loa-card";

  div.innerHTML = `
    <strong>${role.roleName}</strong>
    <p>${role.roleId} • ${role.companyId}</p>
    <span>Status: ${role.active === false ? "Inactive" : "Active"}</span>
    <span>Approve LOAs: ${role.permissions?.canApproveLoas === true ? "Yes" : "No"}</span>
    <span>End Early: ${role.permissions?.canEndLoasEarly === true ? "Yes" : "No"}</span>
    <span>Create For Others: ${role.permissions?.canCreateLoasForOthers === true ? "Yes" : "No"}</span>
    <span>Delete LOAs: ${role.permissions?.canDeleteLoas === true ? "Yes" : "No"}</span>
  `;

  return div;
}

function renderRoles(filter = "") {
  roleList.innerHTML = "";
  const normalized = filter.toLowerCase();

  const filtered = roles.filter((role) => {
    const haystack = [
      role.roleName,
      role.roleId,
      role.companyId,
      JSON.stringify(role.permissions || {})
    ].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });

  if (!filtered.length) {
    roleList.innerHTML = `<div class="loa-card"><strong>No custom roles found</strong><p>No roles matched this view.</p></div>`;
    return;
  }

  filtered.forEach(r => roleList.appendChild(buildRoleCard(r)));
}

async function loadRoles() {
  roles = [];
  const snapshot = await getDocs(collection(db, "customRoles"));
  snapshot.forEach(docSnap => roles.push({ ...docSnap.data(), docId: docSnap.id }));
  renderRoles(roleSearchInput.value || "");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  clearStatus();

  currentUserData = await getUserWithPermissions(db, user.uid);
  if (!currentUserData) {
    showStatus("Your user record could not be found.");
    roleForm.classList.add("hidden");
    return;
  }

  if (!canUseRoleBuilder()) {
    showStatus("You do not have permission to use the Role Builder.");
    roleForm.classList.add("hidden");
  }

  await loadRoles();
});

roleNameInput.addEventListener("input", () => {
  if (!roleIdInput.value.trim()) {
    roleIdInput.value = slugify(roleNameInput.value);
  }
});

roleForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();

  if (!canUseRoleBuilder()) {
    showStatus("You do not have permission to create custom roles.");
    return;
  }

  const roleName = document.getElementById("roleName").value.trim();
  const roleId = slugify(document.getElementById("roleId").value || roleName);
  const companyId = slugify(document.getElementById("companyId").value);
  const roleStatus = document.getElementById("roleStatus").value;
  const roleNotes = document.getElementById("roleNotes").value.trim();

  if (!roleName || !roleId || !companyId) {
    showStatus("Role name, role ID, and company ID are required.");
    return;
  }

  const permissions = {
    canApproveLoas: document.getElementById("canApproveLoas").value === "true",
    canEndLoasEarly: document.getElementById("canEndLoasEarly").value === "true",
    canCreateLoasForOthers: document.getElementById("canCreateLoasForOthers").value === "true",
    canViewCompanyRecords: document.getElementById("canViewCompanyRecords").value === "true",
    canManageUsers: document.getElementById("canManageUsers").value === "true",
    canDeleteLoas: document.getElementById("canDeleteLoas").value === "true"
  };

  try {
    const newRole = await addDoc(collection(db, "customRoles"), {
      roleName,
      roleId,
      companyId,
      scope: "customer",
      active: roleStatus === "active",
      permissions,
      notes: roleNotes,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp()
    });

    await logAudit("CREATE_CUSTOM_ROLE", "customRole", newRole.id, { roleName, roleId, companyId, permissions });
    roleForm.reset();
    showStatus("Custom role created successfully.");
    await loadRoles();
  } catch (error) {
    console.error(error);
    showStatus("Failed to create custom role.");
  }
});

roleSearchInput.addEventListener("input", (e) => {
  renderRoles(e.target.value);
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
