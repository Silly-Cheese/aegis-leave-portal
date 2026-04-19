import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

function showStatus(message) {
  statusBanner.textContent = message;
  statusBanner.classList.remove("hidden");
}

function clearStatus() {
  statusBanner.textContent = "";
  statusBanner.classList.add("hidden");
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function canViewAudit(userData) {
  if (!userData) return false;
  return userData.accountType === "managing_company" &&
    ["owner", "account_manager"].includes(normalizeRole(userData.role));
}

function humanize(value) {
  return String(value || "—")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildAuditCard(data) {
  const div = document.createElement("div");
  div.className = "loa-card";

  div.innerHTML = `
    <strong>${humanize(data.action)}</strong>
    <p>Actor: ${data.actor || "Unknown"}</p>
    <span>Target: ${data.target || "Unknown"}</span>
  `;

  return div;
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
      window.location.href = "dashboard.html";
      return;
    }

    const userData = userDoc.data();

    if (!canViewAudit(userData)) {
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
  auditList.innerHTML = "";

  const snapshot = await getDocs(collection(db, "auditLogs"));

  if (snapshot.empty) {
    auditList.innerHTML = `<div class="loa-card"><strong>No audit logs yet</strong><p>No actions have been recorded yet.</p></div>`;
    return;
  }

  snapshot.forEach((docSnap) => {
    auditList.appendChild(buildAuditCard(docSnap.data()));
  });
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
