import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

const companyList = document.getElementById("companyList");
const createCompanyForm = document.getElementById("createCompanyForm");
const statusBanner = document.getElementById("statusBanner");

let currentUserData = null;

function showStatus(message) {
  statusBanner.textContent = message;
  statusBanner.classList.remove("hidden");
}

function clearStatus() {
  statusBanner.textContent = "";
  statusBanner.classList.add("hidden");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function canManageCompanies(userData) {
  if (!userData) return false;
  return userData.accountType === "managing_company" &&
    ["owner", "account_manager"].includes(normalizeRole(userData.role));
}

function buildCompanyCard(data) {
  const card = document.createElement("div");
  card.className = "loa-card";

  card.innerHTML = `
    <strong>${data.companyName}</strong>
    <p>${data.companyId}</p>
    <span>${data.companyType === "managing_company" ? "Aegis / Managing Company" : "Customer Company"}</span>
  `;

  return card;
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

    currentUserData = userDoc.data();

    if (!canManageCompanies(currentUserData)) {
      showStatus("You do not have permission to manage companies.");
      createCompanyForm.classList.add("hidden");
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 1200);
      return;
    }

    await loadCompanies();
  } catch (error) {
    console.error(error);
    showStatus("Failed to load company administration.");
  }
});

createCompanyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();

  const companyId = slugify(document.getElementById("companyIdInput").value);
  const companyName = document.getElementById("companyNameInput").value.trim();
  const companyType = document.getElementById("companyTypeInput").value;

  if (!companyId || !companyName || !companyType) {
    showStatus("All company fields are required.");
    return;
  }

  try {
    await setDoc(doc(db, "companies", companyId), {
      companyId,
      companyName,
      companyType,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid
    });

    createCompanyForm.reset();
    showStatus("Company created successfully.");
    await loadCompanies();
  } catch (error) {
    console.error(error);
    showStatus("Failed to create company.");
  }
});

async function loadCompanies() {
  companyList.innerHTML = "";

  const snapshot = await getDocs(collection(db, "companies"));

  if (snapshot.empty) {
    companyList.innerHTML = `<div class="loa-card"><strong>No companies yet</strong><p>No company records have been created yet.</p></div>`;
    return;
  }

  snapshot.forEach((docSnap) => {
    companyList.appendChild(buildCompanyCard(docSnap.data()));
  });
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
