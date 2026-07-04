import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, updateDoc, getDoc, arrayUnion } from "firebase/firestore";

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
  const orderDocId = "oPyJkc7CzoAe9E5E9lcj";
  
  console.log(`Signing in user ${email}...`);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log("Signed in successfully. Updating order status to Delivered...");
    
    const orderRef = doc(db, "orders", orderDocId);
    
    // First, let's read the order to see existing history
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      throw new Error("Order not found");
    }
    
    await updateDoc(orderRef, {
      status: "Delivered",
      statusHistory: arrayUnion({
        status: "Delivered",
        timestamp: new Date()
      })
    });
    
    console.log("Order status set to Delivered successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

run();
