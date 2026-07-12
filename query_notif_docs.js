import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, limit, getDocs } from "firebase/firestore";

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
  
  console.log(`Signing in user ${email}...`);
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log(`Signed in. UID: ${userCredential.user.uid}`);
    
    const snap = await getDocs(collection(db, "notifications"));
    console.log(`Total notifications in collection: ${snap.size}`);
    
    const firstTen = snap.docs.slice(0, 10);
    firstTen.forEach(doc => {
      console.log(`ID: ${doc.id}`);
      const data = doc.data();
      console.log('Keys:', Object.keys(data));
      console.log('userId:', data.userId);
      console.log('title:', data.title);
      console.log('type:', data.type);
      console.log('createdAt:', data.createdAt ? typeof data.createdAt : 'undefined');
      if (data.createdAt && typeof data.createdAt === 'object') {
        console.log('createdAt constructor:', data.createdAt.constructor.name);
        console.log('createdAt stringified:', JSON.stringify(data.createdAt));
      } else {
        console.log('createdAt value:', data.createdAt);
      }
      console.log('---');
    });
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

run();
