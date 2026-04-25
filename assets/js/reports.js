import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
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

const statusBanner = document.getElementById("statusBanner");
const companyFilter = document.getElementById("companyFilter");
const statusFilter = document.getElementById("statusFilter");
const startDateFilter = document.getElementById("startDateFilter");
const endDateFilter = document.getElementById("endDateFilter");
const searchFilter = document.getElementById("searchFilter");
const loaReportList = document.getElementById("loaReportList");
const userReportList = document.getElementById("userReportList");
const exportLoasButton = document.getElementById("exportLoasButton");
const exportUsersButton = document.getElementById("exportUsersButton");
const clearFiltersButton = document.getElementById("clearFiltersButton");

let currentUserData = null;
let companies = [];
let users = [];
let loas = [];

function showStatus(message) {
  statusBanner.textContent = message;
  statusBanner.classList.remove("hidden");
}

function clearStatus() {
  statusBanner.textContent = "";
  statusBanner.classList.add("hidden");
}

function humanize(value) {
  return String(value || "—").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function inScopeByCompany(companyId) {
  if (!currentUserData) return false;
  if (currentUserData.accountType === "managing_company") return true;
  return companyId === currentUserData.companyId;
}

function canViewReports() {
  if (!currentUserData) return false;
  if (currentUserData.accountType === "managing_company") return currentUserData.permissions?.canViewCompanyRecords === true;
  return currentUserData.permissions?.canViewCompanyRecords === true;
}

function buildCompanyOptions() {
  companyFilter.innerHTML = `<option value="all">All companies</option>`;
  companies
    .filter(company => inScopeByCompany(company.companyId))
    .sort((a, b) => String(a.companyName || "").localeCompare(String(b.companyName || "")))
    .forEach(company => {
      const option = document.createElement("option");
      option.value = company.companyId;
      option.textContent = company.companyName || company.companyId;
      companyFilter.appendChild(option);
    });

  if (currentUserData.accountType === "customer") {
    companyFilter.value = currentUserData.companyId;
    companyFilter.disabled = true;
  }
}

function getFilteredLoas() {
  const selectedCompany = companyFilter.value;
  const selectedStatus = statusFilter.value;
  const startFrom = startDateFilter.value;
  const endThrough = endDateFilter.value;
  const search = searchFilter.value.trim().toLowerCase();

  return loas.filter(loa => {
    if (!inScopeByCompany(loa.companyId)) return false;
    if (selectedCompany !== "all" && loa.companyId !== selectedCompany) return false;
    if (selectedStatus !== "all" && loa.status !== selectedStatus) return false;
    if (startFrom && loa.startDate < startFrom) return false;
    if (endThrough && loa.endDate > endThrough) return false;

    const haystack = [
      loa.requesterName,
      loa.requesterRole,
      loa.companyName,
      loa.companyId,
      loa.reason,
      loa.status,
      loa.startDate,
      loa.endDate
    ].join(" ").toLowerCase();

    return haystack.includes(search);
  });
}

function getFilteredUsers() {
  const selectedCompany = companyFilter.value;
  const search = searchFilter.value.trim().toLowerCase();

  return users.filter(user => {
    if (!inScopeByCompany(user.companyId)) return false;
    if (selectedCompany !== "all" && user.companyId !== selectedCompany) return false;

    const haystack = [
      user.discordUsername,
      user.role,
      user.accountType,
      user.companyName,
      user.companyId,
      user.active === false ? "inactive" : "active"
    ].join(" ").toLowerCase();

    return haystack.includes(search);
  });
}

function updateStats(filteredLoas, filteredUsers) {
  const today = new Date().toISOString().split("T")[0];
  const visibleCompanies = companies.filter(company => inScopeByCompany(company.companyId));
  const activeLoas = filteredLoas.filter(loa => loa.status === "approved" && loa.startDate <= today && loa.endDate >= today);

  setText("statCompanies", String(visibleCompanies.length));
  setText("statUsers", String(filteredUsers.length));
  setText("statLoas", String(filteredLoas.length));
  setText("statActiveLoas", String(activeLoas.length));
}

function buildLoaCard(loa) {
  const div = document.createElement("div");
  div.className = "loa-card";
  div.innerHTML = `
    <strong>${loa.startDate || "—"} → ${loa.endDate || "—"}</strong>
    <p>${loa.reason || "No reason provided."}</p>
    <span>Requester: ${loa.requesterName || loa.requesterUid || "Unknown"}</span>
    <span>Status: ${humanize(loa.status)}</span>
    <span>Company: ${loa.companyName || loa.companyId || "—"}</span>
  `;
  return div;
}

function buildUserCard(user) {
  const div = document.createElement("div");
  div.className = "loa-card";
  div.innerHTML = `
    <strong>${user.discordUsername || "Unnamed User"}</strong>
    <p>${humanize(user.role)} • ${humanize(user.accountType)}</p>
    <span>Company: ${user.companyName || user.companyId || "—"}</span>
    <span>Status: ${user.active === false ? "Inactive" : "Active"}</span>
  `;

  const actions = document.createElement("div");
  actions.className = "button-grid";
  const viewBtn = document.createElement("button");
  viewBtn.className = "primary-btn";
  viewBtn.type = "button";
  viewBtn.textContent = "View Profile";
  viewBtn.addEventListener("click", () => {
    window.location.href = `user-view.html?uid=${encodeURIComponent(user.docId)}`;
  });
  actions.appendChild(viewBtn);
  div.appendChild(actions);
  return div;
}

function renderReports() {
  const filteredLoas = getFilteredLoas();
  const filteredUsers = getFilteredUsers();

  updateStats(filteredLoas, filteredUsers);

  loaReportList.innerHTML = "";
  if (!filteredLoas.length) {
    loaReportList.innerHTML = `<div class="loa-card"><strong>No LOAs found</strong><p>No leave records matched your filters.</p></div>`;
  } else {
    filteredLoas.forEach(loa => loaReportList.appendChild(buildLoaCard(loa)));
  }

  userReportList.innerHTML = "";
  if (!filteredUsers.length) {
    userReportList.innerHTML = `<div class="loa-card"><strong>No users found</strong><p>No user records matched your filters.</p></div>`;
  } else {
    filteredUsers.forEach(user => userReportList.appendChild(buildUserCard(user)));
  }
}

function escapeCsv(value) {
  const raw = value === undefined || value === null ? "" : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportLoas() {
  const filtered = getFilteredLoas();
  const rows = [["Requester", "Requester Role", "Company", "Company ID", "Start Date", "End Date", "Status", "Reason", "Manual"]];
  filtered.forEach(loa => rows.push([
    loa.requesterName || loa.requesterUid || "",
    loa.requesterRole || "",
    loa.companyName || "",
    loa.companyId || "",
    loa.startDate || "",
    loa.endDate || "",
    loa.status || "",
    loa.reason || "",
    loa.manuallyCreated ? "Yes" : "No"
  ]));
  downloadCsv("aegis-loa-report.csv", rows);
}

function exportUsers() {
  const filtered = getFilteredUsers();
  const rows = [["Discord Username", "Role", "Account Type", "Company", "Company ID", "Status", "Login Key"]];
  filtered.forEach(user => rows.push([
    user.discordUsername || "",
    user.role || "",
    user.accountType || "",
    user.companyName || "",
    user.companyId || "",
    user.active === false ? "Inactive" : "Active",
    user.loginKey || ""
  ]));
  downloadCsv("aegis-user-report.csv", rows);
}

async function loadData() {
  companies = [];
  users = [];
  loas = [];

  const companySnap = await getDocs(collection(db, "companies"));
  companySnap.forEach(docSnap => companies.push({ ...docSnap.data(), docId: docSnap.id }));

  const userSnap = await getDocs(collection(db, "users"));
  userSnap.forEach(docSnap => users.push({ ...docSnap.data(), docId: docSnap.id }));

  const loaSnap = await getDocs(collection(db, "loas"));
  loaSnap.forEach(docSnap => loas.push({ ...docSnap.data(), docId: docSnap.id }));

  buildCompanyOptions();
  renderReports();
}

function bindFilters() {
  [companyFilter, statusFilter, startDateFilter, endDateFilter, searchFilter].forEach(input => {
    input.addEventListener("input", renderReports);
    input.addEventListener("change", renderReports);
  });

  exportLoasButton.addEventListener("click", exportLoas);
  exportUsersButton.addEventListener("click", exportUsers);
  clearFiltersButton.addEventListener("click", () => {
    if (currentUserData.accountType !== "customer") companyFilter.value = "all";
    statusFilter.value = "all";
    startDateFilter.value = "";
    endDateFilter.value = "";
    searchFilter.value = "";
    renderReports();
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  clearStatus();

  try {
    currentUserData = await getUserWithPermissions(db, user.uid);
    if (!currentUserData || !canViewReports()) {
      showStatus("You do not have permission to view reports.");
      return;
    }

    bindFilters();
    await loadData();
  } catch (error) {
    console.error(error);
    showStatus("Failed to load reports.");
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
