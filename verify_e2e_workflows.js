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

const results = {
  pass: 0,
  fail: 0,
  details: {}
};

function assert(condition, message, moduleName) {
  if (!results.details[moduleName]) {
    results.details[moduleName] = [];
  }
  
  if (condition) {
    console.log(`[PASS] [${moduleName}] ${message}`);
    results.pass++;
    results.details[moduleName].push({ status: "PASS", message });
  } else {
    console.error(`[FAIL] [${moduleName}] ${message}`);
    results.fail++;
    results.details[moduleName].push({ status: "FAIL", message });
  }
}

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
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (e) {
    console.error("FATAL: Cannot initialize E2E Admin:", e.message);
    process.exit(1);
    return;
  }

  // --- MODULE 6-8: MENU & CATEGORY MANAGEMENT ---
  const moduleMenu = "Menu Management";
  let categoryId = "";
  let menuItemId = "";
  
  try {
    const catRef = await addDoc(collection(db, "categories"), {
      name: "E2E Test Category",
      sortOrder: 99,
      isActive: true,
      isDeleted: false,
      createdAt: serverTimestamp()
    });
    categoryId = catRef.id;
    assert(true, `Created category ${categoryId}`, moduleMenu);

    const menuRef = await addDoc(collection(db, "menuItems"), {
      categoryId: categoryId,
      name: "E2E Test Burger",
      price: 199.0,
      trackInventory: true,
      stockQuantity: 10,
      isActive: true,
      isDeleted: false,
      createdAt: serverTimestamp()
    });
    menuItemId = menuRef.id;
    assert(true, `Created menu item ${menuItemId}`, moduleMenu);

    const docSnap = await getDoc(doc(db, "menuItems", menuItemId));
    assert(docSnap.exists() && docSnap.data().name === "E2E Test Burger", "Read menu item successfully", moduleMenu);
  } catch (e) {
    assert(false, `Menu CRUD failed: ${e.message}`, moduleMenu);
  }

  // --- MODULE 7: DIET MENU MANAGEMENT ---
  const moduleDiet = "Diet Menu Management";
  let dietCategoryId = "";
  let dietFoodId = "";
  let mealPlanId = "";
  
  try {
    const dietCatRef = await addDoc(collection(db, "dietCategories"), {
      name: "E2E Test Diet Category",
      isActive: true,
      isDeleted: false
    });
    dietCategoryId = dietCatRef.id;
    assert(true, `Created diet category ${dietCategoryId}`, moduleDiet);

    const dietRef = await addDoc(collection(db, "dietFoods"), {
      categoryId: dietCategoryId,
      name: "E2E Keto Salad",
      price: 249.0,
      calories: 300,
      protein: 20,
      isActive: true,
      isDeleted: false
    });
    dietFoodId = dietRef.id;
    assert(true, `Created diet food ${dietFoodId}`, moduleDiet);

    const mealPlanRef = await addDoc(collection(db, "mealPlans"), {
      name: "E2E 7-Day Keto",
      durationDays: 7,
      price: 1499.0,
      isActive: true
    });
    mealPlanId = mealPlanRef.id;
    assert(true, `Created meal plan ${mealPlanId}`, moduleDiet);
  } catch (e) {
    assert(false, `Diet Menu CRUD failed: ${e.message}`, moduleDiet);
  }

  // --- MODULE 9-10: CUSTOMERS & DELIVERY PARTNERS ---
  const moduleUsers = "User/Rider Management";
  let customerId = "";
  let riderId = "";

  try {
    customerId = `e2e_cust_${Date.now()}`;
    await setDoc(doc(db, "users", customerId), {
      name: "E2E Customer",
      role: "Customer",
      isActive: true,
      walletBalance: 500
    });
    assert(true, `Created customer ${customerId}`, moduleUsers);

    riderId = `e2e_rider_${Date.now()}`;
    await setDoc(doc(db, "deliveryPartners", riderId), {
      name: "E2E Rider",
      phone: "9876543211",
      status: "Online",
      isActive: true,
      currentLatitude: 16.3,
      currentLongitude: 80.4,
      batteryLevel: 90
    });
    assert(true, `Created delivery partner ${riderId}`, moduleUsers);
  } catch (e) {
    assert(false, `User CRUD failed: ${e.message}`, moduleUsers);
  }

  // --- MODULE 1-5: ORDER MANAGEMENT & ASSIGNMENT ---
  const moduleOrders = "Order Workflow";
  let orderId = "";

  try {
    const orderRef = await addDoc(collection(db, "orders"), {
      customer: "E2E Customer",
      customerId: customerId,
      items: [
        { id: menuItemId, name: "E2E Test Burger", qty: 2, price: 199.0 },
        { id: dietFoodId, name: "E2E Keto Salad", qty: 1, price: 249.0 }
      ],
      subtotal: 647.0,
      tax: 32.35,
      deliveryFee: 40.0,
      total: 719.35,
      status: "Pending",
      paymentMethod: "Wallet",
      createdAt: serverTimestamp()
    });
    orderId = orderRef.id;
    assert(true, `Order created: ${orderId}`, moduleOrders);

    await updateDoc(doc(db, "orders", orderId), { status: "Accepted" });
    assert(true, "Admin accepted order", moduleOrders);

    await updateDoc(doc(db, "orders", orderId), { 
      status: "Out for Delivery",
      assignedPartnerId: riderId,
      assignedPartnerName: "E2E Rider",
      assignmentMethod: "Manual"
    });
    assert(true, "Admin assigned rider manually", moduleOrders);
    
    await setDoc(doc(db, "orderTracking", orderId), {
      partnerId: riderId,
      currentLatitude: 16.301,
      currentLongitude: 80.401,
      updatedAt: serverTimestamp()
    });
    assert(true, "Order tracking created", moduleOrders);

    await updateDoc(doc(db, "orders", orderId), { status: "Delivered" });
    assert(true, "Order delivered", moduleOrders);

  } catch (e) {
    assert(false, `Order Workflow failed: ${e.message}`, moduleOrders);
  }

  // --- MODULE 12-13: BANNERS & COUPONS ---
  const modulePromos = "Promotions";
  let couponId = "";
  let bannerId = "";
  
  try {
    const bannerRef = await addDoc(collection(db, "banners"), {
      title: "E2E Banner",
      isActive: true,
      sortOrder: 1
    });
    bannerId = bannerRef.id;
    assert(true, `Created banner ${bannerId}`, modulePromos);
    
    const couponRef = await addDoc(collection(db, "coupons"), {
      code: "E2ETEST",
      discountType: "flat",
      discountValue: 100,
      isActive: true
    });
    couponId = couponRef.id;
    assert(true, `Created coupon ${couponId}`, modulePromos);
    
  } catch (e) {
    assert(false, `Promotions CRUD failed: ${e.message}`, modulePromos);
  }
  
  // --- CLEANUP ---
  console.log("Cleaning up E2E data...");
  try {
    if (orderId) await deleteDoc(doc(db, "orders", orderId));
    if (orderId) await deleteDoc(doc(db, "orderTracking", orderId));
    if (customerId) await deleteDoc(doc(db, "users", customerId));
    if (riderId) await deleteDoc(doc(db, "deliveryPartners", riderId));
    if (menuItemId) await deleteDoc(doc(db, "menuItems", menuItemId));
    if (categoryId) await deleteDoc(doc(db, "categories", categoryId));
    if (dietFoodId) await deleteDoc(doc(db, "dietFoods", dietFoodId));
    if (dietCategoryId) await deleteDoc(doc(db, "dietCategories", dietCategoryId));
    if (mealPlanId) await deleteDoc(doc(db, "mealPlans", mealPlanId));
    if (bannerId) await deleteDoc(doc(db, "banners", bannerId));
    if (couponId) await deleteDoc(doc(db, "coupons", couponId));
    
    await deleteDoc(doc(db, "users", user.uid));
  } catch (e) {
    console.warn("Cleanup failed partially:", e.message);
  }

  console.log("\n=== VERIFICATION RESULTS ===");
  console.log(`Passed: ${results.pass}`);
  console.log(`Failed: ${results.fail}`);
  
  Object.keys(results.details).forEach(mod => {
    console.log(`\n--- ${mod} ---`);
    results.details[mod].forEach(d => {
      console.log(`[${d.status}] ${d.message}`);
    });
  });
  
  process.exit(results.fail === 0 ? 0 : 1);
}

verify();
