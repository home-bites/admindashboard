import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: "AIzaSyB93_P8OgC9sAqS34QUmo3p6lcDgB3ZH88",
  authDomain: "homebites-production.firebaseapp.com",
  projectId: "homebites-production",
  storageBucket: "homebites-production.firebasestorage.app",
  messagingSenderId: "417938783027",
  appId: "1:417938783027:web:6fa76bb9402029bf965c46",
};

import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  const email = "test@hb.com";
  const password = "password123";
  
  console.log(`Signing in user ${email}...`);
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    console.log(`Signed in. UID: ${uid}`);
    
    console.log("Testing notification query...");
    const q = query(collection(db, "notifications"), where("userId", "in", [uid, "all"]));
    const snap = await getDocs(q);
    console.log(`Query succeeded! Found ${snap.size} notifications.`);
    process.exit(0);
  } catch (err) {
    console.error("Query failed with error:", err);
    process.exit(1);
  }
}

run();
