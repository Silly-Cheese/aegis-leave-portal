import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
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

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = "index.html";

  const userDoc = await getDoc(doc(db, "users", user.uid));
  const userData = userDoc.data();

  if (userData.accountType !== "managing_company") {
    return window.location.href = "dashboard.html";
  }

  loadAudit();
});

async function loadAudit() {
  auditList.innerHTML = "";

  const snapshot = await getDocs(collection(db, "auditLogs"));

  snapshot.forEach(doc => {
    const data = doc.data();

    const div = document.createElement("div");
    div.className = "loa-card";

    div.innerHTML = `
      <strong>${data.action}</strong>
      <p>User: ${data.actor}</p>
      <span>Target: ${data.target}</span>
    `;

    auditList.appendChild(div);
  });
}
