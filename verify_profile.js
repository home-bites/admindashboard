import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

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
  
  console.log(`Signing in user ${email}...`);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    console.log(`Signed in successfully. UID: ${uid}`);
    
    console.log(`Fetching users/${uid} document...`);
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      console.error(`ERROR: Document users/${uid} does not exist in Firestore!`);
      process.exit(1);
    }
    
    const data = docSnap.data();
    console.log("Document data:", JSON.stringify(data, null, 2));
    
    const requiredFields = ["displayName", "name", "email", "mobileNumber"];
    let missing = [];
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null || data[field] === "") {
        missing.push(field);
      }
    }
    
    if (missing.length > 0) {
      console.error(`ERROR: Missing required fields: ${missing.join(", ")}`);
      process.exit(1);
    }
    
    console.log("SUCCESS: User profile exists and all required fields are populated!");
    process.exit(0);
  } catch (err) {
    console.error("Verification failed:", err);
    process.exit(1);
  }
}

run();
