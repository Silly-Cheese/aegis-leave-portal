import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

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

const loaForm = document.getElementById("loaForm");
const loaList = document.getElementById("loaList");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;
  loadLOAs();
});

loaForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  const reason = document.getElementById("reason").value;

  await addDoc(collection(db, "loas"), {
    requesterUid: currentUser.uid,
    startDate,
    endDate,
    reason,
    status: "pending",
    submittedAt: serverTimestamp()
  });

  loaForm.reset();
  loadLOAs();
});

async function loadLOAs() {
  loaList.innerHTML = "";

  const q = query(collection(db, "loas"), where("requesterUid", "==", currentUser.uid));
  const snapshot = await getDocs(q);

  snapshot.forEach(doc => {
    const data = doc.data();
    const div = document.createElement("div");
    div.className = "loa-card";
    div.innerHTML = `
      <strong>${data.startDate} → ${data.endDate}</strong>
      <p>${data.reason}</p>
      <span>Status: ${data.status}</span>
    `;
    loaList.appendChild(div);
  });
}
