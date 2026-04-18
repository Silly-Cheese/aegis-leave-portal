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

function canManageCompanies(userData) {
  return userData?.accountType === "managing_company" && ["owner", "account_manager"].includes(String(userData?.role || "").toLowerCase());
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

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

  loadCompanies();
});

createCompanyForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const companyId = document.getElementById("companyIdInput").value.trim().toLowerCase();
  const companyName = document.getElementById("companyNameInput").value.trim();
  const companyType = document.getElementById("companyTypeInput").value;

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
    loadCompanies();
  } catch (err) {
    console.error(err);
    showStatus("Failed to create company.");
  }
});

async function loadCompanies() {
  companyList.innerHTML = "";
  const snapshot = await getDocs(collection(db, "companies"));

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const card = document.createElement("div");
    card.className = "loa-card";
    card.innerHTML = `
      <strong>${data.companyName}</strong>
      <p>${data.companyId}</p>
      <span>${data.companyType}</span>
    `;
    companyList.appendChild(card);
  });
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
