import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, deleteDoc, getDocs, serverTimestamp } from "firebase/firestore";

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

async function purgeCollection(collectionName) {
  console.log(`Purging ${collectionName}...`);
  const snapshot = await getDocs(collection(db, collectionName));
  const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
  await Promise.all(deletePromises);
  console.log(`Purged ${snapshot.docs.length} documents from ${collectionName}`);
}

async function migrate() {
  console.log("=== STARTING PHASE 2 MIGRATION ===");
  
  const adminEmail = `temp_admin_phase2_${Date.now()}@homebites.com`;
  const adminPassword = "tempPassword123";
  let user;

  try {
    const cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
    user = cred.user;
    console.log(`Created admin auth user: ${adminEmail} (uid: ${user.uid})`);

    await setDoc(doc(db, "users", user.uid), {
      name: "Phase 2 Migrator",
      displayName: "Phase 2 Migrator",
      email: adminEmail,
      phone: "9999988889",
      mobileNumber: "9999988889",
      role: "Super Admin",
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log("Registered user as Super Admin in Firestore.");

    // Wait a brief moment for database rules replication
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (e) {
    console.error("Failed to authenticate as admin:", e.message);
    return;
  }

  // Purge existing collections
  await purgeCollection("categories");
  await purgeCollection("dietCategories");
  await purgeCollection("menuItems");
  await purgeCollection("dietFoods");

  // SEED REGULAR CATEGORIES
  const regularCategories = [
    "Starters", "Soups", "Salads", "Rice Bowls", "Biryanis", 
    "Rice Items", "Pasta", "Pizza", "Burgers", "Sandwiches", "Wraps", "Mutton"
  ];
  
  console.log("Seeding Regular Categories...");
  for (let i = 0; i < regularCategories.length; i++) {
    const catName = regularCategories[i];
    const catId = `cat_${catName.toLowerCase().replace(/\s+/g, '_')}`;
    
    await setDoc(doc(db, "categories", catId), {
      name: catName,
      imageUrl: "",
      sortOrder: i + 1,
      isActive: true,
      isDeleted: false,
      createdAt: serverTimestamp(),
    });

    // Seed 1 item per category
    const itemId = `item_${catId}_1`;
    await setDoc(doc(db, "menuItems", itemId), {
      categoryId: catId,
      name: `Classic ${catName} Item`,
      description: `Delicious ${catName} prepared with authentic ingredients.`,
      price: 150.0 + (i * 10),
      imageUrl: "",
      trackInventory: false,
      stockQuantity: 0,
      outOfStock: false,
      isActive: true,
      isDeleted: false,
      createdAt: serverTimestamp(),
    });
  }

  // SEED DIET CATEGORIES
  const dietCategories = [
    "Protein Salads", "High Protein Specials", "Diet Sandwiches", "Diet Wraps", "Meal Timing Filters"
  ];

  console.log("Seeding Diet Categories...");
  for (let i = 0; i < dietCategories.length; i++) {
    const catName = dietCategories[i];
    const catId = `diet_cat_${catName.toLowerCase().replace(/\s+/g, '_')}`;
    
    await setDoc(doc(db, "dietCategories", catId), {
      name: catName,
      imageUrl: "",
      sortOrder: i + 1,
      isActive: true,
      isDeleted: false,
      createdAt: serverTimestamp(),
    });

    // Seed 1 item per diet category
    const itemId = `diet_item_${catId}_1`;
    await setDoc(doc(db, "dietFoods", itemId), {
      categoryId: catId,
      name: `Healthy ${catName} Item`,
      description: `Nutritious and balanced ${catName}.`,
      price: 200.0 + (i * 10),
      calories: 300,
      protein: 20,
      carbs: 30,
      fat: 10,
      imageUrl: "",
      trackInventory: false,
      stockQuantity: 0,
      outOfStock: false,
      isActive: true,
      isDeleted: false,
      createdAt: serverTimestamp(),
    });
  }

  console.log("=== PHASE 2 MIGRATION COMPLETED ===");
}

migrate().catch(console.error);
