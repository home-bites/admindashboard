import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAxA3kG-KQTjNoDhZ-yaUQ9c3B70YaMFHs",
  authDomain: "homebites-production-56afa.firebaseapp.com",
  projectId: "homebites-production-56afa",
  storageBucket: "homebites-production-56afa.firebasestorage.app",
  messagingSenderId: "552260980743",
  appId: "1:552260980743:web:f055a11755d1d7957cdaa2",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function createAdmin() {
  const adminEmail = "admin@homebites.com";
  const adminPassword = "AdminPassword123!";
  
  try {
    const cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
    await setDoc(doc(db, "users", cred.user.uid), {
      name: "System Administrator",
      email: adminEmail,
      role: "Super Admin",
      isActive: true,
      createdAt: serverTimestamp()
    });
    console.log("Admin account created successfully.");
    console.log("Email:", adminEmail);
    console.log("Password:", adminPassword);
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      console.log("Admin account already exists.");
      console.log("Email:", adminEmail);
      console.log("Password:", adminPassword);
    } else {
      console.error("Error creating admin:", e);
    }
  }
  process.exit(0);
}

createAdmin();
