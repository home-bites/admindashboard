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
import { getFirestore, collection, getDocs } from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  try {
    await signInWithEmailAndPassword(auth, "test@hb.com", "password123");
    const snap = await getDocs(collection(db, "categories"));
    console.log("CATEGORIES IN DB:");
    snap.docs.forEach(doc => {
      console.log(`- ID: ${doc.id} | Name: ${doc.data().name} | status: ${doc.data().status} | displayOrder: ${doc.data().displayOrder} | image: ${doc.data().image}`);
    });

    const menuSnap = await getDocs(collection(db, "menuItems"));
    console.log("\nMENU ITEMS IN DB:");
    menuSnap.docs.forEach(doc => {
      console.log(`- ID: ${doc.id} | Name: ${doc.data().name} | categoryId: ${doc.data().categoryId}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
