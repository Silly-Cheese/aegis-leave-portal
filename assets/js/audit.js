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

const auditList = document.getElementById("auditList");
const statusBanner = document.getElementById("statusBanner");

let currentUserData = null;
let auditLogs = [];

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

function canViewAudit() {
  return currentUserData?.permissions?.canViewAuditLogs === true ||
    (currentUserData?.accountType === "managing_company" && ["owner", "account_manager"].includes(String(currentUserData?.role || "").toLowerCase()));
}

function formatTimestamp(value) {
  if (!value) return "Unknown time";
  if (typeof value.toDate === "function") return value.toDate().toLocaleString();
  return String(value);
}

function detailSummary(details) {
  if (!details || typeof details !== "object") return "No extra details recorded.";
  const entries = Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (!entries.length) return "No extra details recorded.";
  return entries.map(([key, value]) => `${humanize(key)}: ${typeof value === "object" ? JSON.stringify(value) : value}`).join(" • ");
}

function buildAuditCard(data) {
  const div = document.createElement("div");
  div.className = "loa-card";

  div.innerHTML = `
    <strong>${humanize(data.action)}</strong>
    <p>${detailSummary(data.details)}</p>
    <span>Actor: ${data.actorName || data.actor || data.actorUid || "Unknown"}</span>
    <span>Target: ${data.targetType || "record"} / ${data.targetId || data.target || "Unknown"}</span>
    <span>Company: ${data.companyId || "N/A"}</span>
    <span>Time: ${formatTimestamp(data.createdAt)}</span>
  `;

  return div;
}

function renderAudit() {
  auditList.innerHTML = "";

  if (!auditLogs.length) {
    auditList.innerHTML = `<div class="loa-card"><strong>No audit logs yet</strong><p>No actions have been recorded yet.</p></div>`;
    return;
  }

  auditLogs.forEach((log) => auditList.appendChild(buildAuditCard(log)));
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  clearStatus();

  try {
    currentUserData = await getUserWithPermissions(db, user.uid);
    if (!currentUserData) {
      window.location.href = "dashboard.html";
      return;
    }

    if (!canViewAudit()) {
      showStatus("You do not have permission to view audit logs.");
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 1200);
      return;
    }

    await loadAudit();
  } catch (error) {
    console.error(error);
    showStatus("Failed to load audit records.");
  }
});

async function loadAudit() {
  auditLogs = [];
  const snapshot = await getDocs(collection(db, "auditLogs"));

  snapshot.forEach((docSnap) => {
    auditLogs.push({ ...docSnap.data(), docId: docSnap.id });
  });

  auditLogs.sort((a, b) => {
    const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bTime - aTime;
  });

  renderAudit();
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
