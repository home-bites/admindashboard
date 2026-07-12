import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, updateDoc } from "firebase/firestore";

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
  try {
    await signInWithEmailAndPassword(auth, "admin@homebites.local", "HomeBites@123");
    console.log("Signed in as Admin.");

    // Update Boneless Chicken Biriyani
    const biriyaniRef1 = doc(db, "menuItems", "CxkHeVOtmLAHsOoap3ix");
    await updateDoc(biriyaniRef1, {
      image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600",
      imageUrl: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600"
    });
    console.log("Updated Boneless Chicken Biriyani image.");

    // Update DUM BIRIYANI
    const biriyaniRef2 = doc(db, "menuItems", "o1MryXJGZHiWSr7Bhjqd");
    await updateDoc(biriyaniRef2, {
      image: "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600",
      imageUrl: "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600"
    });
    console.log("Updated DUM BIRIYANI image.");

    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

run();
