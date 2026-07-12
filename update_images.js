import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: "AIzaSyAxA3kG-KQTjNoDhZ-yaUQ9c3B70YaMFHs",
  authDomain: "homebites-production-56afa.firebaseapp.com",
  projectId: "homebites-production-56afa",
  storageBucket: "homebites-production-56afa.firebasestorage.app",
  messagingSenderId: "552260980743",
  appId: "1:552260980743:web:f055a11755d1d7957cdaa2",
};

import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, updateDoc } from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  const email = "test@hb.com";
  const password = "password123";
  
  console.log(`Signing in user ${email}...`);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log("Signed in successfully. Updating images...");
    
    // 1. Boneless Chicken Biriyani
    const doc1 = doc(db, "menuItems", "CxkHeVOtmLAHsOoap3ix");
    await updateDoc(doc1, {
      imageUrl: "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600",
      image: "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600"
    });
    console.log("Updated Boneless Chicken Biriyani.");

    // 2. DUM BIRIYANI
    const doc2 = doc(db, "menuItems", "o1MryXJGZHiWSr7Bhjqd");
    await updateDoc(doc2, {
      imageUrl: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600",
      image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600"
    });
    console.log("Updated DUM BIRIYANI.");

    // 3. Paneer Butter Masala
    const doc3 = doc(db, "menuItems", "menu_paneer_butter");
    await updateDoc(doc3, {
      imageUrl: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600",
      image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600"
    });
    console.log("Updated Paneer Butter Masala.");

    // 4. Tandoori Roti (Butter)
    const doc4 = doc(db, "menuItems", "menu_butter_rotis");
    await updateDoc(doc4, {
      imageUrl: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600",
      image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600"
    });
    console.log("Updated Tandoori Roti.");

    console.log("All updates complete!");
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

run();
