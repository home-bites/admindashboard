import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

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

async function seed() {
  console.log("=== SEEDING FIRESTORE DATABASE WITH ADMIN CREDENTIALS ===");
  
  const adminEmail = `temp_admin_${Date.now()}@homebites.com`;
  const adminPassword = "tempPassword123";
  let user;

  try {
    // 1. Create a user
    const cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
    user = cred.user;
    console.log(`Created admin auth user: ${adminEmail} (uid: ${user.uid})`);

    // 2. Write their user document with role: 'Super Admin' so they bypass write checks
    await setDoc(doc(db, "users", user.uid), {
      name: "Temporary Seeder Admin",
      displayName: "Seeder Admin",
      email: adminEmail,
      phone: "+91 99999 88888",
      mobileNumber: "+91 99999 88888",
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

  // 3. App Settings
  console.log("Seeding appSettings...");
  await setDoc(doc(db, "appSettings", "general"), {
    storeOpen: true,
    maintenanceMode: false,
    deliveryCharge: 40.0,
    rainCharge: 0.0,
    minimumOrderValue: 200.0,
    platformFee: 5.0,
    taxRate: 5.0,
    minimumAppVersion: "1.0.0",
    latestAppVersion: "1.0.0",
    forceUpdateEnabled: false,
    serviceCity: "Guntur",
    serviceState: "Andhra Pradesh",
    deliveryRadiusKm: 15.0,
    centerLatitude: 16.3067,
    centerLongitude: 80.4365,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 4. Categories
  console.log("Seeding categories...");
  const categories = [
    { id: "cat_indian", name: "North Indian", sortOrder: 1, isActive: true, isDeleted: false },
    { id: "cat_italian", name: "Italian Gourmet", sortOrder: 2, isActive: true, isDeleted: false },
    { id: "cat_chinese", name: "Asian Fusion", sortOrder: 3, isActive: true, isDeleted: false },
    { id: "cat_desserts", name: "Sweet Indulgences", sortOrder: 4, isActive: true, isDeleted: false },
  ];

  for (const cat of categories) {
    await setDoc(doc(db, "categories", cat.id), {
      name: cat.name,
      imageUrl: "",
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      isDeleted: cat.isDeleted,
      createdAt: serverTimestamp(),
    });
  }

  // 5. Menu Items
  console.log("Seeding menuItems...");
  const menuItems = [
    {
      id: "menu_paneer_butter",
      categoryId: "cat_indian",
      name: "Paneer Butter Masala",
      description: "Creamy, rich, and delicious cottage cheese curry cooked in tomato-onion butter gravy.",
      price: 249.00,
      imageUrl: "",
      trackInventory: true,
      stockQuantity: 50,
      outOfStock: false,
      isActive: true,
      isDeleted: false,
    },
    {
      id: "menu_butter_rotis",
      categoryId: "cat_indian",
      name: "Tandoori Roti (Butter)",
      description: "Freshly baked flatbread in clay oven topped with premium butter.",
      price: 25.00,
      imageUrl: "",
      trackInventory: false,
      stockQuantity: 0,
      outOfStock: false,
      isActive: true,
      isDeleted: false,
    },
    {
      id: "menu_pasta_alfredo",
      categoryId: "cat_italian",
      name: "Penne Alfredo",
      description: "Gourmet penne pasta tossed in rich white cheese sauce with mushrooms and broccoli.",
      price: 299.00,
      imageUrl: "",
      trackInventory: true,
      stockQuantity: 20,
      outOfStock: false,
      isActive: true,
      isDeleted: false,
    },
    {
      id: "menu_margherita",
      categoryId: "cat_italian",
      name: "Classic Margherita Pizza",
      description: "Thick crust sourdough pizza loaded with mozzarella cheese and fresh basil leaves.",
      price: 349.00,
      imageUrl: "",
      trackInventory: true,
      stockQuantity: 15,
      outOfStock: false,
      isActive: true,
      isDeleted: false,
    },
    {
      id: "menu_hakka_noodles",
      categoryId: "cat_chinese",
      name: "Schezwan Hakka Noodles",
      description: "Spicy stir-fried noodles cooked in garlic Schezwan paste and mixed seasonal vegetables.",
      price: 189.00,
      imageUrl: "",
      trackInventory: true,
      stockQuantity: 30,
      outOfStock: false,
      isActive: true,
      isDeleted: false,
    },
    {
      id: "menu_brownie",
      categoryId: "cat_desserts",
      name: "Sizzling Chocolate Brownie",
      description: "Warm fudge brownie served with a scoop of vanilla bean ice cream and sizzling hot fudge.",
      price: 159.00,
      imageUrl: "",
      trackInventory: true,
      stockQuantity: 25,
      outOfStock: false,
      isActive: true,
      isDeleted: false,
    },
  ];

  for (const item of menuItems) {
    await setDoc(doc(db, "menuItems", item.id), {
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      price: item.price,
      imageUrl: item.imageUrl,
      trackInventory: item.trackInventory,
      stockQuantity: item.stockQuantity,
      outOfStock: item.outOfStock,
      isActive: item.isActive,
      isDeleted: item.isDeleted,
      createdAt: serverTimestamp(),
    });
  }

  // 6. Banners
  console.log("Seeding banners...");
  const banners = [
    {
      id: "banner_1",
      title: "50% Off First Order",
      imageUrl: "",
      redirectUrl: "Use code: FIRST50",
      sortOrder: 1,
      isActive: true,
      isDeleted: false,
    },
    {
      id: "banner_2",
      title: "Gourmet Italian Delights",
      imageUrl: "",
      redirectUrl: "Explore Italian Gourmet selection",
      sortOrder: 2,
      isActive: true,
      isDeleted: false,
    },
  ];

  for (const banner of banners) {
    await setDoc(doc(db, "banners", banner.id), {
      title: banner.title,
      imageUrl: banner.imageUrl,
      redirectUrl: banner.redirectUrl,
      sortOrder: banner.sortOrder,
      isActive: banner.isActive,
      isDeleted: banner.isDeleted,
      createdAt: serverTimestamp(),
    });
  }

  // 7. Deals
  console.log("Seeding deals...");
  const deals = [
    {
      id: "deal_1",
      title: "Super Saver Combo",
      description: "Get Paneer Butter Masala + 2 Rotis at just ₹220",
      discountPercentage: 20,
      isActive: true,
      isDeleted: false,
    }
  ];

  for (const deal of deals) {
    await setDoc(doc(db, "deals", deal.id), {
      title: deal.title,
      description: deal.description,
      discountPercentage: deal.discountPercentage,
      isActive: deal.isActive,
      isDeleted: deal.isDeleted,
      createdAt: serverTimestamp(),
    });
  }

  // 8. Coupons
  console.log("Seeding coupons...");
  const coupons = [
    {
      id: "coupon_first50",
      code: "FIRST50",
      discountType: "percentage",
      discountValue: 50.0,
      minOrderValue: 200.0,
      maxDiscountAmount: 150.0,
      isActive: true,
      isDeleted: false,
    },
    {
      id: "coupon_hb100",
      code: "HB100",
      discountType: "flat",
      discountValue: 100.0,
      minOrderValue: 500.0,
      maxDiscountAmount: 100.0,
      isActive: true,
      isDeleted: false,
    }
  ];

  for (const c of coupons) {
    await setDoc(doc(db, "coupons", c.id), {
      code: c.code,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrderValue: c.minOrderValue,
      maxDiscountAmount: c.maxDiscountAmount,
      isActive: c.isActive,
      isDeleted: c.isDeleted,
      createdAt: serverTimestamp(),
    });
  }

  console.log("=== SEEDING COMPLETED ===");
}

seed().catch(console.error);
