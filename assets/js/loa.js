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
  getDoc
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

function canApprove() {
  if (!currentUserData) return false;

  if (currentUserData.accountType === "managing_company") {
    return ["owner", "account_manager"].includes(currentUserData.role);
  }

  if (currentUserData.accountType === "customer") {
    return ["company_owner", "loa_manager"].includes(currentUserData.role);
  }

  return false;
}

function canEndEarly(loaData) {
  if (!currentUserData) return false;

  if (currentUserData.accountType === "managing_company") {
    if (["owner", "account_manager"].includes(currentUserData.role)) {
      return true;
    }
    return false;
  }

  if (currentUserData.accountType === "customer") {
    if (loaData.companyId !== currentUserData.companyId) return false;

    if (currentUserData.role === "company_owner") {
      return ["loa_manager", "staff"].includes(loaData.requesterRole);
    }

    if (currentUserData.role === "loa_manager") {
      return loaData.requesterRole === "staff";
    }
  }

  return false;
}

function canSeeApproval(loaData) {
  if (!canApprove()) return false;
  if (loaData.status !== "pending") return false;

  if (currentUserData.accountType === "managing_company") {
    return true;
  }

  if (currentUserData.accountType === "customer") {
    if (loaData.companyId !== currentUserData.companyId) return false;

    if (currentUserData.role === "company_owner") {
      return true;
    }

    if (currentUserData.role === "loa_manager") {
      return loaData.requesterRole === "staff";
    }
  }

  return false;
}

function buildLoaCard(data) {
  const div = document.createElement("div");
  div.className = "loa-card";

  div.innerHTML = `
    <strong>${data.startDate} → ${data.endDate}</strong>
    <p>${data.reason}</p>
    <span>Status: ${humanize(data.status)}</span>
    <span>Company: ${data.companyName || data.companyId}</span>
  `;

  return div;
}

function buildApprovalCard(id, data) {
  const div = document.createElement("div");
  div.className = "loa-card";

  div.innerHTML = `
    <strong>${data.startDate} → ${data.endDate}</strong>
    <p>${data.reason}</p>
    <span>Requester Role: ${humanize(data.requesterRole)}</span>
    <span>Company: ${data.companyName || data.companyId}</span>
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
    <strong>${data.startDate} → ${data.endDate}</strong>
    <p>${data.reason}</p>
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
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
      showStatus("Your user record could not be found.");
      return;
    }

    currentUserData = userDoc.data();

    await loadOwnLoas();
    await loadApprovals();
    await loadActiveManagedLoas();
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
    await addDoc(collection(db, "loas"), {
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

    loaForm.reset();
    showStatus("LOA submitted successfully.");
    await loadOwnLoas();
    await loadApprovals();
    await loadActiveManagedLoas();
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
    loaList.appendChild(buildLoaCard(docSnap.data()));
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
    if (data.status !== "approved") return;
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

        showStatus(`LOA ${action === "approve" ? "approved" : "denied"} successfully.`);
        await loadOwnLoas();
        await loadApprovals();
        await loadActiveManagedLoas();
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

        showStatus("LOA ended early successfully.");
        await loadOwnLoas();
        await loadApprovals();
        await loadActiveManagedLoas();
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
