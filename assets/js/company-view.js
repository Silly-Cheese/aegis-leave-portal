import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

const companyTitle = document.getElementById("companyTitle");
const companyStaffList = document.getElementById("companyStaffList");
const companyLoaList = document.getElementById("companyLoaList");

const staffSearchInput = document.getElementById("staffSearchInput");
const loaSearchInput = document.getElementById("loaSearchInput");

const manualLoaPanel = document.getElementById("manualLoaPanel");
const manualLoaForm = document.getElementById("manualLoaForm");

let users = [];
let loas = [];
let currentUserData = null;

function canManualCreate() {
  if (!currentUserData) return false;
  if (currentUserData.accountType === "managing_company") {
    return ["owner", "account_manager"].includes(currentUserData.role);
  }
  if (currentUserData.accountType === "customer") {
    return ["company_owner", "loa_manager"].includes(currentUserData.role);
  }
  return false;
}

function buildUserCard(user) {
  const div = document.createElement("div");
  div.className = "loa-card";
  div.innerHTML = `
    <strong>${user.discordUsername}</strong>
    <p>${user.role}</p>
  `;
  return div;
}

function buildLoaCard(loa) {
  const div = document.createElement("div");
  div.className = "loa-card";
  div.innerHTML = `
    <strong>${loa.startDate} → ${loa.endDate}</strong>
    <p>${loa.reason}</p>
    <span>${loa.status}</span>
  `;
  return div;
}

function renderUsers(filter = "") {
  companyStaffList.innerHTML = "";
  users
    .filter(u => u.discordUsername.toLowerCase().includes(filter) || u.role.includes(filter))
    .forEach(u => companyStaffList.appendChild(buildUserCard(u)));
}

function renderLoas(filter = "") {
  companyLoaList.innerHTML = "";
  loas
    .filter(l =>
      l.reason.toLowerCase().includes(filter) ||
      l.status.includes(filter) ||
      l.requesterName.toLowerCase().includes(filter)
    )
    .forEach(l => companyLoaList.appendChild(buildLoaCard(l)));
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const userDoc = await getDoc(doc(db, "users", user.uid));
  currentUserData = userDoc.data();

  const companyDoc = await getDoc(doc(db, "companies", companyId));
  if (companyDoc.exists()) {
    companyTitle.textContent = companyDoc.data().companyName;
  }

  if (canManualCreate()) {
    manualLoaPanel.classList.remove("hidden");
  }

  const userSnap = await getDocs(collection(db, "users"));
  userSnap.forEach(doc => {
    const data = doc.data();
    if (data.companyId === companyId) users.push(data);
  });

  const loaSnap = await getDocs(collection(db, "loas"));
  loaSnap.forEach(doc => {
    const data = doc.data();
    if (data.companyId === companyId) loas.push(data);
  });

  renderUsers();
  renderLoas();
});

staffSearchInput.addEventListener("input", (e) => {
  renderUsers(e.target.value.toLowerCase());
});

loaSearchInput.addEventListener("input", (e) => {
  renderLoas(e.target.value.toLowerCase());
});

manualLoaForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  await addDoc(collection(db, "loas"), {
    requesterUid: document.getElementById("manualRequesterUid").value,
    requesterRole: document.getElementById("manualRequesterRole").value,
    requesterName: document.getElementById("manualRequesterName").value,
    companyId,
    startDate: document.getElementById("manualStartDate").value,
    endDate: document.getElementById("manualEndDate").value,
    reason: document.getElementById("manualReason").value,
    status: "approved",
    submittedAt: serverTimestamp()
  });

  location.reload();
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
