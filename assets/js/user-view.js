import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
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

const params = new URLSearchParams(window.location.search);
const targetUid = params.get("uid");

const statusBanner = document.getElementById("statusBanner");
const loaSearchInput = document.getElementById("loaSearchInput");
const userLoas = document.getElementById("userLoas");
const userDetails = document.getElementById("userDetails");

let currentViewer = null;
let targetUser = null;
let loas = [];

function showStatus(message) {
  statusBanner.textContent = message;
  statusBanner.classList.remove("hidden");
}

function humanize(value) {
  return String(value || "—").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function canViewTarget() {
  if (!currentViewer || !targetUser) return false;
  if (auth.currentUser?.uid === targetUid) return true;
  if (currentViewer.accountType === "managing_company") return currentViewer.permissions?.canViewCompanyRecords === true;
  return currentViewer.companyId === targetUser.companyId && currentViewer.permissions?.canViewCompanyRecords === true;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderDetails() {
  document.getElementById("userName").textContent = targetUser.discordUsername || "Unnamed User";
  document.getElementById("userMeta").textContent = `${humanize(targetUser.role)} • ${targetUser.companyName || targetUser.companyId || "Unknown Company"}`;
  setText("statRole", humanize(targetUser.role));
  setText("statCompany", targetUser.companyName || targetUser.companyId || "—");
  setText("statTotalLoas", String(loas.length));
  setText("statStatus", targetUser.active === false ? "Inactive" : "Active");

  userDetails.innerHTML = `
    <div class="loa-card">
      <strong>${targetUser.discordUsername || "Unnamed User"}</strong>
      <p>${humanize(targetUser.accountType)} • ${humanize(targetUser.role)}</p>
      <span>Company: ${targetUser.companyName || targetUser.companyId || "—"}</span>
      <span>Login Key: ${targetUser.loginKey || "—"}</span>
      <span>Status: ${targetUser.active === false ? "Inactive" : "Active"}</span>
    </div>
  `;
}

function buildLoaCard(loa) {
  const div = document.createElement("div");
  div.className = "loa-card";
  div.innerHTML = `
    <strong>${loa.startDate || "—"} → ${loa.endDate || "—"}</strong>
    <p>${loa.reason || "No reason provided."}</p>
    <span>Status: ${humanize(loa.status)}</span>
    <span>Company: ${loa.companyName || loa.companyId || "—"}</span>
  `;
  return div;
}

function renderLoas(filter = "") {
  userLoas.innerHTML = "";
  const normalized = filter.trim().toLowerCase();
  const filtered = loas.filter(loa => [loa.reason, loa.status, loa.startDate, loa.endDate].join(" ").toLowerCase().includes(normalized));

  if (!filtered.length) {
    userLoas.innerHTML = `<div class="loa-card"><strong>No LOAs found</strong><p>No leave records matched this view.</p></div>`;
    return;
  }

  filtered.forEach(loa => userLoas.appendChild(buildLoaCard(loa)));
}

async function loadTargetUserAndLoas() {
  const targetSnap = await getDoc(doc(db, "users", targetUid));
  if (!targetSnap.exists()) {
    showStatus("User record not found.");
    return;
  }
  targetUser = { ...targetSnap.data(), docId: targetSnap.id };

  if (!canViewTarget()) {
    showStatus("You do not have permission to view this user record.");
    return;
  }

  loas = [];
  const loaSnap = await getDocs(collection(db, "loas"));
  loaSnap.forEach(docSnap => {
    const data = docSnap.data();
    if (data.requesterUid === targetUid) loas.push({ ...data, docId: docSnap.id });
  });

  renderDetails();
  renderLoas();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  if (!targetUid) {
    showStatus("No user was selected.");
    return;
  }

  currentViewer = await getUserWithPermissions(db, user.uid);
  if (!currentViewer) {
    showStatus("Your user record could not be found.");
    return;
  }

  await loadTargetUserAndLoas();
});

loaSearchInput.addEventListener("input", (e) => renderLoas(e.target.value));

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
