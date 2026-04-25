import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
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

const urlParams = new URLSearchParams(window.location.search);
const companyId = urlParams.get("companyId");

const statusBanner = document.getElementById("statusBanner");
const companyTitle = document.getElementById("companyTitle");
const companySubtitle = document.getElementById("companySubtitle");
const companyStaffList = document.getElementById("companyStaffList");
const companyLoaList = document.getElementById("companyLoaList");
const staffSearchInput = document.getElementById("staffSearchInput");
const loaSearchInput = document.getElementById("loaSearchInput");
const loaStatusFilter = document.getElementById("loaStatusFilter");
const manualLoaPanel = document.getElementById("manualLoaPanel");
const manualLoaForm = document.getElementById("manualLoaForm");
const manualRequesterSelect = document.getElementById("manualRequesterSelect");
const companySummaryList = document.getElementById("companySummaryList");

let users = [];
let loas = [];
let companyData = null;
let currentUser = null;
let currentUserData = null;

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

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function humanize(value) {
  return String(value || "—").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function canManualCreate() {
  if (!currentUserData?.permissions?.canCreateLoasForOthers) return false;
  if (currentUserData.accountType === "managing_company") return true;
  return currentUserData.companyId === companyId;
}

function canDeleteLoa(loa) {
  if (!currentUserData?.permissions?.canDeleteLoas) return false;
  if (currentUserData.accountType === "managing_company") return true;
  return currentUserData.companyId === loa.companyId;
}

function canEndLoaEarly(loa) {
  if (!currentUserData?.permissions?.canEndLoasEarly) return false;
  if (loa.status !== "approved") return false;
  if (currentUserData.accountType === "managing_company") return true;
  return currentUserData.companyId === loa.companyId;
}

async function logAudit(action, targetType, targetId, details = {}) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      action,
      actorUid: currentUser?.uid || "unknown",
      actorName: currentUserData?.discordUsername || "Unknown",
      targetType,
      targetId,
      companyId,
      details,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Audit logging failed:", error);
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getStats() {
  const today = new Date().toISOString().split("T")[0];
  return {
    totalStaff: users.length,
    activeStaff: users.filter(u => u.active !== false).length,
    inactiveStaff: users.filter(u => u.active === false).length,
    totalLoas: loas.length,
    pending: loas.filter(l => l.status === "pending").length,
    approvedTotal: loas.filter(l => l.status === "approved").length,
    denied: loas.filter(l => l.status === "denied").length,
    endedEarly: loas.filter(l => l.status === "ended_early").length,
    approvedActive: loas.filter(l => l.status === "approved" && l.startDate <= today && l.endDate >= today).length,
    staffWithLoas: new Set(loas.map(l => l.requesterUid).filter(Boolean)).size
  };
}

function updateStats() {
  const stats = getStats();
  setText("companyStaffCount", String(stats.totalStaff));
  setText("companyActiveStaffCount", String(stats.activeStaff));
  setText("companyLoaCount", String(stats.totalLoas));
  setText("companyPendingCount", String(stats.pending));
  setText("companyApprovedCount", String(stats.approvedActive));
  setText("companyApprovedTotalCount", String(stats.approvedTotal));
  setText("companyDeniedCount", String(stats.denied));
  setText("companyEndedEarlyCount", String(stats.endedEarly));
  renderSummary(stats);
}

function renderSummary(stats) {
  if (!companySummaryList) return;
  companySummaryList.innerHTML = `
    <div class="loa-card">
      <strong>${companyData?.companyName || companyId}</strong>
      <p>${humanize(companyData?.companyType)} • ${companyId}</p>
      <span>Active Staff: ${stats.activeStaff}</span>
      <span>Inactive Staff: ${stats.inactiveStaff}</span>
      <span>Staff With LOA History: ${stats.staffWithLoas}</span>
      <span>Pending / Approved / Denied / Ended Early: ${stats.pending} / ${stats.approvedTotal} / ${stats.denied} / ${stats.endedEarly}</span>
    </div>
  `;
}

function populateManualRequesterSelect() {
  if (!manualRequesterSelect) return;
  manualRequesterSelect.innerHTML = `<option value="">Select a company user</option>`;
  users
    .filter(user => user.active !== false)
    .sort((a, b) => String(a.discordUsername || "").localeCompare(String(b.discordUsername || "")))
    .forEach(user => {
      const option = document.createElement("option");
      option.value = user.docId;
      option.textContent = `${user.discordUsername || "Unnamed User"} — ${humanize(user.role)}`;
      option.dataset.role = user.role || "staff";
      option.dataset.name = user.discordUsername || "Unnamed User";
      manualRequesterSelect.appendChild(option);
    });
}

function buildUserCard(user) {
  const div = document.createElement("div");
  div.className = "loa-card";
  const userLoas = loas.filter(loa => loa.requesterUid === user.docId);

  div.innerHTML = `
    <strong>${user.discordUsername || "Unnamed User"}</strong>
    <p>${humanize(user.role)} • ${humanize(user.accountType)}</p>
    <span>Status: ${user.active === false ? "Inactive" : "Active"}</span>
    <span>LOA Records: ${userLoas.length}</span>
  `;

  const actions = document.createElement("div");
  actions.className = "button-grid";

  const profileBtn = document.createElement("button");
  profileBtn.className = "primary-btn";
  profileBtn.type = "button";
  profileBtn.textContent = "View Profile";
  profileBtn.addEventListener("click", () => {
    window.location.href = `user-view.html?uid=${encodeURIComponent(user.docId)}`;
  });
  actions.appendChild(profileBtn);

  div.appendChild(actions);
  return div;
}

function buildLoaCard(loa) {
  const div = document.createElement("div");
  div.className = "loa-card";
  div.innerHTML = `
    <strong>${loa.startDate || "—"} → ${loa.endDate || "—"}</strong>
    <p>${loa.reason || "No reason provided."}</p>
    <span>Requester: ${loa.requesterName || loa.requesterUid || "Unknown"}</span>
    <span>Status: ${humanize(loa.status)}</span>
    <span>Manual: ${loa.manuallyCreated ? "Yes" : "No"}</span>
  `;

  const actions = document.createElement("div");
  actions.className = "button-grid";

  if (canEndLoaEarly(loa)) {
    const endBtn = document.createElement("button");
    endBtn.className = "secondary-btn";
    endBtn.type = "button";
    endBtn.textContent = "End Early";
    endBtn.addEventListener("click", async () => {
      const reason = prompt("Enter the reason for ending this LOA early:");
      if (!reason || !reason.trim()) {
        showStatus("An early-end reason is required.");
        return;
      }
      try {
        const today = new Date().toISOString().split("T")[0];
        await updateDoc(doc(db, "loas", loa.docId), {
          status: "ended_early",
          originalEndDate: loa.endDate || null,
          actualEndDate: today,
          endedEarlyAt: serverTimestamp(),
          endedEarlyBy: currentUser.uid,
          endedEarlyReason: reason.trim()
        });
        await logAudit("END_LOA_EARLY", "loa", loa.docId, { reason: reason.trim(), requesterName: loa.requesterName || null });
        showStatus("LOA ended early successfully.");
        await loadCompanyData();
      } catch (error) {
        console.error(error);
        showStatus("Failed to end LOA early.");
      }
    });
    actions.appendChild(endBtn);
  }

  if (canDeleteLoa(loa)) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "secondary-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete LOA";
    deleteBtn.addEventListener("click", async () => {
      const confirmation = prompt("Type DELETE to permanently delete this LOA record.");
      if (confirmation !== "DELETE") {
        showStatus("LOA deletion cancelled.");
        return;
      }
      try {
        await deleteDoc(doc(db, "loas", loa.docId));
        await logAudit("DELETE_LOA", "loa", loa.docId, { requesterName: loa.requesterName || null, status: loa.status || null });
        showStatus("LOA deleted successfully.");
        await loadCompanyData();
      } catch (error) {
        console.error(error);
        showStatus("Failed to delete LOA.");
      }
    });
    actions.appendChild(deleteBtn);
  }

  if (actions.children.length) div.appendChild(actions);
  return div;
}

