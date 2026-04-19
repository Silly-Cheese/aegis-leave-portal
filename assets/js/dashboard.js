import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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
  document.getElementById("welcomeHeading").textContent = `Welcome, ${data.discordUsername}`;
  document.getElementById("welcomeMeta").textContent = `${humanize(data.role)} • ${humanize(data.accountType)}`;
  document.getElementById("statAccountType").textContent = humanize(data.accountType);
  document.getElementById("statRole").textContent = humanize(data.role);
  document.getElementById("statCompany").textContent = data.companyName || data.companyId || "—";
  document.getElementById("statStatus").textContent = data.active === false ? "Inactive" : "Active";
}

function renderAegisPermissions(role) {
  if (role === "owner") {
    addBadge("Aegis", "badge-info");
    addBadge("Full Control", "badge-success");
    addBadge("System Administration", "badge-neutral");

    addPermission("Full control over users, companies, LOAs, and system settings.");
    addPermission("Can create, edit, disable, and delete accounts across Aegis and customer companies.");
    addPermission("Can approve, deny, edit, delete, and end LOAs early across the full system.");
    addPermission("Can access audit logs and all company records.");

    setMetric("metricAccounts", "Full system account control");
    setMetric("metricLoa", "Full LOA control");
    setMetric("metricRecords", "All records and audit access");
    return;
  }

  if (role === "account_manager") {
    addBadge("Aegis", "badge-info");
    addBadge("Operational Authority", "badge-success");
    addBadge("Cross-Company Control", "badge-neutral");

    addPermission("Can add, edit, and delete people from the system.");
    addPermission("Can add, edit, and delete customer companies.");
    addPermission("Can add, edit, delete, approve, deny, and end LOAs early for Aegis and customer companies.");
    addPermission("Can manage customer and internal account operations.");

    setMetric("metricAccounts", "Cross-company account control");
    setMetric("metricLoa", "Approve, edit, and end early");
    setMetric("metricRecords", "Broad customer and Aegis visibility");
    return;
  }

  if (role === "community_manager") {
    addBadge("Aegis", "badge-info");
    addBadge("Internal Management", "badge-warning");
    addBadge("Aegis Only", "badge-neutral");

    addPermission("Can add people to the system within Aegis only.");
    addPermission("Cannot manage customer companies.");
    addPermission("Supports internal Aegis personnel management.");
    addPermission("Can assist with internal operational structure.");

    setMetric("metricAccounts", "Aegis-only people creation");
    setMetric("metricLoa", "Limited internal workflow");
    setMetric("metricRecords", "Internal-oriented visibility");
    return;
  }

  if (role === "staff") {
    addBadge("Aegis", "badge-info");
    addBadge("Records Access", "badge-neutral");
    addBadge("Staff Role", "badge-warning");

    addPermission("Can request LOAs.");
    addPermission("Can pull up customer records.");
    addPermission("Can view their own role-based information and workflow access.");
    addPermission("Cannot perform broad administrative control.");

    setMetric("metricAccounts", "No broad account control");
    setMetric("metricLoa", "Request own LOAs");
    setMetric("metricRecords", "Customer records access");
    return;
  }

  addBadge("Aegis", "badge-info");
  addPermission("Aegis role loaded, but no exact rule profile was found.");
  setMetric("metricAccounts", "Custom role");
  setMetric("metricLoa", "Custom role");
  setMetric("metricRecords", "Custom role");
}

function renderCustomerPermissions(role) {
  if (role === "company_owner") {
    addBadge("Customer", "badge-info");
    addBadge("Company Oversight", "badge-success");

    addPermission("Can manage customer-side people.");
    addPermission("Can approve LOAs.");
    addPermission("Can end subordinate LOAs early.");
    addPermission("Can oversee company-level leave and account workflows.");

    setMetric("metricAccounts", "Customer company management");
    setMetric("metricLoa", "Approve and end subordinate LOAs early");
    setMetric("metricRecords", "Customer company visibility");
    return;
  }

  if (role === "loa_manager") {
    addBadge("Customer", "badge-info");
    addBadge("LOA Operations", "badge-warning");

    addPermission("Can manage customer leave workflows.");
    addPermission("Can approve allowed LOAs.");
    addPermission("Can end subordinate staff LOAs early.");
    addPermission("Can support company leave administration.");

    setMetric("metricAccounts", "Limited customer account role");
    setMetric("metricLoa", "LOA management and early end");
    setMetric("metricRecords", "Customer leave records");
    return;
  }

  if (role === "staff") {
    addBadge("Customer", "badge-info");
    addBadge("Staff Role", "badge-neutral");

    addPermission("Can request LOAs.");
    addPermission("Can view their own LOAs.");
    addPermission("Can access role-appropriate leave workflow.");
    addPermission("Cannot perform administrative company actions.");

    setMetric("metricAccounts", "No admin control");
    setMetric("metricLoa", "Request and view own LOAs");
    setMetric("metricRecords", "Own leave record visibility");
    return;
  }

  addBadge("Customer", "badge-info");
  addPermission("Customer role loaded, but no exact rule profile was found.");
  setMetric("metricAccounts", "Custom role");
  setMetric("metricLoa", "Custom role");
  setMetric("metricRecords", "Custom role");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  clearStatus();

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));

    if (!userDoc.exists()) {
      showStatus("Your user record could not be found.");
      return;
    }

    const data = userDoc.data();

    applyCommonStats(data);

    permissionList.innerHTML = "";
    roleBadgeRow.innerHTML = "";

    if (data.active === false) {
      showStatus("Your account is currently inactive.");
    }

    if (data.accountType === "managing_company") {
      renderAegisPermissions(data.role);
    } else if (data.accountType === "customer") {
      renderCustomerPermissions(data.role);
    } else {
      addBadge("Unknown Account Type", "badge-danger");
      addPermission("This account has an unknown account type.");
      setMetric("metricAccounts", "Unknown");
      setMetric("metricLoa", "Unknown");
      setMetric("metricRecords", "Unknown");
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
