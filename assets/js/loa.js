import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
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

const loaForm = document.getElementById("loaForm");
const loaList = document.getElementById("loaList");
const approvalList = document.getElementById("approvalList");
const approvalsPanel = document.getElementById("approvalsPanel");
const activeManagementPanel = document.getElementById("activeManagementPanel");
const activeLoaList = document.getElementById("activeLoaList");
const statusBanner = document.getElementById("statusBanner");

let currentUser = null;
let currentUserData = null;

function showStatus(message) {
  statusBanner.textContent = message;
  statusBanner.classList.remove("hidden");
}

function clearStatus() {
  statusBanner.textContent = "";
  statusBanner.classList.add("hidden");
}

function humanize(value) {
  return String(value || "—")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function logAudit(action, targetType, targetId, details = {}) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      action,
      actorUid: currentUser?.uid || "unknown",
      actorName: currentUserData?.discordUsername || "Unknown",
      targetType,
      targetId,
      companyId: details.companyId || currentUserData?.companyId || null,
      details,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Audit logging failed:", error);
  }
}

function canApprove() {
  return currentUserData?.permissions?.canApproveLoas === true;
}

function canDeleteLoa(loaData) {
  if (currentUserData?.permissions?.canDeleteLoas !== true) return false;
  if (currentUserData.accountType === "managing_company") return true;
  return loaData.companyId === currentUserData.companyId;
}

function canEndEarly(loaData) {
  if (currentUserData?.permissions?.canEndLoasEarly !== true) return false;
  if (loaData.status !== "approved") return false;
  if (currentUserData.accountType === "managing_company") return true;
  return loaData.companyId === currentUserData.companyId;
}

function canSeeApproval(loaData) {
  if (!canApprove()) return false;
  if (loaData.status !== "pending") return false;
  if (currentUserData.accountType === "managing_company") return true;
  return loaData.companyId === currentUserData.companyId;
}

function buildLoaCard(id, data) {
  const div = document.createElement("div");
  div.className = "loa-card";

  div.innerHTML = `
    <strong>${data.startDate || "—"} → ${data.endDate || "—"}</strong>
    <p>${data.reason || "No reason provided."}</p>
    <span>Status: ${humanize(data.status)}</span>
    <span>Company: ${data.companyName || data.companyId || "—"}</span>
  `;

  const actions = document.createElement("div");
  actions.className = "button-grid";

  if (canDeleteLoa(data)) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "secondary-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete LOA";
    deleteBtn.addEventListener("click", async () => {
      const confirmation = prompt("Type DELETE to permanently delete this LOA.");
      if (confirmation !== "DELETE") {
        showStatus("LOA deletion cancelled.");
        return;
      }

      try {
        await deleteDoc(doc(db, "loas", id));
        await logAudit("DELETE_LOA", "loa", id, { companyId: data.companyId, requesterName: data.requesterName || null });
        showStatus("LOA deleted successfully.");
        await refreshAll();
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

function buildApprovalCard(id, data) {
  const div = document.createElement("div");
  div.className = "loa-card";

  div.innerHTML = `
    <strong>${data.startDate || "—"} → ${data.endDate || "—"}</strong>
    <p>${data.reason || "No reason provided."}</p>
    <span>Requester: ${data.requesterName || data.requesterUid || "Unknown"}</span>
    <span>Requester Role: ${humanize(data.requesterRole)}</span>
    <span>Company: ${data.companyName || data.companyId || "—"}</span>
    <div class="button-grid">
      <button class="primary-btn" data-id="${id}" data-action="approve">Approve</button>
      <button class="secondary-btn" data-id="${id}" data-action="deny">Deny</button>
    </div>
  `;

  return div;
}

function buildActiveManagementCard(id, data) {
  const div = document.createElement("div");
  div.className = "loa-card";

  div.innerHTML = `
    <strong>${data.startDate || "—"} → ${data.endDate || "—"}</strong>
    <p>${data.reason || "No reason provided."}</p>
    <span>Requester: ${data.requesterName || data.requesterUid || "Unknown"}</span>
    <span>Requester Role: ${humanize(data.requesterRole)}</span>
    <span>Status: ${humanize(data.status)}</span>
    <div class="button-grid">
      <button class="secondary-btn" data-id="${id}" data-action="end-early">End LOA Early</button>
    </div>
  `;

  return div;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
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

    await refreshAll();
  } catch (error) {
    console.error(error);
    showStatus("Failed to load LOA data.");
  }
});

loaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();

  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  const reason = document.getElementById("reason").value.trim();

  if (!startDate || !endDate || !reason) {
    showStatus("All LOA fields are required.");
    return;
  }

  if (endDate < startDate) {
    showStatus("The end date cannot be before the start date.");
    return;
  }

  try {
    const newLoa = await addDoc(collection(db, "loas"), {
      requesterUid: currentUser.uid,
      requesterRole: currentUserData.role,
      requesterName: currentUserData.discordUsername,
      companyId: currentUserData.companyId,
      companyName: currentUserData.companyName,
      accountType: currentUserData.accountType,
      startDate,
      endDate,
      reason,
      status: "pending",
      submittedAt: serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
      endedEarlyAt: null,
      endedEarlyBy: null,
      endedEarlyReason: null,
      originalEndDate: null,
      actualEndDate: null
    });

    await logAudit("CREATE_LOA", "loa", newLoa.id, { companyId: currentUserData.companyId, requesterName: currentUserData.discordUsername });
    loaForm.reset();
    showStatus("LOA submitted successfully.");
    await refreshAll();
  } catch (error) {
    console.error(error);
    showStatus("Failed to submit LOA.");
  }
});

