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
  try {
    await signInWithEmailAndPassword(auth, "test@hb.com", "password123");
    const snap = await getDocs(collection(db, "banners"));
    console.log("BANNERS IN DB:");
    snap.docs.forEach(doc => {
      console.log(`- ID: ${doc.id}`);
      console.log("  Data:", JSON.stringify(doc.data(), null, 2));
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
