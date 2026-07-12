import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

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
  console.log("=== FIRESTORE AUDIT SCRIPT ===");
  const email = "test@hb.com";
  const password = "password123";
  let user;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    user = cred.user;
    console.log(`Successfully signed in as Super Admin: ${email} (uid: ${user.uid})`);
  } catch (e) {
    console.error("Error authenticating admin user:", e.message);
    return;
  }

  // Define collections to query
  const collections = [
    "users",
    "addresses",
    "categories",
    "menuItems",
    "banners",
    "coupons",
    "deals",
    "orders",
    "orderTracking",
    "deliveryPartners",
    "walletTransactions",
    "supportTickets",
    "notifications",
    "appSettings",
    "auditLogs",
    "favorites",
    "reviews",
    "carts",
    "referrals",
    "couponRedemptions",
    "loyaltyPoints"
  ];

  // 1. Audit user profile fields
  console.log("\n--- USER PROFILE AUDIT ---");
  try {
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      console.log("users/{uid} document data:", JSON.stringify(userDocSnap.data(), null, 2));
    } else {
      console.log("users/{uid} document does not exist!");
    }
  } catch (e) {
    console.error("Error reading users/{uid}:", e.message);
  }

  // 2. Audit all collections document counts and sample fields
  console.log("\n--- COLLECTION VERIFICATION REPORT ---");
  for (const colName of collections) {
    try {
      const colRef = collection(db, colName);
      const snapshot = await getDocs(colRef);
      console.log(`Collection: "${colName}" | Count: ${snapshot.docs.length} documents`);
      if (snapshot.docs.length > 0) {
        console.log(`  Sample doc id: ${snapshot.docs[0].id}`);
        console.log(`  Fields:`, Object.keys(snapshot.docs[0].data()).join(", "));
        // Print sample details for category and menuItems to check mappings
        if (colName === "categories" || colName === "menuItems") {
          console.log(`  Sample details:`, JSON.stringify(snapshot.docs[0].data(), null, 2));
        }
      }
    } catch (e) {
      console.error(`Error querying collection "${colName}":`, e.message);
    }
  }

  console.log("\n=== AUDIT COMPLETED ===");
}

run().catch(console.error);
