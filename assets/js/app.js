import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, updatePassword, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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
const loginButton = document.getElementById("loginButton");
const passwordChangeButton = document.getElementById("passwordChangeButton");

let currentUserDoc = null;

function showStatus(message) {
  statusBanner.textContent = message;
  statusBanner.classList.remove("hidden");
}

function clearStatus() {
  statusBanner.textContent = "";
  statusBanner.classList.add("hidden");
}

function setButtonBusy(button, busyText, isBusy) {
  if (!button) return;
  button.disabled = isBusy;
  if (isBusy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
}

function slugify(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

async function findUser(field, value) {
  if (!value) return null;
  const q = query(collection(db, "users"), where(field, "==", value));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const userDoc = snapshot.docs[0];
  return { id: userDoc.id, ...userDoc.data() };
}

async function loadUserByLoginKey(input) {
  const raw = String(input || "").trim();
  const key = slugify(raw);

  return await findUser("loginKey", key)
    || await findUser("discordUsername", raw)
    || await findUser("discordUsername", raw.toLowerCase())
    || await findUser("discordUsername", raw.replaceAll("_", " "));
}

function routeAuthenticatedUser() {
  if (currentUserDoc?.mustChangePassword) {
    loginForm.classList.add("hidden");
    passwordChangeForm.classList.remove("hidden");
    accountPanel.classList.add("hidden");
    showStatus("Password update required before continuing.");
    return;
  }

  window.location.href = "dashboard.html";
}

async function updateLastLogin() {
  try {
    await updateDoc(doc(db, "users", currentUserDoc.id), {
      lastLoginAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Could not update lastLoginAt.", error);
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();
  setButtonBusy(loginButton, "Signing In...", true);

  const username = document.getElementById("username").value.trim();
  const userPassword = document.getElementById("password").value;

  try {
    const userData = await loadUserByLoginKey(username);

    if (!userData) {
      showStatus("User not found. Check the Discord username/login key on the user record.");
      return;
    }

    if (userData.active === false) {
      showStatus("This account is inactive.");
      return;
    }

    if (!userData.authEmail) {
      showStatus("This account is missing authEmail in Firestore.");
      return;
    }

    currentUserDoc = userData;
    await signInWithEmailAndPassword(auth, userData.authEmail, userPassword);
    await updateLastLogin();
    routeAuthenticatedUser();
  } catch (error) {
    console.error(error);
    showStatus(`Login failed: ${error.code || error.message || "unknown error"}`);
  } finally {
    setButtonBusy(loginButton, "Signing In...", false);
  }
});

passwordChangeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();
  setButtonBusy(passwordChangeButton, "Updating...", true);

  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (newPassword.length < 8) {
    showStatus("Your new password must be at least 8 characters long.");
    setButtonBusy(passwordChangeButton, "Updating...", false);
    return;
  }

  if (newPassword !== confirmPassword) {
    showStatus("Passwords do not match.");
    setButtonBusy(passwordChangeButton, "Updating...", false);
    return;
  }

  try {
    await updatePassword(auth.currentUser, newPassword);

    await updateDoc(doc(db, "users", currentUserDoc.id), {
      mustChangePassword: false,
      tempPasswordIssued: false,
      passwordUpdatedAt: serverTimestamp()
    });

    currentUserDoc.mustChangePassword = false;
    showStatus("Password updated successfully. Redirecting to dashboard...");

    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 700);
  } catch (error) {
    console.error(error);
    showStatus(`Password update failed: ${error.code || error.message || "unknown error"}`);
  } finally {
    setButtonBusy(passwordChangeButton, "Updating...", false);
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  location.reload();
});
