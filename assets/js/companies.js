import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, serverTimestamp, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
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

const companyList = document.getElementById("companyList");
const createCompanyForm = document.getElementById("createCompanyForm");
const statusBanner = document.getElementById("statusBanner");
const companySearchInput = document.getElementById("companySearchInput");

let currentUserData = null;
let companies = [];

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

function canManageCompanies() {
  return currentUserData?.permissions?.canManageCompanies === true;
}

function canDeleteCompanies() {
  return currentUserData?.accountType === "managing_company" && String(currentUserData?.role || "").toLowerCase() === "owner";
}

async function logAudit(action, targetType, targetId, details = {}) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      action,
      actorUid: auth.currentUser?.uid || "unknown",
      actorName: currentUserData?.discordUsername || "Unknown",
      targetType,
      targetId,
      companyId: details.companyId || targetId || null,
      details,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Audit logging failed:", error);
  }
}

function buildCompanyCard(data) {
  const card = document.createElement("div");
  card.className = "loa-card";

  const actions = document.createElement("div");
  actions.className = "button-grid";

  const openBtn = document.createElement("button");
  openBtn.className = "primary-btn";
  openBtn.type = "button";
  openBtn.textContent = "Open Company";
  openBtn.addEventListener("click", () => {
    window.location.href = `company-view.html?companyId=${encodeURIComponent(data.companyId)}`;
  });

  actions.appendChild(openBtn);

  if (canDeleteCompanies() && data.companyId !== "aegis") {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "secondary-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete Company";
    deleteBtn.addEventListener("click", async () => {
      const confirmation = prompt(`Type DELETE to remove ${data.companyName}.`);
      if (confirmation !== "DELETE") {
        showStatus("Company deletion cancelled.");
        return;
      }

      try {
        await deleteDoc(doc(db, "companies", data.companyId));
        await logAudit("DELETE_COMPANY", "company", data.companyId, { companyName: data.companyName, companyId: data.companyId });
        showStatus("Company deleted successfully.");
        await loadCompanies();
      } catch (error) {
        console.error(error);
        showStatus("Failed to delete company.");
      }
    });
    actions.appendChild(deleteBtn);
  }

  card.innerHTML = `
    <strong>${data.companyName}</strong>
    <p>${data.companyId}</p>
    <span>${data.companyType === "managing_company" ? "Aegis / Managing Company" : "Customer Company"}</span>
  `;

  card.appendChild(actions);
  return card;
}

function renderCompanies(filter = "") {
  companyList.innerHTML = "";

  const normalized = filter.trim().toLowerCase();
  const filtered = companies.filter((company) =>
    String(company.companyName || "").toLowerCase().includes(normalized) ||
    String(company.companyId || "").toLowerCase().includes(normalized)
  );

  if (!filtered.length) {
    companyList.innerHTML = `<div class="loa-card"><strong>No matching companies</strong><p>No companies matched your search.</p></div>`;
    return;
  }

  filtered.forEach((company) => {
    companyList.appendChild(buildCompanyCard(company));
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
    if (!currentUserData) {
      window.location.href = "dashboard.html";
      return;
    }

    if (!canManageCompanies()) {
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

  if (!canManageCompanies()) {
    showStatus("You do not have permission to create companies.");
    return;
  }

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

    await logAudit("CREATE_COMPANY", "company", companyId, { companyName, companyId, companyType });
    createCompanyForm.reset();
    showStatus("Company created successfully.");
    await loadCompanies();
  } catch (error) {
    console.error(error);
    showStatus("Failed to create company.");
  }
});

companySearchInput.addEventListener("input", (e) => {
  renderCompanies(e.target.value);
});

async function loadCompanies() {
  companies = [];
  const snapshot = await getDocs(collection(db, "companies"));

  snapshot.forEach((docSnap) => {
    companies.push(docSnap.data());
  });

  renderCompanies(companySearchInput.value || "");
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