function renderUsers(filter = "") {
  companyStaffList.innerHTML = "";
  const normalized = filter.trim().toLowerCase();
  const filtered = users.filter(u => [u.discordUsername, u.role, u.accountType, u.active === false ? "inactive" : "active"].join(" ").toLowerCase().includes(normalized));

  if (!filtered.length) {
    companyStaffList.innerHTML = `<div class="loa-card"><strong>No matching users</strong><p>No users matched your search.</p></div>`;
    return;
  }
  filtered.forEach(u => companyStaffList.appendChild(buildUserCard(u)));
}

function renderLoas(filter = "") {
  companyLoaList.innerHTML = "";
  const normalized = filter.trim().toLowerCase();
  const statusFilter = loaStatusFilter?.value || "all";

  const filtered = loas.filter(l => {
    const matchesText = [l.reason, l.status, l.requesterName, l.requesterRole].join(" ").toLowerCase().includes(normalized);
    const matchesStatus = statusFilter === "all" || l.status === statusFilter;
    return matchesText && matchesStatus;
  });

  if (!filtered.length) {
    companyLoaList.innerHTML = `<div class="loa-card"><strong>No matching LOAs</strong><p>No leave records matched your search or filter.</p></div>`;
    return;
  }
  filtered.forEach(l => companyLoaList.appendChild(buildLoaCard(l)));
}

