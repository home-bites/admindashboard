import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, addDoc, serverTimestamp, doc, setDoc } from "firebase/firestore";

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

const dietCategories = [
  { name: "Keto Friendly", description: "Low carb, high fat meals for ketosis.", sortOrder: 1, isActive: true },
  { name: "High Protein", description: "Muscle building high protein meals.", sortOrder: 2, isActive: true },
  { name: "Vegan", description: "100% plant-based diet meals.", sortOrder: 3, isActive: true },
  { name: "Low Calorie", description: "Weight loss friendly low calorie meals.", sortOrder: 4, isActive: true },
];

const dietFoods = [
  { 
    name: "Grilled Chicken Keto Bowl", 
    price: 349.0, 
    calories: 450, 
    protein: 45, 
    carbs: 8, 
    fat: 25, 
    description: "Tender grilled chicken with avocado and leafy greens.", 
    categoryName: "Keto Friendly",
    isActive: true 
  },
  { 
    name: "Zucchini Noodles with Pesto", 
    price: 299.0, 
    calories: 320, 
    protein: 10, 
    carbs: 12, 
    fat: 28, 
    description: "Fresh zoodles tossed in homemade basil pesto.", 
    categoryName: "Keto Friendly",
    isActive: true 
  },
  { 
    name: "Double Breast Chicken Salad", 
    price: 399.0, 
    calories: 550, 
    protein: 65, 
    carbs: 15, 
    fat: 18, 
    description: "Massive protein hit with double chicken breast portions.", 
    categoryName: "High Protein",
    isActive: true 
  },
  { 
    name: "Tofu Quinoa Bowl", 
    price: 329.0, 
    calories: 410, 
    protein: 22, 
    carbs: 45, 
    fat: 15, 
    description: "Protein packed vegan meal with organic tofu and super-grains.", 
    categoryName: "Vegan",
    isActive: true 
  },
  { 
    name: "Mediterranean Chickpea Salad", 
    price: 249.0, 
    calories: 280, 
    protein: 12, 
    carbs: 35, 
    fat: 8, 
    description: "Light and refreshing salad with cucumber, tomato and feta.", 
    categoryName: "Low Calorie",
    isActive: true 
  }
];

async function seedDietData() {
  console.log("Seeding Diet Categories and Foods...");
  
  const adminEmail = `seeder_${Date.now()}@homebites.com`;
  const adminPassword = "E2EPassword123!";
  let user;

  try {
    const cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
    user = cred.user;
    await setDoc(doc(db, "users", user.uid), {
      name: "Data Seeder",
      email: adminEmail,
      role: "Super Admin",
      isActive: true,
      createdAt: serverTimestamp()
    });
    console.log("Logged in as Data Seeder:", user.uid);
    await new Promise(r => setTimeout(r, 2000));
  } catch(e) {
    console.log("Could not create user:", e.message);
    process.exit(1);
  }

  const categoryMap = {};

  // Seed Categories
  for (const cat of dietCategories) {
    const ref = await addDoc(collection(db, "dietCategories"), { ...cat, isDeleted: false, createdAt: serverTimestamp() });
    categoryMap[cat.name] = ref.id;
    console.log(`Added Diet Category: ${cat.name}`);
  }

  // Seed Foods
  for (const food of dietFoods) {
    const foodData = { ...food };
    foodData.categoryId = categoryMap[food.categoryName];
    delete foodData.categoryName;
    
    await addDoc(collection(db, "dietFoods"), { ...foodData, isDeleted: false, createdAt: serverTimestamp() });
    console.log(`Added Diet Food: ${food.name}`);
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seedDietData();
