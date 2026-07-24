import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
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
  { name: "Weight Loss", description: "Low calorie deficit meals designed for body fat loss.", sortOrder: 1, isActive: true },
  { name: "High Protein", description: "High protein macro meals for muscle hypertrophy.", sortOrder: 2, isActive: true },
  { name: "Keto", description: "Strict low carb high fat ketosis meals.", sortOrder: 3, isActive: true },
  { name: "Low Carb", description: "Controlled carbohydrate balanced nutrition.", sortOrder: 4, isActive: true },
  { name: "Vegan", description: "100% plant-based organic meals.", sortOrder: 5, isActive: true },
  { name: "Vegetarian", description: "Nutritious Indian vegetarian recipes.", sortOrder: 6, isActive: true },
  { name: "Diabetic Friendly", description: "Low Glycemic Index GI meals for sugar control.", sortOrder: 7, isActive: true },
  { name: "Muscle Gain", description: "Calorie surplus macro nutrient meals.", sortOrder: 8, isActive: true },
  { name: "Morning Breakfast", description: "Energizing healthy morning meals.", sortOrder: 9, isActive: true },
  { name: "Balanced Lunch", description: "Complete afternoon nutrition bowl.", sortOrder: 10, isActive: true },
  { name: "Evening Snacks", description: "Light high-protein snacks.", sortOrder: 11, isActive: true },
  { name: "Dinner", description: "Light calorie controlled night meals.", sortOrder: 12, isActive: true },
  { name: "Protein Shakes", description: "Whey isolate & plant protein shakes.", sortOrder: 13, isActive: true },
  { name: "Detox Drinks", description: "Cold-pressed green detox beverages.", sortOrder: 14, isActive: true },
];

