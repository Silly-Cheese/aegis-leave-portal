import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, getDocs, serverTimestamp, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

let currentUser = null;
let currentUserData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  const userDoc = await getDoc(doc(db, "users", user.uid));
  currentUserData = userDoc.data();

  loadLOAs();
  loadApprovals();
});

loaForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  const reason = document.getElementById("reason").value;

  await addDoc(collection(db, "loas"), {
    requesterUid: currentUser.uid,
    requesterRole: currentUserData.role,
    companyId: currentUserData.companyId,
    accountType: currentUserData.accountType,
    startDate,
    endDate,
    reason,
    status: "pending",
    submittedAt: serverTimestamp()
  });

  loaForm.reset();
  loadLOAs();
});

async function loadLOAs() {
  loaList.innerHTML = "";

  const q = query(collection(db, "loas"), where("requesterUid", "==", currentUser.uid));
  const snapshot = await getDocs(q);

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const div = document.createElement("div");
    div.className = "loa-card";
    div.innerHTML = `
      <strong>${data.startDate} → ${data.endDate}</strong>
      <p>${data.reason}</p>
      <span>Status: ${data.status}</span>
    `;
    loaList.appendChild(div);
  });
}

async function loadApprovals() {
  approvalList.innerHTML = "";

  if (!canApprove()) {
    approvalsPanel.classList.add("hidden");
    return;
  }

  approvalsPanel.classList.remove("hidden");

  const q = query(collection(db, "loas"), where("companyId", "==", currentUserData.companyId));
  const snapshot = await getDocs(q);

  snapshot.forEach(docSnap => {
    const data = docSnap.data();

    if (data.status !== "pending") return;

    if (data.requesterUid === currentUser.uid && currentUserData.role !== "owner" && currentUserData.role !== "company_owner") return;

    const div = document.createElement("div");
    div.className = "loa-card";

    div.innerHTML = `
      <strong>${data.startDate} → ${data.endDate}</strong>
      <p>${data.reason}</p>
      <span>Status: ${data.status}</span>
      <div class="button-grid">
        <button class="primary-btn" data-id="${docSnap.id}" data-action="approve">Approve</button>
        <button class="secondary-btn" data-id="${docSnap.id}" data-action="deny">Deny</button>
      </div>
    `;

    approvalList.appendChild(div);
  });

  attachApprovalHandlers();
}

function canApprove() {
  if (currentUserData.accountType === "managing_company") {
    return ["owner", "management"].includes(currentUserData.role);
  }
  if (currentUserData.accountType === "customer") {
    return ["company_owner", "loa_manager"].includes(currentUserData.role);
  }
  return false;
}

function attachApprovalHandlers() {
  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      await updateDoc(doc(db, "loas", id), {
        status: action === "approve" ? "approved" : "denied",
        reviewedAt: serverTimestamp(),
        reviewedBy: currentUser.uid
      });

      loadApprovals();
      loadLOAs();
    });
  });
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
