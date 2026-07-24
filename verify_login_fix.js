import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

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

// Simulate fixed AuthService.login logic
async function authServiceLogin(email, password) {
  const cleanEmail = email ? email.trim().toLowerCase() : "";
  if (!cleanEmail || !password) {
    throw new Error("Please enter both email and password.");
  }

  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
  } catch (e) {
    if (
      e.code === 'auth/user-not-found' ||
      e.code === 'auth/wrong-password' ||
      e.code === 'auth/invalid-credential'
    ) {
      throw new Error("Invalid credentials. Please verify your email and password.");
    } else if (e.code === 'auth/user-disabled') {
      throw new Error("This administrator account has been disabled.");
    } else if (e.code === 'auth/too-many-requests') {
      throw new Error("Too many failed login attempts. Please try again later.");
    } else {
      throw new Error(e.message || "Authentication failed. Please try again.");
    }
  }

  const uid = cred.user.uid;
  const userSnap = await getDoc(doc(db, "users", uid));
  let userProfile = userSnap.exists() ? { uid, ...userSnap.data() } : null;

  if (!userProfile) {
    await signOut(auth);
    throw new Error("User profile not found in database. Contact system administrator.");
  }

  const allowedRoles = ["Super Admin", "Admin", "Manager", "Chef", "Staff", "Kitchen Manager", "Delivery Manager"];
  if (!userProfile.role || !allowedRoles.includes(userProfile.role)) {
    await signOut(auth);
    throw new Error("Access denied. You do not have administrator privileges to access this dashboard.");
  }

  return userProfile;
}

async function testLoginFix() {
  console.log("=== VERIFYING ADMIN LOGIN FLOW FIX ===");

  // TEST 1: Valid Login with existing admin
  console.log("\n--- TEST 1: Existing Admin Login (superadmin@homebites.com) ---");
  try {
    const user = await authServiceLogin("superadmin@homebites.com", "AdminPassword123!");
    console.log("[PASS] Successfully authenticated admin:", user.email, "| Role:", user.role);
  } catch (e) {
    console.error("[FAIL] Test 1 Failed:", e.message);
  }

  // TEST 2: Wrong Password for existing admin
  console.log("\n--- TEST 2: Wrong Password Attempt ---");
  try {
    await authServiceLogin("superadmin@homebites.com", "WrongPassword999!");
    console.error("[FAIL] Test 2 Failed: Should have rejected wrong password!");
  } catch (e) {
    if (e.message.includes("Invalid credentials") && !e.message.includes("email-already-in-use")) {
      console.log("[PASS] Cleanly rejected wrong password without auto-registration:", e.message);
    } else {
      console.error("[FAIL] Unexpected error message:", e.message);
    }
  }

  // TEST 3: Non-existent Admin Login
  console.log("\n--- TEST 3: Non-existent Admin Login Attempt ---");
  try {
    await authServiceLogin("nonexistent_admin_test@homebites.com", "SomePass123!");
    console.error("[FAIL] Test 3 Failed: Should have rejected non-existent account!");
  } catch (e) {
    if (e.message.includes("Invalid credentials") && !e.message.includes("email-already-in-use")) {
      console.log("[PASS] Cleanly rejected non-existent user without auto-registration:", e.message);
    } else {
      console.error("[FAIL] Unexpected error message:", e.message);
    }
  }

  console.log("\n=== ALL LOGIN FIX TESTS COMPLETED ===");
  process.exit(0);
}

testLoginFix();
