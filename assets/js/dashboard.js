import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

const permissionList = document.getElementById("permissionList");

function addPermission(text) {
  const li = document.createElement("li");
  li.textContent = text;
  permissionList.appendChild(li);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists()) return;

  const data = userDoc.data();

  document.getElementById("welcomeHeading").textContent = `Welcome, ${data.discordUsername}`;
  document.getElementById("welcomeMeta").textContent = `${data.role} • ${data.accountType}`;

  document.getElementById("statAccountType").textContent = data.accountType;
  document.getElementById("statRole").textContent = data.role;
  document.getElementById("statCompany").textContent = data.companyId;

  permissionList.innerHTML = "";

  if (data.accountType === "managing_company") {
    if (data.role === "owner") {
      addPermission("Full system control");
      addPermission("Manage all accounts");
      addPermission("Approve all LOAs");
    } else if (data.role === "management") {
      addPermission("Approve LOAs");
      addPermission("Submit own LOA");
    } else {
      addPermission("Submit LOA requests");
      addPermission("View own LOAs");
    }
  } else {
    if (data.role === "company_owner") {
      addPermission("Manage company staff");
      addPermission("Approve LOAs");
    } else {
      addPermission("Submit LOA requests");
      addPermission("View own LOAs");
    }
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