async function loadOwnLoas() {
  loaList.innerHTML = "";

  const q = query(collection(db, "loas"), where("requesterUid", "==", currentUser.uid));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    loaList.innerHTML = `<div class="loa-card"><strong>No LOAs yet</strong><p>You have not submitted any leave requests yet.</p></div>`;
    return;
  }

  snapshot.forEach((docSnap) => {
    loaList.appendChild(buildLoaCard(docSnap.id, docSnap.data()));
  });
}

async function loadApprovals() {
  approvalList.innerHTML = "";

  if (!canApprove()) {
    approvalsPanel.classList.add("hidden");
    return;
  }

  approvalsPanel.classList.remove("hidden");

  const snapshot = await getDocs(collection(db, "loas"));
  let found = false;

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (!canSeeApproval(data)) return;
    found = true;
    approvalList.appendChild(buildApprovalCard(docSnap.id, data));
  });

  if (!found) {
    approvalList.innerHTML = `<div class="loa-card"><strong>No pending approvals</strong><p>There are currently no leave requests awaiting your review.</p></div>`;
  }

  attachApprovalHandlers();
}

async function loadActiveManagedLoas() {
  activeLoaList.innerHTML = "";

  const snapshot = await getDocs(collection(db, "loas"));
  let found = false;

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (!canEndEarly(data)) return;
    found = true;
    activeLoaList.appendChild(buildActiveManagementCard(docSnap.id, data));
  });

  if (!found) {
    activeManagementPanel.classList.add("hidden");
    return;
  }

  activeManagementPanel.classList.remove("hidden");
  attachEndEarlyHandlers();
}

async function refreshAll() {
  await loadOwnLoas();
  await loadApprovals();
  await loadActiveManagedLoas();
}

function attachApprovalHandlers() {
  document.querySelectorAll('[data-action="approve"], [data-action="deny"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      try {
        await updateDoc(doc(db, "loas", id), {
          status: action === "approve" ? "approved" : "denied",
          reviewedAt: serverTimestamp(),
          reviewedBy: currentUser.uid
        });

        await logAudit(action === "approve" ? "APPROVE_LOA" : "DENY_LOA", "loa", id, { reviewer: currentUserData.discordUsername });
        showStatus(`LOA ${action === "approve" ? "approved" : "denied"} successfully.`);
        await refreshAll();
      } catch (error) {
        console.error(error);
        showStatus("Failed to update LOA.");
      }
    });
  });
}

function attachEndEarlyHandlers() {
  document.querySelectorAll('[data-action="end-early"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const reason = prompt("Enter a reason for ending this LOA early:");

      if (!reason || !reason.trim()) {
        showStatus("An early-end reason is required.");
        return;
      }

      const today = new Date().toISOString().split("T")[0];

      try {
        const loaRef = doc(db, "loas", id);
        const loaSnap = await getDoc(loaRef);

        if (!loaSnap.exists()) {
          showStatus("LOA record not found.");
          return;
        }

        const loaData = loaSnap.data();

        await updateDoc(loaRef, {
          status: "ended_early",
          originalEndDate: loaData.endDate,
          actualEndDate: today,
          endedEarlyAt: serverTimestamp(),
          endedEarlyBy: currentUser.uid,
          endedEarlyReason: reason.trim()
        });

        await logAudit("END_LOA_EARLY", "loa", id, { reason: reason.trim(), requesterName: loaData.requesterName || null });
        showStatus("LOA ended early successfully.");
        await refreshAll();
      } catch (error) {
        console.error(error);
        showStatus("Failed to end LOA early.");
      }
    });
  });
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