async function loadCompanyData() {
  users = [];
  loas = [];

  const userSnap = await getDocs(collection(db, "users"));
  userSnap.forEach(docSnap => {
    const data = docSnap.data();
    if (data.companyId === companyId) users.push({ ...data, docId: docSnap.id });
  });

  const loaSnap = await getDocs(collection(db, "loas"));
  loaSnap.forEach(docSnap => {
    const data = docSnap.data();
    if (data.companyId === companyId) loas.push({ ...data, docId: docSnap.id });
  });

  updateStats();
  populateManualRequesterSelect();
  renderUsers(staffSearchInput.value || "");
  renderLoas(loaSearchInput.value || "");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  if (!companyId) {
    window.location.href = "companies.html";
    return;
  }

  currentUser = user;
  clearStatus();

  try {
    currentUserData = await getUserWithPermissions(db, user.uid);
    if (!currentUserData) {
      showStatus("Your user record could not be found.");
      return;
    }

    const companyDoc = await getDoc(doc(db, "companies", companyId));
    if (!companyDoc.exists()) {
      showStatus("Company record not found.");
      return;
    }
    companyData = companyDoc.data();
    companyTitle.textContent = companyData.companyName || companyId;
    if (companySubtitle) companySubtitle.textContent = `${humanize(companyData.companyType)} • ${companyId}`;

    if (canManualCreate()) manualLoaPanel.classList.remove("hidden");
    await loadCompanyData();
  } catch (error) {
    console.error(error);
    showStatus("Failed to load company records.");
  }
});

staffSearchInput.addEventListener("input", (e) => renderUsers(e.target.value));
loaSearchInput.addEventListener("input", (e) => renderLoas(e.target.value));
if (loaStatusFilter) loaStatusFilter.addEventListener("change", () => renderLoas(loaSearchInput.value || ""));

manualLoaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();

  const selectedOption = manualRequesterSelect?.selectedOptions?.[0];
  const requesterUid = manualRequesterSelect?.value;
  const requesterRole = selectedOption?.dataset?.role || "staff";
  const requesterName = selectedOption?.dataset?.name || "Unknown User";
  const startDate = document.getElementById("manualStartDate").value;
  const endDate = document.getElementById("manualEndDate").value;

  if (!requesterUid) {
    showStatus("Select a requester before creating a manual LOA.");
    return;
  }

  if (endDate < startDate) {
    showStatus("The end date cannot be before the start date.");
    return;
  }

  try {
    const payload = {
      requesterUid,
      requesterRole: normalizeRole(requesterRole),
      requesterName,
      companyId,
      companyName: companyData?.companyName || companyId,
      accountType: companyData?.companyType || "customer",
      startDate,
      endDate,
      reason: document.getElementById("manualReason").value.trim(),
      status: "approved",
      submittedAt: serverTimestamp(),
      reviewedAt: serverTimestamp(),
      reviewedBy: currentUser.uid,
      manuallyCreated: true,
      createdBy: currentUser.uid
    };

    const newLoa = await addDoc(collection(db, "loas"), payload);
    await logAudit("CREATE_MANUAL_LOA", "loa", newLoa.id, { requesterName: payload.requesterName, companyId });
    manualLoaForm.reset();
    showStatus("Manual LOA created successfully.");
    await loadCompanyData();
  } catch (error) {
    console.error(error);
    showStatus("Failed to create manual LOA.");
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
