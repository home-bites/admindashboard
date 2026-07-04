import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

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
  console.log("=== FIRESTORE AUDIT SCRIPT ===");
  const testEmail = `audit_test_${Date.now()}@homebites.com`;
  const testPassword = "testPassword123";
  let user;

  try {
    const cred = await createUserWithEmailAndPassword(auth, testEmail, testPassword);
    user = cred.user;
    console.log(`Successfully created a new audit test user: ${testEmail} (uid: ${user.uid})`);
    
    // Create the user profile in Firestore
    const userDocRef = doc(db, "users", user.uid);
    await setDoc(userDocRef, {
      name: "Audit Test User",
      displayName: "Audit Display Name",
      email: testEmail,
      phone: "+91 99999 88888",
      mobileNumber: "+91 99999 88888",
      walletBalance: 250.50,
      loyaltyPoints: 120,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log("Successfully created user profile document in Firestore users collection.");
  } catch (e) {
    console.error("Error creating/authenticating test user:", e.message);
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
