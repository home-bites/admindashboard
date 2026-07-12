import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: "AIzaSyAxA3kG-KQTjNoDhZ-yaUQ9c3B70YaMFHs",
  authDomain: "homebites-production-56afa.firebaseapp.com",
  projectId: "homebites-production-56afa",
  storageBucket: "homebites-production-56afa.firebasestorage.app",
  messagingSenderId: "552260980743",
  appId: "1:552260980743:web:f055a11755d1d7957cdaa2",
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
