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
import { getFirestore, doc, getDoc } from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  try {
    await signInWithEmailAndPassword(auth, "test@hb.com", "password123");
    
    const docRef = doc(db, "users", "eK1rT4kEhfXhDG0NyHUKPxrjyoe2");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      console.log("TEST USER IN DB:");
      console.log(JSON.stringify(snap.data(), null, 2));
    } else {
      console.log("TEST USER DOES NOT EXIST IN DB!");
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
