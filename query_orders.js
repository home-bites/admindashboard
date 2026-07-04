import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB93_P8OgC9sAqS34QUmo3p6lcDgB3ZH88",
  authDomain: "homebites-production.firebaseapp.com",
  projectId: "homebites-production",
  storageBucket: "homebites-production.firebasestorage.app",
  messagingSenderId: "417938783027",
  appId: "1:417938783027:web:6fa76bb9402029bf965c46",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  const email = "test@hb.com";
  const password = "password123";
  const userId = "eK1rT4kEhfXhDG0NyHUKPxrjyoe2";
  
  console.log(`Signing in user ${email}...`);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log("Signed in successfully.");
    
    // 1. Check user doc
    console.log("\n--- Checking User Doc ---");
    const userSnap = await getDoc(doc(db, "users", userId));
    if (userSnap.exists()) {
      console.log(JSON.stringify(userSnap.data(), null, 2));
    } else {
      console.log("User doc not found.");
    }

    // 2. Check Coupon Redemptions
    console.log("\n--- Checking Coupon Redemptions ---");
    const redemptionsSnap = await getDocs(query(collection(db, "couponRedemptions"), where("userId", "==", userId)));
    console.log(`Found ${redemptionsSnap.size} redemptions.`);
    redemptionsSnap.docs.forEach(doc => {
      console.log(doc.id, JSON.stringify(doc.data(), null, 2));
    });

    // 3. Check Notifications
    console.log("\n--- Checking Notifications ---");
    const notifsSnap = await getDocs(query(collection(db, "notifications"), where("userId", "==", userId)));
    console.log(`Found ${notifsSnap.size} notifications.`);
    notifsSnap.docs.forEach(doc => {
      console.log(doc.id, JSON.stringify(doc.data(), null, 2));
    });

    // 4. Check Cart Doc
    console.log("\n--- Checking Cart Doc ---");
    const cartSnap = await getDoc(doc(db, "carts", userId));
    if (cartSnap.exists()) {
      console.log("Cart doc still exists:", JSON.stringify(cartSnap.data(), null, 2));
    } else {
      console.log("Cart doc deleted successfully.");
    }
    
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

run();
