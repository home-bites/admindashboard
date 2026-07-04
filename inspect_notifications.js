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
import { getFirestore, collection, getDocs } from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  const email = "test@hb.com";
  const password = "password123";
  
  console.log(`Signing in user ${email}...`);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log("Signed in successfully. Fetching notifications...");
    
    const colRef = collection(db, "notifications");
    const snap = await getDocs(colRef);
    console.log(`Found ${snap.size} notifications.`);
    snap.docs.forEach(doc => {
      console.log(`Doc ID: ${doc.id}`);
      console.log("Data:", JSON.stringify(doc.data(), null, 2));
    });
    
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

run();
