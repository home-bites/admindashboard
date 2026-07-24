import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
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

async function setupOfficialAdmin() {
  const email = "admin@homebites.com";
  const password = "AdminPassword123!";
  
  // Try login with passwords
  const possiblePasswords = ["AdminPassword123!", "E2EPassword123!", "HomeBites2026!"];
  let loggedIn = false;
  let uid = null;

  for (const pwd of possiblePasswords) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pwd);
      console.log(`Successfully logged in admin@homebites.com with password: ${pwd}`);
      uid = cred.user.uid;
      loggedIn = true;
      break;
    } catch(e) {}
  }

  if (!loggedIn) {
    // Create superadmin@homebites.com
    const newEmail = "superadmin@homebites.com";
    try {
      const cred = await createUserWithEmailAndPassword(auth, newEmail, password);
      uid = cred.user.uid;
      console.log(`Created new official admin: ${newEmail} / ${password}`);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(auth, newEmail, password);
        uid = cred.user.uid;
        console.log(`Logged into ${newEmail}`);
      } else {
        console.error("Failed to create admin:", e);
      }
    }

    if (uid) {
      await setDoc(doc(db, "users", uid), {
        uid: uid,
        name: "Super Administrator",
        email: newEmail,
        role: "Super Admin",
        status: "Active",
        isActive: true,
        permissions: ["ALL"],
        createdAt: serverTimestamp()
      });
      console.log("Firestore profile updated for superadmin@homebites.com");
    }
  } else {
    // Ensure Firestore profile
    await setDoc(doc(db, "users", uid), {
      uid: uid,
      name: "Super Administrator",
      email: email,
      role: "Super Admin",
      status: "Active",
      isActive: true,
      permissions: ["ALL"],
      createdAt: serverTimestamp()
    }, { merge: true });
    console.log("Firestore profile updated for admin@homebites.com");
  }

  process.exit(0);
}

setupOfficialAdmin();
