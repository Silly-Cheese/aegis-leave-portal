import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
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

const permissionList = document.getElementById("permissionList");
const roleBadgeRow = document.getElementById("roleBadgeRow");
const statusBanner = document.getElementById("statusBanner");

function showStatus(message) {
  if (!statusBanner) return;
  statusBanner.textContent = message;
  statusBanner.classList.remove("hidden");
}

function clearStatus() {
  if (!statusBanner) return;
  statusBanner.textContent = "";
  statusBanner.classList.add("hidden");
}

function addPermission(text) {
  const li = document.createElement("li");
  li.textContent = text;
  permissionList.appendChild(li);
}

function addBadge(text, className = "badge-neutral") {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`;
  badge.textContent = text;
  roleBadgeRow.appendChild(badge);
}

function setMetric(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function humanize(value) {
  return String(value || "—")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function applyCommonStats(data) {
  document.getElementById("welcomeHeading").textContent = `Welcome, ${data.discordUsername || "User"}`;
  document.getElementById("welcomeMeta").textContent = `${humanize(data.role)} • ${humanize(data.accountType)}`;
  document.getElementById("statAccountType").textContent = humanize(data.accountType);
  document.getElementById("statRole").textContent = humanize(data.role);
  document.getElementById("statCompany").textContent = data.companyName || data.companyId || "—";
  document.getElementById("statStatus").textContent = data.active === false ? "Inactive" : "Active";
}

function renderPermissionsFromFlags(data) {
  const permissions = data.permissions || {};

  permissionList.innerHTML = "";
  roleBadgeRow.innerHTML = "";

  addBadge(humanize(data.accountType), data.accountType === "managing_company" ? "badge-info" : "badge-neutral");
  addBadge(humanize(data.role), "badge-success");

  if (permissions.canManageUsers) addPermission("Can manage user accounts within permitted scope.");
  if (permissions.canManageCompanies) addPermission("Can create and manage company records.");
  if (permissions.canApproveLoas) addPermission("Can approve or deny LOA requests within permitted scope.");
  if (permissions.canEndLoasEarly) addPermission("Can end approved LOAs early within permitted scope.");
  if (permissions.canCreateLoasForOthers) addPermission("Can manually create LOAs for other users within permitted scope.");
  if (permissions.canDeleteLoas) addPermission("Can delete LOA records within permitted scope.");
  if (permissions.canCreateCustomRoles) addPermission("Can create customer-company custom roles.");
  if (permissions.canViewAuditLogs) addPermission("Can view audit logs.");
  if (permissions.canViewCompanyRecords) addPermission("Can view company and personnel records within permitted scope.");

  if (!permissionList.children.length) {
    addPermission("Can access the portal and view role-appropriate information.");
  }

  setMetric("metricAccounts", permissions.canManageUsers ? "Account management available" : "Limited account access");
  setMetric("metricLoa", permissions.canApproveLoas || permissions.canCreateLoasForOthers ? "LOA operations available" : "Request and view own LOAs");
  setMetric("metricRecords", permissions.canViewCompanyRecords ? "Records access available" : "Limited record access");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  clearStatus();

  try {
    const data = await getUserWithPermissions(db, user.uid);
    if (!data) {
      showStatus("Your user record could not be found.");
      return;
    }

    applyCommonStats(data);
    renderPermissionsFromFlags(data);

    if (data.active === false) {
      showStatus("Your account is currently inactive.");
    }
  } catch (error) {
    console.error(error);
    showStatus("Failed to load dashboard data.");
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
