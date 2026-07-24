import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  updateDoc, 
  serverTimestamp, 
  deleteDoc
} from "firebase/firestore";

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

async function verify() {
  console.log("=== STARTING END-TO-END FIRESTORE VERIFICATION ===");
  
  const adminEmail = `e2e_admin_${Date.now()}@homebites.com`;
  const adminPassword = "E2EPassword123!";
  let user;

  try {
    const cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
    user = cred.user;
    
    await setDoc(doc(db, "users", user.uid), {
      name: "E2E Tester",
      email: adminEmail,
      role: "Super Admin",
      isActive: true,
      createdAt: serverTimestamp()
    });
    
    console.log(`Logged in as E2E Admin: ${user.uid}`);
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for rule propagation
  } catch (e) {
    console.error("FATAL: Cannot initialize E2E Admin:", e.message);
    process.exit(1);
  }

  try {
    const dietCatRef = await addDoc(collection(db, "dietCategories"), {
      name: "E2E Test Diet Category",
      isActive: true,
      isDeleted: false
    });
    console.log("Created dietCategory:", dietCatRef.id);
  } catch(e) {
    console.error("Failed on dietCategories:", e.message);
  }

  try {
    const dietRef = await addDoc(collection(db, "dietFoods"), {
      categoryId: "dummy",
      name: "E2E Keto Salad",
      price: 249.0,
      calories: 300,
      protein: 20,
      isActive: true,
      isDeleted: false
    });
    console.log("Created dietFood:", dietRef.id);
  } catch(e) {
    console.error("Failed on dietFoods:", e.message);
  }

  try {
    const mealPlanRef = await addDoc(collection(db, "mealPlans"), {
      name: "E2E 7-Day Keto",
      durationDays: 7,
      price: 1499.0,
      isActive: true
    });
    console.log("Created mealPlan:", mealPlanRef.id);
  } catch(e) {
    console.error("Failed on mealPlans:", e.message);
  }

  try {
    const riderId = `e2e_rider_${Date.now()}`;
    await setDoc(doc(db, "deliveryPartners", riderId), {
      name: "E2E Rider",
      phone: "9876543211",
      status: "Online",
      isActive: true,
      currentLatitude: 16.3,
      currentLongitude: 80.4,
      batteryLevel: 90
    });
    console.log("Created deliveryPartner:", riderId);
  } catch(e) {
    console.error("Failed on deliveryPartners:", e.message);
  }

  try {
    const orderRef = await addDoc(collection(db, "orders"), {
      customer: "E2E Customer",
      customerId: user.uid,
      items: [],
      subtotal: 647.0,
      tax: 32.35,
      deliveryFee: 40.0,
      total: 719.35,
      status: "Pending",
      paymentMethod: "Wallet",
      createdAt: serverTimestamp()
    });
    console.log("Created order:", orderRef.id);
  } catch(e) {
    console.error("Failed on orders:", e.message);
  }

  process.exit(0);
}

verify();