const dietFoods = [
  {
    name: "Oats Vegetable Upma",
    description: "Fiber-rich roasted oats cooked with veggies, mustard seeds & curry leaves.",
    price: 189.0,
    imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&q=80",
    nutrition: { calories: 280, protein: 12, carbs: 42, fat: 6, fiber: 9 },
    categories: ["Weight Loss", "Morning Breakfast", "Low Carb", "Vegan", "Vegetarian"],
    isFeatured: true,
    rating: 4.9,
    prepTime: "15 mins",
    offer: "20% OFF",
    isActive: true
  },
  {
    name: "Grilled Paneer Protein Bowl",
    description: "Herb-marinated grilled paneer with quinoa, avocado & steamed broccoli.",
    price: 329.0,
    imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&q=80",
    nutrition: { calories: 420, protein: 28, carbs: 24, fat: 22, fiber: 7 },
    categories: ["High Protein", "Keto", "Balanced Lunch", "Vegetarian", "Muscle Gain"],
    isFeatured: true,
    rating: 4.8,
    prepTime: "20 mins",
    offer: "CHEF RECOMMENDED",
    isActive: true
  },
  {
    name: "Chicken Protein Macro Bowl",
    description: "Tender chicken breast with brown rice, sautéed spinach & roasted chickpeas.",
    price: 369.0,
    imageUrl: "https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=500&q=80",
    nutrition: { calories: 480, protein: 46, carbs: 35, fat: 12, fiber: 8 },
    categories: ["High Protein", "Muscle Gain", "Balanced Lunch", "Dinner"],
    isFeatured: true,
    rating: 4.9,
    prepTime: "25 mins",
    offer: "BESTSELLER",
    isActive: true
  },
  {
    name: "Sprouts & Pomegranate Chaat",
    description: "Crunchy sprouted moong, pomegranate, lemon & chat masala dressing.",
    price: 149.0,
    imageUrl: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500&q=80",
    nutrition: { calories: 190, protein: 14, carbs: 28, fat: 3, fiber: 10 },
    categories: ["Weight Loss", "Evening Snacks", "Vegan", "Diabetic Friendly", "Low Carb"],
    isFeatured: true,
    rating: 4.7,
    prepTime: "10 mins",
    offer: "10% OFF",
    isActive: true
  },
  {
    name: "Multigrain Moong Dal Cheela",
    description: "Golden savory pancakes filled with grated paneer & coriander chutney.",
    price: 219.0,
    imageUrl: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&q=80",
    nutrition: { calories: 310, protein: 20, carbs: 38, fat: 8, fiber: 7 },
    categories: ["Morning Breakfast", "High Protein", "Vegetarian", "Diabetic Friendly"],
    isFeatured: true,
    rating: 4.8,
    prepTime: "15 mins",
    offer: "HIGH FIBER",
    isActive: true
  },
  {
    name: "Millet & Lentil Khichdi Bowl",
    description: "Comforting foxtail millet khichdi with desi ghee & flax seeds.",
    price: 249.0,
    imageUrl: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=500&q=80",
    nutrition: { calories: 340, protein: 15, carbs: 48, fat: 7, fiber: 9 },
    categories: ["Dinner", "Senior Citizen Meals", "Vegetarian", "Diabetic Friendly"],
    isFeatured: true,
    rating: 4.9,
    prepTime: "20 mins",
    offer: "EASY DIGESTION",
    isActive: true
  },
  {
    name: "Keto Grilled Fish Fillet",
    description: "Pan-seared Basa fillet with lemon herb butter & asparagus.",
    price: 429.0,
    imageUrl: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=500&q=80",
    nutrition: { calories: 390, protein: 42, carbs: 4, fat: 24, fiber: 4 },
    categories: ["Keto", "High Protein", "Dinner", "Low Carb"],
    isFeatured: true,
    rating: 4.9,
    prepTime: "25 mins",
    offer: "PREMIUM KETO",
    isActive: true
  },
  {
    name: "Cold-Pressed Green Detox Juice",
    description: "Refreshing cucumber, spinach, green apple, ginger & mint blast.",
    price: 139.0,
    imageUrl: "https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500&q=80",
    nutrition: { calories: 110, protein: 3, carbs: 22, fat: 1, fiber: 5 },
    categories: ["Detox Drinks", "Healthy Drinks", "Vegan", "Weight Loss"],
    isFeatured: true,
    rating: 4.8,
    prepTime: "5 mins",
    offer: "100% ORGANIC",
    isActive: true
  },
  {
    name: "Whey Protein Berry Smoothie",
    description: "Blend of whey isolate, blueberries, almond milk & chia seeds.",
    price: 249.0,
    imageUrl: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500&q=80",
    nutrition: { calories: 290, protein: 32, carbs: 26, fat: 5, fiber: 6 },
    categories: ["Protein Shakes", "Muscle Gain", "Healthy Drinks"],
    isFeatured: true,
    rating: 4.9,
    prepTime: "5 mins",
    offer: "POST WORKOUT",
    isActive: true
  }
];

const mealPlans = [
  {
    title: "Weight Loss Transformation",
    subtitle: "Calorie deficit 1400 kcal daily plan",
    description: "Personalized weight loss meal plan curated by certified nutritionists.",
    imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=500&q=80",
    type: "Weekly",
    duration: "7 Days",
    price: 2499.0,
    mealsPerDay: 3,
    calories: 1400,
    protein: 90,
    discount: "25% OFF",
    benefits: "3 Meals/Day • Free Doctor Consult • Weekly Macro Tweak",
    isRecommended: true,
    isActive: true
  },
  {
    title: "Lean Muscle Gain Plan",
    subtitle: "High protein 2200 kcal hyper-trophy plan",
    description: "Supercharge muscle synthesis with premium lean meats & cottage cheese.",
    imageUrl: "https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=500&q=80",
    type: "Monthly",
    duration: "30 Days",
    price: 8999.0,
    mealsPerDay: 4,
    calories: 2200,
    protein: 150,
    discount: "30% OFF",
    benefits: "4 Meals/Day • Gym Supplement Guide • Fresh Chef Delivery",
    isRecommended: true,
    isActive: true
  },
  {
    title: "Strict Keto Ketosis Plan",
    subtitle: "< 20g net carbs ketogenic lifestyle",
    description: "Keep your body in prime fat-burning state with healthy fats & avocados.",
    imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&q=80",
    type: "Weekly",
    duration: "7 Days",
    price: 2999.0,
    mealsPerDay: 3,
    calories: 1600,
    protein: 110,
    discount: "15% OFF",
    benefits: "3 Meals/Day • Keto Strips Included • Zero Sugar Guarantee",
    isRecommended: true,
    isActive: true
  },
  {
    title: "Diabetic Friendly Care",
    subtitle: "Low Glycemic Index & High Fiber",
    description: "Control blood sugar spikes with complex carbs, seeds and legumes.",
    imageUrl: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=500&q=80",
    type: "Monthly",
    duration: "30 Days",
    price: 7499.0,
    mealsPerDay: 3,
    calories: 1500,
    protein: 85,
    discount: "20% OFF",
    benefits: "3 Meals/Day • Low GI Certified • Doctor Approved",
    isRecommended: true,
    isActive: true
  }
];

