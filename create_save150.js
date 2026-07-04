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
import { getFirestore, doc, setDoc } from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  const email = "test@hb.com";
  const password = "password123";
  
  console.log(`Signing in user ${email}...`);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log("Signed in successfully. Creating SAVE150 coupon...");
    
    const couponRef = doc(db, "coupons", "coupon_save150");
    await setDoc(couponRef, {
      code: "SAVE150",
      discountType: "flat",
      discountValue: 150,
      minOrderValue: 200,
      isActive: true,
      isDeleted: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days expiry
    });
    
    console.log("SAVE150 coupon created successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

run();
