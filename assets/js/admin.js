import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

const form = document.getElementById("createUserForm");
const userList = document.getElementById("userList");
const statusBanner = document.getElementById("statusBanner");

function showStatus(msg) {
  statusBanner.textContent = msg;
  statusBanner.classList.remove("hidden");
}

function generateTempPassword() {
  return Math.random().toString(36).slice(-10) + "A!";
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  loadUsers();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const discordUsername = document.getElementById("discordUsername").value;
  const loginKey = discordUsername.toLowerCase();
  const authEmail = document.getElementById("authEmail").value;
  const accountType = document.getElementById("accountType").value;
  const role = document.getElementById("role").value;
  const companyId = document.getElementById("companyId").value;
  const companyName = document.getElementById("companyName").value;

  const tempPassword = generateTempPassword();

  try {
    const cred = await createUserWithEmailAndPassword(auth, authEmail, tempPassword);

    await addDoc(collection(db, "users"), {
      uid: cred.user.uid,
      discordUsername,
      loginKey,
      authEmail,
      accountType,
      role,
      companyId,
      companyName,
      mustChangePassword: true,
      tempPasswordIssued: true,
      active: true,
      createdAt: serverTimestamp()
    });

    showStatus(`User created. Temporary password: ${tempPassword}`);
    form.reset();
    loadUsers();

  } catch (err) {
    console.error(err);
    showStatus("User creation failed.");
  }
});

async function loadUsers() {
  userList.innerHTML = "";

  const snapshot = await getDocs(collection(db, "users"));

  snapshot.forEach(doc => {
    const data = doc.data();
    const div = document.createElement("div");
    div.className = "loa-card";
    div.innerHTML = `
      <strong>${data.discordUsername}</strong>
      <p>${data.role} • ${data.accountType}</p>
      <span>${data.companyId}</span>
    `;
    userList.appendChild(div);
  });
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