const subscriptions = [
  {
    title: "Corporate Healthy Lunch Box",
    description: "Daily office delivery of chef-crafted balanced thali with salad.",
    price: 3999.0,
    duration: "Monthly",
    mealsPerDay: 1,
    status: "Active",
    discount: "15% OFF",
    createdAt: new Date().toISOString()
  },
  {
    title: "Gym Bro High-Protein Subscription",
    description: "Double protein lunch & dinner for active gym athletes.",
    price: 9999.0,
    duration: "Monthly",
    mealsPerDay: 2,
    status: "Active",
    discount: "20% OFF",
    createdAt: new Date().toISOString()
  }
];

const dietOffers = [
  {
    code: "NUTRI30",
    title: "30% OFF NutriDiet Meals",
    discountType: "Percentage",
    discountValue: 30,
    minOrderValue: 299,
    isActive: true,
    expiryDate: "2026-12-31"
  },
  {
    code: "KETOFIT",
    title: "Flat ₹100 Off on Keto Bowls",
    discountType: "Flat Discount",
    discountValue: 100,
    minOrderValue: 399,
    isActive: true,
    expiryDate: "2026-12-31"
  }
];

const dietBanners = [
  {
    title: "CLINICALLY BALANCED NUTRITION MEALS",
    imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&q=80",
    tag: "CHEF SPECIAL",
    isActive: true
  }
];

async function seedEcosystem() {
  console.log("=== SEEDING FULL DIET ECOSYSTEM ===");

  // Login seeder
  let adminUid = "";
  try {
    const cred = await signInWithEmailAndPassword(auth, "superadmin@homebites.com", "AdminPassword123!");
    adminUid = cred.user.uid;
    console.log("Logged in as Super Admin:", adminUid);
  } catch(e) {
    console.log("Could not login Super Admin:", e.message);
    process.exit(1);
  }

  // 1. Categories
  for (const cat of dietCategories) {
    await addDoc(collection(db, "dietCategories"), { ...cat, createdAt: serverTimestamp() });
    console.log(`[Seed] Added dietCategory: ${cat.name}`);
  }

  // 2. Diet Foods
  for (const food of dietFoods) {
    await addDoc(collection(db, "dietFoods"), { ...food, createdAt: serverTimestamp() });
    console.log(`[Seed] Added dietFood: ${food.name}`);
  }

  // 3. Meal Plans
  for (const plan of mealPlans) {
    await addDoc(collection(db, "mealPlans"), { ...plan, createdAt: serverTimestamp() });
    console.log(`[Seed] Added mealPlan: ${plan.title}`);
  }

  // 4. Subscriptions
  for (const sub of subscriptions) {
    await addDoc(collection(db, "subscriptions"), { ...sub, userId: adminUid, createdAt: serverTimestamp() });
    console.log(`[Seed] Added subscription: ${sub.title}`);
  }

  // 5. Diet Offers
  for (const offer of dietOffers) {
    await addDoc(collection(db, "dietOffers"), { ...offer, createdAt: serverTimestamp() });
    console.log(`[Seed] Added dietOffer: ${offer.code}`);
  }

  // 6. Diet Banners
  for (const banner of dietBanners) {
    await addDoc(collection(db, "dietBanners"), { ...banner, createdAt: serverTimestamp() });
    console.log(`[Seed] Added dietBanner: ${banner.title}`);
  }

  console.log("=== DIET ECOSYSTEM SEEDING COMPLETE ===");
  process.exit(0);
}

seedEcosystem();
