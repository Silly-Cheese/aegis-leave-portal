import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, updatePassword, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

const loginForm = document.getElementById("loginForm");
const passwordChangeForm = document.getElementById("passwordChangeForm");
const accountPanel = document.getElementById("accountPanel");
const statusBanner = document.getElementById("statusBanner");

let currentUserDoc = null;

function showStatus(message, type = "info") {
  statusBanner.textContent = message;
  statusBanner.classList.remove("hidden");
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.toLowerCase();
  const password = document.getElementById("password").value;

  try {
    const q = query(collection(db, "users"), where("loginKey", "==", username));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      showStatus("User not found.");
      return;
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    currentUserDoc = { id: userDoc.id, ...userData };

    const userCredential = await signInWithEmailAndPassword(auth, userData.authEmail, password);

    if (userData.mustChangePassword) {
      loginForm.classList.add("hidden");
      passwordChangeForm.classList.remove("hidden");
      showStatus("You must change your password before continuing.");
      return;
    }

    showAccount();

  } catch (err) {
    showStatus("Login failed.");
    console.error(err);
  }
});

passwordChangeForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (newPassword !== confirmPassword) {
    showStatus("Passwords do not match.");
    return;
  }

  try {
    await updatePassword(auth.currentUser, newPassword);

    await updateDoc(doc(db, "users", currentUserDoc.id), {
      mustChangePassword: false
    });

    passwordChangeForm.classList.add("hidden");
    showAccount();

  } catch (err) {
    showStatus("Password update failed.");
  }
});

function showAccount() {
  accountPanel.classList.remove("hidden");
  document.getElementById("summaryName").textContent = currentUserDoc.discordUsername;
  document.getElementById("summaryMeta").textContent = `${currentUserDoc.role} • ${currentUserDoc.accountType}`;
}

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  location.reload();
});
