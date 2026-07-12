import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
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

async function run() {
  const email = "test@hb.com";
  const password = "password123";
  
  console.log(`Checking/Creating test user: ${email}...`);
  try {
    let user;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      user = cred.user;
      console.log(`Test user already exists. Uid: ${user.uid}`);
    } catch (e) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        user = cred.user;
        console.log(`Successfully created new test user. Uid: ${user.uid}`);
      } else {
        throw e;
      }
    }
    
    // Create/update profile doc
    const userDocRef = doc(db, "users", user.uid);
    await setDoc(userDocRef, {
      name: "Test User",
      displayName: "Test User",
      email: email,
      phone: "+91 98765 43210",
      mobileNumber: "+91 98765 43210",
      walletBalance: 1000.0,
      loyaltyPoints: 500,
      role: "Customer",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    
    console.log("Firestore profile synchronized successfully.");
  } catch (err) {
    console.error("Error creating test user:", err);
  }
}

run();
