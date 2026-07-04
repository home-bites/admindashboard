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
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  const email = "test@hb.com";
  const password = "password123";
  
  console.log(`Signing in user ${email}...`);
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    console.log(`Signed in. UID: ${uid}`);
    
    // Create a test notification for the user (we are a Super Admin now, so we can write to notifications)
    console.log("Creating test notification...");
    const notifId = "test_notif_123";
    const notifRef = doc(db, "notifications", notifId);
    await setDoc(notifRef, {
      userId: uid,
      title: "Test Notification",
      message: "This is a test notification payload.",
      isRead: false,
      type: "promotions",
      createdAt: new Date(),
    });
    console.log("Notification created.");

    // Query it
    console.log("Querying notification...");
    const q = query(collection(db, "notifications"), where("userId", "in", [uid, "all"]));
    const snap = await getDocs(q);
    console.log(`Query succeeded! Found ${snap.size} notifications.`);

    // Mark as read
    console.log("Marking notification as read...");
    await updateDoc(notifRef, {
      isRead: true
    });
    console.log("Marked as read successfully.");

    // Clear notification
    console.log("Deleting/clearing notification...");
    await deleteDoc(notifRef);
    console.log("Notification deleted successfully.");

    console.log("\nALL NOTIFICATION ACTIONS COMPLETED SUCCESSFULLY WITH ZERO PERMISSION ERRORS!");
    process.exit(0);
  } catch (err) {
    console.error("Action failed with error:", err);
    process.exit(1);
  }
}

run();
