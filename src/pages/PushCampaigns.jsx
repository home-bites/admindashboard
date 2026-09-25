import React, { useState, useEffect, useMemo, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, doc, getDocs, deleteDoc, writeBatch } from "firebase/firestore";
import { functions, db } from "../firebase/firebaseConfig";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { uploadFile } from "../firebase/storage";
import { notificationRepository } from "../repositories";
import DestinationSelector, { parseDestination, buildRedirectUrl } from "../components/DestinationSelector";

// 58 Curated, High-Converting Food Delivery Push Templates
export const CAMPAIGN_TEMPLATES = [
  // 1. Biryani & Rice Specials (8)
  {
    id: "biryani_dum",
    category: "biryani",
    categoryLabel: "Biryani & Rice",
    icon: "🍲",
    title: "వేడి వేడి బిర్యానీ రెడీ! 🍲",
    message: "Hungry? Piping hot authentic home-style dum biryani is fresh from the pot! Order now before the lunch rush.",
    deepLink: "category:biryani",
    audience: "all",
  },
  {
    id: "biryani_fry_piece",
    category: "biryani",
    categoryLabel: "Biryani & Rice",
    icon: "🍗",
    title: "చికెన్ ఫ్రై పీస్ బిర్యానీ ఘుమఘుమలు! 🍗",
    message: "Crispy spicy chicken pieces on fragrant aromatic biryani rice. Handcrafted with traditional Andhra spices!",
    deepLink: "category:biryani",
    audience: "non_veg_lovers",
  },
  {
    id: "biryani_mutton",
    category: "biryani",
    categoryLabel: "Biryani & Rice",
    icon: "🍖",
    title: "మటన్ బిర్యానీ లవర్స్ కి స్పెషల్! 🍖",
    message: "Tender, succulent mutton pieces slow-cooked to perfection. Taste the authentic royal flavours today!",
    deepLink: "category:biryani",
    audience: "non_veg_lovers",
  },
  {
    id: "biryani_ghee_rice",
    category: "biryani",
    categoryLabel: "Biryani & Rice",
    icon: "🍛",
    title: "ఘీ రైస్ & చికెన్ రోస్ట్ కాంబో! 🍛",
    message: "Fragrant pure desi ghee rice paired with fiery homestyle chicken roast. A true culinary match made in heaven!",
    deepLink: "category:rice_specials",
    audience: "all",
  },
  {
    id: "biryani_bagara",
    category: "biryani",
    categoryLabel: "Biryani & Rice",
    icon: "🤤",
    title: "బగారా రైస్ & దాల్చా కాంబినేషన్! 🤤",
    message: "Traditional Hyderabadi Bagara Rice with rich tangy Dalcha and spicy korma. Authentic comfort food delivered hot!",
    deepLink: "category:biryani",
    audience: "all",
  },
  {
    id: "biryani_veg_dum",
    category: "biryani",
    categoryLabel: "Biryani & Rice",
    icon: "🌿",
    title: "స్పెషల్ వెజ్ దమ్ బిర్యానీ! 🌿",
    message: "Garden-fresh vegetables, golden fried paneer cubes, and aromatic saffron basmati rice. Pure vegetarian heaven!",
    deepLink: "category:veg_specials",
    audience: "veg_lovers",
  },
  {
    id: "biryani_pulao",
    category: "biryani",
    categoryLabel: "Biryani & Rice",
    icon: "🍚",
    title: "ఆంధ్రా స్టైల్ పలావ్ ప్రేమికులకు పండుగే! 🍚",
    message: "Spiced to perfection with green chilies, whole garam masala, and served with cool onion raita.",
    deepLink: "category:biryani",
    audience: "all",
  },
  {
    id: "biryani_late_night",
    category: "biryani",
    categoryLabel: "Biryani & Rice",
    icon: "🌙",
    title: "మిడ్-నైట్ బిర్యానీ క్రేవింగ్స్? 🌙",
    message: "Late night hunger pangs? HomeBites is cooking! Order steaming hot biryani and spicy gravies right now.",
    deepLink: "category:biryani",
    audience: "all",
  },

  // 2. Lunch Rush & Daily Meals (8)
  {
    id: "lunch_thali",
    category: "lunch",
    categoryLabel: "Lunch Meals",
    icon: "🍱",
    title: "మధ్యాహ్న భోజనం సమయం అయింది! 😋",
    message: "Fresh, healthy, home-cooked meals delivered right to your doorstep. Complete South Indian thali with curries!",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "lunch_pappu_ghee",
    category: "lunch",
    categoryLabel: "Lunch Meals",
    icon: "🥣",
    title: "అమ్మ చేతి ముద్దపప్పు & నెయ్యి గుర్తుకొచ్చిందా? 🥣",
    message: "Pure nostalgia in every bite! Steaming rice with thick dal, pure cow ghee, and crispy fryums.",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "lunch_sambar_rice",
    category: "lunch",
    categoryLabel: "Lunch Meals",
    icon: "🍲",
    title: "వేడి వేడి సాంబార్ & గుమగుమలాడే అన్నం! 🍲",
    message: "Authentic drumstick & shallot sambar made with freshly roasted spices. Wholesome nutrition for your workday.",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "lunch_office_combo",
    category: "lunch",
    categoryLabel: "Lunch Meals",
    icon: "💼",
    title: "ఆఫీస్ లంచ్ టెన్షన్ ఎందుకు? 🍱",
    message: "Skip the cafeteria queues. Order an executive mini meal with 2 curries, rotis, rice, and sweet in 30 mins!",
    deepLink: "category:combos",
    audience: "active_30_days",
  },
  {
    id: "lunch_andhra_chicken",
    category: "lunch",
    categoryLabel: "Lunch Meals",
    icon: "🌶️",
    title: "స్పైసీ కోడికూర & వేడి అన్నం! 🌶️",
    message: "Traditional spicy country chicken gravy packed with fresh herbs and pepper. Spice up your afternoon lunch!",
    deepLink: "menu",
    audience: "non_veg_lovers",
  },
  {
    id: "lunch_fresh_box",
    category: "lunch",
    categoryLabel: "Lunch Meals",
    icon: "📦",
    title: "తాజా వేడి లంచ్ బాక్స్ రెడీ! 📦",
    message: "No refrigerated food, no chemicals. Every meal freshly prepared by our verified home chefs just for you.",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "lunch_curd_rice",
    category: "lunch",
    categoryLabel: "Lunch Meals",
    icon: "🥭",
    title: "చల్లని పెరుగన్నం విత్ ఘాటైన ఆవకాయ! 🥭",
    message: "Cool down your body with creamy tadka curd rice and spicy homemade mango pickle. Pure bliss!",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "lunch_mini_meals",
    category: "lunch",
    categoryLabel: "Lunch Meals",
    icon: "🍛",
    title: "మినీ మీల్స్ సూపర్ సేవర్ డీల్! 🍛",
    message: "Light on your stomach, gentle on your wallet. Order fresh homestyle meals starting at just ₹129!",
    deepLink: "offers",
    audience: "all",
  },

  // 3. Dinner Comfort & Night Bites (8)
  {
    id: "dinner_no_cooking",
    category: "dinner",
    categoryLabel: "Dinner Comfort",
    icon: "🌙",
    title: "రాత్రికి వంట చేసే మూడ్ లేదా? 🌙",
    message: "Relax after a long day! Delicious, homely dinner is just a tap away. Order soft rotis, curries & dal.",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "dinner_phulkas_paneer",
    category: "dinner",
    categoryLabel: "Dinner Comfort",
    icon: "🫓",
    title: "మెత్తని పుల్కాలు & పనీర్ బటర్ మసాలా! 🫓",
    message: "Soft whole-wheat phulkas served with silky rich paneer butter gravy. Healthy and comforting dinner.",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "dinner_rotis_curry",
    category: "dinner",
    categoryLabel: "Dinner Comfort",
    icon: "🥘",
    title: "వేడి రోటీలు & ఆంధ్ర చికెన్ కర్రీ! 🥘",
    message: "Hot handmade rotis paired with flavorful homestyle chicken curry. The perfect family dinner combo.",
    deepLink: "menu",
    audience: "non_veg_lovers",
  },
  {
    id: "dinner_light_khichdi",
    category: "dinner",
    categoryLabel: "Dinner Comfort",
    icon: "🥣",
    title: "హాయిగా నిద్రపట్టే తేలికపాటి కిచిడీ! 🥣",
    message: "Soothing yellow moong dal khichdi tempered with pure ghee, cumin, and ginger. Gentle, healthy, and satisfying.",
    deepLink: "diet",
    audience: "all",
  },
  {
    id: "dinner_chapati_rolls",
    category: "dinner",
    categoryLabel: "Dinner Comfort",
    icon: "🌯",
    title: "డిన్నర్ కి బెస్ట్ చపాతీ రోల్స్! 🌯",
    message: "Craving a quick bite? Try our loaded paneer tikka and egg kathi rolls with mint chutney.",
    deepLink: "menu",
    audience: "active_30_days",
  },
  {
    id: "dinner_late_night",
    category: "dinner",
    categoryLabel: "Dinner Comfort",
    icon: "⏰",
    title: "లేట్ నైట్ డిన్నర్? డోంట్ వర్రీ! ⏰",
    message: "Working late tonight? Our night kitchens are sizzling. Order warm meals delivered safely to your gate.",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "dinner_veg_biryani",
    category: "dinner",
    categoryLabel: "Dinner Comfort",
    icon: "❄️",
    title: "చల్లటి రాత్రి.. వేడి వెజిటబుల్ బిర్యానీ! ❄️",
    message: "Fragrant basmati rice infused with whole spices and fresh veggies, paired with rich mirchi ka salan.",
    deepLink: "category:biryani",
    audience: "veg_lovers",
  },
  {
    id: "dinner_family_pack",
    category: "dinner",
    categoryLabel: "Dinner Comfort",
    icon: "👨‍👩‍👧‍👦",
    title: "ఫ్యామిలీ డిన్నర్ ప్యాక్ రెడీ! 👨‍👩‍👧‍👦",
    message: "Complete meal for 4 with rotis, rice, 2 rich curries, dal, and dessert. Feed the entire family happily!",
    deepLink: "category:combos",
    audience: "all",
  },

  // 4. Evening Snacks & Chai Time (6)
  {
    id: "snack_chai_samosa",
    category: "snacks",
    categoryLabel: "Snacks & Chai",
    icon: "☕",
    title: "చల్లని సాయంత్రం.. వేడి వేడి స్నాక్స్! ☕",
    message: "Craving crispy samosas or hot pakoras with your evening chai? Treat yourself to fresh snacks!",
    deepLink: "category:snacks",
    audience: "active_30_days",
  },
  {
    id: "snack_mirchi_bajji",
    category: "snacks",
    categoryLabel: "Snacks & Chai",
    icon: "🌶️",
    title: "కరకరలాడే మిర్చి బజ్జీ & ఉల్లిపాయ పకోడి! 🌶️",
    message: "Authentic street-style stuffed mirchi bajjis and crunchy onion pakodas, straight from the kadai!",
    deepLink: "category:snacks",
    audience: "all",
  },
  {
    id: "snack_punugulu",
    category: "snacks",
    categoryLabel: "Snacks & Chai",
    icon: "🧆",
    title: "సాయంత్రం టీ తో గుంటూరు పునుగులు! 🧆",
    message: "Crispy on the outside, fluffy inside! Served piping hot with fiery peanut chutney and spiced onions.",
    deepLink: "category:snacks",
    audience: "all",
  },
  {
    id: "snack_vada_filter_coffee",
    category: "snacks",
    categoryLabel: "Snacks & Chai",
    icon: "☕",
    title: "ఫిల్టర్ కాఫీ & వేడి మెదు వడలు! ☕",
    message: "Strong Kumbakonam style degree filter coffee with golden crispy medu vadas. The ultimate evening reboot!",
    deepLink: "category:snacks",
    audience: "all",
  },
  {
    id: "snack_onion_samosa",
    category: "snacks",
    categoryLabel: "Snacks & Chai",
    icon: "🥟",
    title: "టీ టైమ్ క్రంచీ ఇరానీ సమోసాలు! 🥟",
    message: "Mini crispy patti samosas stuffed with spiced onions and mint. Perfect companion for your evening tea.",
    deepLink: "category:snacks",
    audience: "all",
  },
  {
    id: "snack_egg_bonda",
    category: "snacks",
    categoryLabel: "Snacks & Chai",
    icon: "🥚",
    title: "ఎగ్ బోండా & స్పైసీ మిక్స్‌చర్! 🥚",
    message: "Boiled eggs dipped in spiced gram flour batter and fried golden. A protein-rich savory evening treat!",
    deepLink: "category:snacks",
    audience: "all",
  },

  // 5. Pure Veg & Sattvic Delights (6)
  {
    id: "veg_pure_sattvic",
    category: "veg",
    categoryLabel: "Pure Veg",
    icon: "🌿",
    title: "రుచికరమైన ప్యూర్ వెజ్ వంటకాలు 🌿",
    message: "Wholesome sattvic & home-style vegetarian delicacies crafted with pure ingredients and utmost care.",
    deepLink: "diet_veg",
    audience: "veg_lovers",
  },
  {
    id: "veg_gutti_vankaya",
    category: "veg",
    categoryLabel: "Pure Veg",
    icon: "🍆",
    title: "గుత్తి వంకాయ కూర & నెయ్యి అన్నం! 🍆",
    message: "Baby brinjals stuffed with peanut, sesame, and coconut masala paste. The undisputed queen of Andhra veg dishes!",
    deepLink: "menu",
    audience: "veg_lovers",
  },
  {
    id: "veg_dal_makhani",
    category: "veg",
    categoryLabel: "Pure Veg",
    icon: "🍛",
    title: "క్రీమీ దాల్ మఖానీ & జీరా రైస్! 🍛",
    message: "Slow-simmered black lentils cooked overnight with butter and fresh cream. Restaurant taste, home purity.",
    deepLink: "menu",
    audience: "veg_lovers",
  },
  {
    id: "veg_palak_paneer",
    category: "veg",
    categoryLabel: "Pure Veg",
    icon: "🥬",
    title: "పాలక్ పనీర్ విత్ సాఫ్ట్ పుల్కాలు! 🥬",
    message: "Vibrant spinach gravy loaded with soft malai paneer cubes. High protein, rich iron, zero preservatives.",
    deepLink: "menu",
    audience: "veg_lovers",
  },
  {
    id: "veg_mushroom_masala",
    category: "veg",
    categoryLabel: "Pure Veg",
    icon: "🍄",
    title: "మష్రూమ్ మసాలా స్పెషల్ డీల్! 🍄",
    message: "Fresh button mushrooms tossed in aromatic onion-tomato masala. Pairs perfectly with both rotis and rice.",
    deepLink: "menu",
    audience: "veg_lovers",
  },
  {
    id: "veg_saturday_thali",
    category: "veg",
    categoryLabel: "Pure Veg",
    icon: "🪷",
    title: "శనివారం స్పెషల్ ప్యూర్ వెజ్ తాలి! 🪷",
    message: "No onion, no garlic options available. Special devotional and fasting-friendly wholesome meals today.",
    deepLink: "diet_veg",
    audience: "veg_lovers",
  },

  // 6. Weekend Feasts & Sunday Daawat (6)
  {
    id: "weekend_sunday_daawat",
    category: "weekend",
    categoryLabel: "Weekend Feasts",
    icon: "🎉",
    title: "ఇవాళ సండే స్పెషల్ దావత్! 🎉",
    message: "Weekend calls for special food with family! Check out today's chef specials and weekend feasts.",
    deepLink: "offers",
    audience: "all",
  },
  {
    id: "weekend_nonveg_platter",
    category: "weekend",
    categoryLabel: "Weekend Feasts",
    icon: "🍗",
    title: "సండే నాన్-వెజ్ మేనియా! 🍗",
    message: "Chicken 65, Mutton Sukka, and aromatic Dum Biryani. Celebrate Sunday the true Andhra food lover way!",
    deepLink: "menu",
    audience: "non_veg_lovers",
  },
  {
    id: "weekend_kitchen_holiday",
    category: "weekend",
    categoryLabel: "Weekend Feasts",
    icon: "🛋️",
    title: "వీకెండ్ చిల్.. కిచెన్ కి సెలవు! 🛋️",
    message: "Put your feet up and binge your favorite shows! HomeBites chefs take care of breakfast, lunch, and dinner.",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "weekend_seafood_coastal",
    category: "weekend",
    categoryLabel: "Weekend Feasts",
    icon: "🍤",
    title: "స్పెషల్ ప్రాన్స్ బిర్యానీ & ఫిష్ ఫ్రై! 🍤",
    message: "Fresh catch of the day! Coastal Andhra style Vanjaram fish fry and spicy tiger prawn biryani.",
    deepLink: "category:seafood",
    audience: "non_veg_lovers",
  },
  {
    id: "weekend_bucket_biryani",
    category: "weekend",
    categoryLabel: "Weekend Feasts",
    icon: "🪣",
    title: "ఫ్యామిలీ వీకెండ్ బకెట్ బిర్యానీ! 🪣",
    message: "Generous portions for 4 to 5 people! Comes with eggs, salan, raita, and 4 gulab jamuns.",
    deepLink: "category:biryani",
    audience: "all",
  },
  {
    id: "weekend_free_dessert",
    category: "weekend",
    categoryLabel: "Weekend Feasts",
    icon: "🍯",
    title: "సండే స్వీట్ ట్రీట్ - గులాబ్ జామూన్ ఫ్రీ! 🍯",
    message: "Order above ₹399 today and get a complimentary portion of hot melt-in-mouth Gulab Jamuns!",
    deepLink: "offers",
    audience: "all",
  },

  // 7. Wallet, Cashback & Offers (6)
  {
    id: "offer_wallet_cashback",
    category: "offers",
    categoryLabel: "Wallet & Offers",
    icon: "💰",
    title: "మీ వాలెట్‌లో ఆఫర్ ఉంది! 💰",
    message: "Use your wallet balance or enjoy special discounts on your next delicious home-style meal.",
    deepLink: "wallet",
    audience: "with_offers",
  },
  {
    id: "offer_welcome50",
    category: "offers",
    categoryLabel: "Wallet & Offers",
    icon: "🏷️",
    title: "ఫ్లాట్ 50% ఆఫ్ - వెల్‌కమ్ ఆఫర్! 🏷️",
    message: "Use code WELCOME50 at checkout to unlock flat 50% discount on your favorite homemade dishes.",
    deepLink: "coupon:WELCOME50",
    audience: "all",
  },
  {
    id: "offer_free_delivery",
    category: "offers",
    categoryLabel: "Wallet & Offers",
    icon: "🛵",
    title: "ఉచిత డెలివరీ - ఈ రోజు మాత్రమే! 🛵",
    message: "Zero delivery fees on all orders above ₹199 today! Order your favorite curries and biryani now.",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "offer_topup_bonus",
    category: "offers",
    categoryLabel: "Wallet & Offers",
    icon: "💳",
    title: "వాలెట్ టాప్-అప్ పై 20% బోనస్ క్యాష్! 💳",
    message: "Add ₹500 or more to your HomeBites wallet and get instant ₹100 bonus credit for all future meals!",
    deepLink: "wallet",
    audience: "all",
  },
  {
    id: "offer_lunch75",
    category: "offers",
    categoryLabel: "Wallet & Offers",
    icon: "⏰",
    title: "లంచ్ అవర్ స్పెషల్ డిస్కౌంట్ ₹75 ఆఫ్! ⏰",
    message: "Valid between 12:00 PM and 02:30 PM only. Apply coupon LUNCH75 for instant savings!",
    deepLink: "coupon:LUNCH75",
    audience: "active_30_days",
  },
  {
    id: "offer_referral_reward",
    category: "offers",
    categoryLabel: "Wallet & Offers",
    icon: "🎁",
    title: "స్నేహితుడికి రెఫర్ చేసి ₹50 పొందండి! 🎁",
    message: "Share the love of home food! When your friend places their first order, you both get ₹50 wallet credit.",
    deepLink: "wallet",
    audience: "all",
  },

  // 8. Monsoon & Rainy Weather Comfort (5)
  {
    id: "monsoon_soup_pakora",
    category: "monsoon",
    categoryLabel: "Monsoon Comfort",
    icon: "🌧️",
    title: "వర్షం పడుతోంది.. వేడి వేడి సూప్ & పకోడి! 🌧️",
    message: "Listening to the rain? Order crispy hot onion pakoras and steaming tomato pepper soup right now!",
    deepLink: "category:snacks",
    audience: "all",
  },
  {
    id: "monsoon_pepper_rasam",
    category: "monsoon",
    categoryLabel: "Monsoon Comfort",
    icon: "🥣",
    title: "చలి గాలుల్లో వేడి వేడి మిరియాల చారు! 🥣",
    message: "Boost immunity and soothe your throat with piping hot Miriyala Rasam and steamed rice. 100% homely.",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "monsoon_rainy_biryani",
    category: "monsoon",
    categoryLabel: "Monsoon Comfort",
    icon: "☔",
    title: "రైనీ డే బిర్యానీ క్రేవింగ్స్ తీర్చుకోండి! ☔",
    message: "Our delivery fleet is waterproof and carefully dispatched. Fresh hot biryani delivered in the rain.",
    deepLink: "category:biryani",
    audience: "all",
  },
  {
    id: "monsoon_ginger_chai",
    category: "monsoon",
    categoryLabel: "Monsoon Comfort",
    icon: "🫖",
    title: "వేడి అల్లం టీ & గరం సమోసాలు! 🫖",
    message: "Nothing beats a cup of spicy Allam Chai with crispy samosas when it rains outside. Order in 1 tap!",
    deepLink: "category:snacks",
    audience: "all",
  },
  {
    id: "monsoon_discount",
    category: "monsoon",
    categoryLabel: "Monsoon Comfort",
    icon: "🌈",
    title: "వర్షపు రోజు ప్రత్యేక తగ్గింపులు! 🌈",
    message: "Enjoy the monsoon with flat 20% off on all comfort foods, soups, and hot meal platters.",
    deepLink: "offers",
    audience: "all",
  },

  // 9. Reorder & Engagement Triggers (5)
  {
    id: "reorder_favorite_dish",
    category: "reorder",
    categoryLabel: "Reorder & Cravings",
    icon: "💔",
    title: "మీ ఫేవరెట్ డిష్ మిస్ అవుతున్నారా? 💔",
    message: "It has been a while since your last treat! Tap here to reorder your favorite meal in just 2 clicks.",
    deepLink: "orders",
    audience: "inactive_7_days",
  },
  {
    id: "reorder_chef_cooked",
    category: "reorder",
    categoryLabel: "Reorder & Cravings",
    icon: "👨‍🍳",
    title: "మీ కోసం షెఫ్ ప్రత్యేకం గా వండారు! 👨‍🍳",
    message: "Today's kitchen batch is extra special. Limited portions available. Tap to reserve yours now!",
    deepLink: "menu",
    audience: "active_30_days",
  },
  {
    id: "reorder_cart_abandoned",
    category: "reorder",
    categoryLabel: "Reorder & Cravings",
    icon: "🛒",
    title: "మీ కార్ట్ లో ఫుడ్ ఎదురుచూస్తోంది! 🛒",
    message: "Your mouth-watering selection is waiting in the cart. Complete your order now before kitchen cuts off!",
    deepLink: "home",
    audience: "all",
  },
  {
    id: "reorder_miss_you",
    category: "reorder",
    categoryLabel: "Reorder & Cravings",
    icon: "🗓️",
    title: "చాలా రోజులైంది మీరు ఆర్డర్ చేసి! 🗓️",
    message: "We miss having you around! Here is a special comeback coupon of ₹100 for your dinner tonight.",
    deepLink: "coupon:COMEBACK100",
    audience: "inactive_30_days",
  },
  {
    id: "reorder_new_menu",
    category: "reorder",
    categoryLabel: "Reorder & Cravings",
    icon: "✨",
    title: "కొత్త మెనూ ఐటమ్స్ వచ్చేశాయి - ట్రై చేయండి! ✨",
    message: "Our home chefs have added exciting new curries, snacks, and meal boxes to the menu. Explore now!",
    deepLink: "menu",
    audience: "all",
  },
];

const TEMPLATE_CATEGORIES = [
  { id: "all", label: "All Templates", count: CAMPAIGN_TEMPLATES.length, icon: "auto_awesome" },
  { id: "biryani", label: "Biryani & Rice", count: 8, icon: "rice_bowl" },
  { id: "lunch", label: "Lunch Meals", count: 8, icon: "lunch_dining" },
  { id: "dinner", label: "Dinner Comfort", count: 8, icon: "dinner_dining" },
  { id: "snacks", label: "Snacks & Chai", count: 6, icon: "bakery_dining" },
  { id: "veg", label: "Pure Veg", count: 6, icon: "eco" },
  { id: "weekend", label: "Weekend Feasts", count: 6, icon: "celebration" },
  { id: "offers", label: "Wallet & Deals", count: 6, icon: "sell" },
  { id: "monsoon", label: "Monsoon Specials", count: 5, icon: "rainy" },
  { id: "reorder", label: "Reorder Triggers", count: 5, icon: "replay" },
];

const EMOJI_PICKER = ["🍲", "😋", "🍗", "🌿", "🌙", "🎉", "💰", "☕", "🔥", "❤️", "🍛", "🛵", "🤤", "🥟", "🥭"];

export default function PushCampaigns() {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState("వేడి వేడి బిర్యానీ రెడీ! 🍲");
  const [message, setMessage] = useState(
    "Hungry? Piping hot authentic home-style biryani is waiting for you! Order now before lunch rush."
  );
  const [category, setCategory] = useState("lunch");
  const [audience, setAudience] = useState("all");
  const [destinationType, setDestinationType] = useState("category");
  const [destinationId, setDestinationId] = useState("biryani");
  const [deepLink, setDeepLink] = useState("category:biryani");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sendMode, setSendMode] = useState("now"); // 'now' | 'schedule'
  const [scheduledAt, setScheduledAt] = useState("");
  const [overrideQuietHours, setOverrideQuietHours] = useState(false);

  // UI Interactive States
  const [activeTemplateCategory, setActiveTemplateCategory] = useState("all");
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [showAllTemplatesModal, setShowAllTemplatesModal] = useState(false);
  const [previewDeviceMode, setPreviewDeviceMode] = useState("lockscreen"); // 'lockscreen' | 'banner'
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all"); // 'all' | 'sent' | 'draft' | 'scheduled'
  const [historySearch, setHistorySearch] = useState("");

  // Clock & Quiet Hours calculation (IST = UTC + 5:30)
  const [currentIst, setCurrentIst] = useState({
    timeStr: "12:00 PM IST",
    hourStr: "12:00",
    dateStr: "Friday, Sep 25",
    isQuiet: false,
    hour: 12,
  });

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const utcMs = now.getTime();
      const istDate = new Date(utcMs + 5.5 * 3600000);
      const hours = istDate.getUTCHours();
      const minutes = istDate.getUTCMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      const displayHours = (hours % 12 || 12).toString().padStart(2, "0");
      const isQuiet = hours >= 22 || hours < 8; // 10 PM - 8 AM IST
      setCurrentIst({
        timeStr: `${displayHours}:${minutes} ${ampm} IST`,
        hourStr: `${displayHours}:${minutes}`,
        dateStr: istDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
        isQuiet,
        hour: hours,
      });
    };

    updateClock();
    const timer = setInterval(updateClock, 30000);
    return () => clearInterval(timer);
  }, []);

  const LOCAL_CAMPAIGNS_KEY = "homebites_engagement_campaigns";

  const loadLocalCampaigns = () => {
    try {
      const raw = localStorage.getItem(LOCAL_CAMPAIGNS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  // Fetch campaigns from remote Firestore or callable
  const fetchCampaigns = async (silent = false) => {
    if (!silent) setLoading(true);
    const local = loadLocalCampaigns();
    setCampaigns(local);

    try {
      let remote = null;
      try {
        const fn = httpsCallable(functions, "listEngagementCampaigns");
        const res = await fn();
        if (res.data && res.data.campaigns) {
          remote = res.data.campaigns;
        }
      } catch (fnErr) {
        if (db) {
          const snap = await getDocs(collection(db, "engagementCampaigns"));
          remote = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
      }

      if (remote) {
        remote.sort((a, b) => {
          const aTs = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
          const bTs = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
          return bTs - aTs;
        });

        // Merge remote records with only genuine un-sent local drafts
        const merged = [...remote];
        for (const loc of local) {
          if (!remote.some((r) => r.id === loc.id) && loc.id.startsWith("camp_") && loc.isLocalDraft) {
            merged.push(loc);
          }
        }
        setCampaigns(merged);
        localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(merged));
      }
    } catch (err) {
      if (!silent) console.warn("Could not sync remote campaigns:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns(true);
  }, []);

  // Filter 58 Templates
  const filteredTemplates = useMemo(() => {
    return CAMPAIGN_TEMPLATES.filter((t) => {
      if (activeTemplateCategory !== "all" && t.category !== activeTemplateCategory) {
        return false;
      }
      if (templateSearchQuery) {
        const q = templateSearchQuery.toLowerCase().trim();
        return (
          t.title.toLowerCase().includes(q) ||
          t.message.toLowerCase().includes(q) ||
          t.categoryLabel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeTemplateCategory, templateSearchQuery]);

  // Apply template directly to composer
  const handleApplyTemplate = (tpl) => {
    setTitle(tpl.title);
    setMessage(tpl.message);
    setCategory(tpl.category === "biryani" ? "lunch" : tpl.category);
    setAudience(tpl.audience || "all");
    const dest = parseDestination("", "", tpl.deepLink || "menu");
    setDestinationType(dest.destinationType);
    setDestinationId(dest.destinationId);
    setDeepLink(tpl.deepLink || buildRedirectUrl(dest.destinationType, dest.destinationId));
    addToast(`Template applied: "${tpl.title.slice(0, 24)}..."`, "info");
    setShowAllTemplatesModal(false);
  };

  const handleInsertEmoji = (emoji) => {
    setMessage((prev) => prev + emoji);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      addToast("Please select a JPEG, PNG, or WebP image.", "error");
      return;
    }

    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      addToast("Image must be 2 MB or smaller.", "error");
      return;
    }

    setImageFile(file);
    const localUrl = URL.createObjectURL(file);
    setImagePreview(localUrl);

    setUploadingImage(true);
    setUploadProgress(15);
    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const path = `uploads/push_campaigns/${Date.now()}_${cleanName}`;
      const downloadUrl = await uploadFile(file, path);
      setImageUrl(downloadUrl);
      setUploadProgress(100);
      addToast("Banner image uploaded successfully!", "success");
    } catch (err) {
      console.error("Image upload failed:", err);
      addToast("Failed to upload image. Please try again.", "error");
      setImagePreview("");
      setImageFile(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview("");
    setImageUrl("");
    setUploadProgress(0);
  };

  // Submit & Dispatch Campaign
  const handleSubmitCampaign = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      addToast("Please enter a campaign title.", "error");
      return;
    }
    if (!message.trim()) {
      addToast("Please enter message content.", "error");
      return;
    }

    const sendNow = sendMode === "now";

    if (sendNow && currentIst.isQuiet && !overrideQuietHours) {
      const confirmOverride = window.confirm(
        `It is currently Quiet Hours (${currentIst.timeStr}). Are you sure you want to send this push notification to customers right now?`
      );
      if (!confirmOverride) return;
    }

    setSubmitting(true);
    const canonicalDeepLink = deepLink || buildRedirectUrl(destinationType, destinationId);

    const payload = {
      title: title.trim(),
      message: message.trim(),
      category,
      audience,
      destinationType,
      destinationId: destinationId || "",
      deepLink: canonicalDeepLink,
      imageUrl: imageUrl || null,
      scheduledAt: !sendNow && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      overrideQuietHours: overrideQuietHours || (sendNow && currentIst.isQuiet),
      overrideCooldown: true,
      sendNow,
    };

    try {
      const fn = httpsCallable(functions, "createEngagementCampaign");
      const res = await fn(payload);
      if (res.data?.ok) {
        const sent = res.data.execution?.stats?.sent || 0;
        const suppressed = res.data.execution?.stats?.suppressed || 0;
        if (sendNow) {
          if (sent > 0) {
            addToast(`Push delivered quickly to ${sent} eligible customer${sent > 1 ? "s" : ""}!`, "success");
          } else {
            addToast(`Push processed (${suppressed} suppressed by active order / cooldown).`, "info");
          }
        } else {
          addToast("Campaign scheduled successfully!", "success");
        }
        await fetchCampaigns(false);
      } else {
        throw new Error(res.data?.execution?.error || "Failed to process campaign");
      }
    } catch (err) {
      if (sendNow) {
        // Direct FCM topic broadcast fallback
        try {
          const topicTarget = payload.audience === "partners" ? "all_partners" : "all";
          await notificationRepository.create({
            userId: topicTarget,
            audience: payload.audience === "partners" ? "partners" : "customers",
            type: payload.category === "offer" ? "offer" : "marketing",
            title: payload.title,
            message: payload.message,
            imageUrl: payload.imageUrl || null,
            deepLink: canonicalDeepLink,
            isRead: false,
            sentAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: user?.uid || "admin",
            source: "admin_campaign_broadcast",
          });

          addToast("Push notification broadcast sent quickly to all customers via FCM!", "success");
          await fetchCampaigns(false);
          return;
        } catch (directErr) {
          console.error("Direct broadcast fallback error:", directErr);
        }
      }

      addToast(err.message || "Failed to submit campaign.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Trigger Send for a draft or existing campaign
  const handleTriggerSend = async (campaign) => {
    const campaignId = typeof campaign === "string" ? campaign : campaign.id;
    const isLocal = typeof campaign === "object" ? Boolean(campaign.isLocalDraft) : campaignId.startsWith("camp_");
    const campObj = typeof campaign === "object" ? campaign : loadLocalCampaigns().find((c) => c.id === campaignId);

    setSubmitting(true);
    try {
      let sentSuccess = false;
      try {
        if (isLocal && campObj) {
          const fn = httpsCallable(functions, "createEngagementCampaign");
          const res = await fn({
            title: campObj.title,
            message: campObj.message,
            category: campObj.category,
            audience: campObj.audience,
            destinationType: campObj.destinationType,
            destinationId: campObj.destinationId,
            deepLink: campObj.deepLink,
            imageUrl: campObj.imageUrl || null,
            sendNow: true,
            overrideQuietHours: true,
            overrideCooldown: true,
          });
          if (res.data?.ok) {
            sentSuccess = true;
            const existing = loadLocalCampaigns().filter((c) => c.id !== campaignId);
            localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(existing));
            addToast(`Push delivered to customers successfully!`, "success");
          }
        } else {
          const fn = httpsCallable(functions, "sendEngagementCampaign");
          const res = await fn({ campaignId, overrideQuietHours: true, overrideCooldown: true });
          if (res.data?.ok) {
            sentSuccess = true;
            addToast(`Push delivered to customers successfully!`, "success");
          }
        }
      } catch (fnErr) {
        console.warn("Backend function dispatch failed, using direct FCM broadcast fallback:", fnErr);
      }

      if (!sentSuccess && campObj) {
        const topicTarget = campObj.audience === "partners" ? "all_partners" : "all";
        await notificationRepository.create({
          userId: topicTarget,
          audience: campObj.audience === "partners" ? "partners" : "customers",
          type: campObj.category === "offer" ? "offer" : "marketing",
          title: campObj.title,
          message: campObj.message,
          imageUrl: campObj.imageUrl || null,
          deepLink: campObj.deepLink || "menu",
          isRead: false,
          sentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: user?.uid || "admin",
          source: "admin_campaign_broadcast",
        });

        const existing = loadLocalCampaigns().filter((c) => c.id !== campaignId);
        localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(existing));
        addToast("Push notification broadcast sent quickly to all customers via FCM!", "success");
      }

      await fetchCampaigns(false);
    } catch (err) {
      console.error("Trigger send error:", err);
      addToast(err.message || "Failed to send campaign.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Campaign cleanly everywhere
  const handleDeleteCampaign = async (campaignId) => {
    const existing = loadLocalCampaigns();
    const updated = existing.filter((c) => c.id !== campaignId);
    localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(updated));
    setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));

    if (db && !campaignId.startsWith("camp_")) {
      try {
        await deleteDoc(doc(db, "engagementCampaigns", campaignId));
        await deleteDoc(doc(db, "notifications", campaignId));
      } catch (err) {
        console.warn("Direct Firestore campaign delete warning:", err);
      }
    }

    try {
      const fn = httpsCallable(functions, "deleteEngagementCampaign");
      await fn({ campaignId });
    } catch (_) {
      // Non-fatal
    }

    addToast("Campaign deleted from history.", "info");
  };

  // Cancel Scheduled Campaign
  const handleCancelCampaign = async (campaignId) => {
    const existing = loadLocalCampaigns();
    const updated = existing.map((c) => (c.id === campaignId ? { ...c, status: "cancelled" } : c));
    localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(updated));
    setCampaigns(updated);

    try {
      const fn = httpsCallable(functions, "cancelScheduledCampaign");
      await fn({ campaignId });
    } catch {
      // Ignored
    }
    addToast("Campaign marked as cancelled.", "info");
  };

  // Clear Entire Notification & Campaign History
  const handleClearNotificationHistory = async () => {
    setClearingHistory(true);
    try {
      localStorage.removeItem(LOCAL_CAMPAIGNS_KEY);
      setCampaigns([]);

      let deletedNotifs = 0;
      let deletedCamps = 0;

      if (db) {
        try {
          const [notifsSnap, campsSnap] = await Promise.all([
            getDocs(collection(db, "notifications")),
            getDocs(collection(db, "engagementCampaigns")),
          ]);

          if (!notifsSnap.empty) {
            const batch = writeBatch(db);
            notifsSnap.docs.slice(0, 450).forEach((d) => batch.delete(d.ref));
            await batch.commit();
            deletedNotifs = notifsSnap.size;
          }

          if (!campsSnap.empty) {
            const batch = writeBatch(db);
            campsSnap.docs.slice(0, 450).forEach((d) => batch.delete(d.ref));
            await batch.commit();
            deletedCamps = campsSnap.size;
          }
        } catch (dbErr) {
          console.warn("Direct Firestore cleanup notice:", dbErr);
        }
      }

      try {
        const fn = httpsCallable(functions, "clearNotificationHistory");
        const res = await fn();
        if (res.data?.ok) {
          deletedNotifs = Math.max(deletedNotifs, res.data.deletedCount || 0);
          deletedCamps = Math.max(deletedCamps, res.data.deletedCampaignsCount || 0);
        }
      } catch (fnErr) {
        console.warn("Cloud function clearNotificationHistory notice:", fnErr);
      }

      setShowClearModal(false);
      addToast(
        `History cleared (${deletedNotifs} notifications & ${deletedCamps} campaigns removed).`,
        "success"
      );
    } catch (err) {
      console.error("Clear notification history error:", err);
      addToast(err.message || "Failed to clear notification history.", "error");
    } finally {
      setClearingHistory(false);
      await fetchCampaigns(true);
    }
  };

  // KPI Calculations
  const kpis = useMemo(() => {
    const totalCampaigns = campaigns.length;
    const sentCampaigns = campaigns.filter((c) => c.status === "sent" || (!c.isLocalDraft && c.stats?.sent > 0));
    const totalSentCount = sentCampaigns.reduce((sum, c) => sum + (Number(c.stats?.sent) || 0), 0);
    const draftCount = campaigns.filter((c) => c.isLocalDraft || c.status === "draft").length;
    const scheduledCount = campaigns.filter((c) => c.status === "scheduled").length;

    return {
      totalCampaigns,
      sentCampaignsCount: sentCampaigns.length,
      totalSentCount,
      draftCount,
      scheduledCount,
    };
  }, [campaigns]);

  // Filtered History
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      if (historyFilter === "sent" && c.status !== "sent") return false;
      if (historyFilter === "draft" && !c.isLocalDraft && c.status !== "draft") return false;
      if (historyFilter === "scheduled" && c.status !== "scheduled") return false;

      if (historySearch) {
        const q = historySearch.toLowerCase();
        return (
          c.title?.toLowerCase().includes(q) ||
          c.message?.toLowerCase().includes(q) ||
          c.audience?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [campaigns, historyFilter, historySearch]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 min-h-screen bg-[#f8fafc]">
      {/* Executive Command Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 text-white flex items-center justify-center font-bold text-2xl shadow-md shadow-emerald-500/20">
              <span className="material-symbols-outlined text-[26px]">campaign</span>
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                  Push Campaigns Command Center
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  58+ Templates
                </span>
              </div>
              <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1">
                Engage hungry customers with culturally authentic Telugu & English notifications, deep links, and live mobile preview.
              </p>
            </div>
          </div>
        </div>

        {/* Live IST Status & Anti-Spam Indicator */}
        <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl border border-slate-200/90 shadow-xs shrink-0">
          <div className="flex flex-col text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Indian Standard Time</span>
            <span className="text-sm font-black text-slate-900 font-mono">{currentIst.timeStr}</span>
          </div>
          <div
            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              currentIst.isQuiet
                ? "bg-amber-100 text-amber-800 border border-amber-200"
                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
            {currentIst.isQuiet ? "Quiet Hours Active (10PM - 8AM)" : "Active Engagement Hours"}
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Campaigns</span>
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">mark_email_read</span>
          </div>
          <span className="text-2xl lg:text-3xl font-black text-slate-900">{kpis.totalCampaigns}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Delivered Pushes</span>
            <span className="material-symbols-outlined text-teal-600 text-[20px]">send_and_archive</span>
          </div>
          <span className="text-2xl lg:text-3xl font-black text-emerald-700">{kpis.totalSentCount}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Drafts Pending</span>
            <span className="material-symbols-outlined text-amber-500 text-[20px]">drafts</span>
          </div>
          <span className="text-2xl lg:text-3xl font-black text-amber-700">{kpis.draftCount}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Scheduled Dispatch</span>
            <span className="material-symbols-outlined text-blue-500 text-[20px]">schedule</span>
          </div>
          <span className="text-2xl lg:text-3xl font-black text-blue-700">{kpis.scheduledCount}</span>
        </div>
      </div>

      {/* Templates Showcase Hub: 58+ Curated Templates */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600 text-[22px]">auto_stories</span>
              <h2 className="text-lg font-black text-slate-900">Push Template Library ({CAMPAIGN_TEMPLATES.length} Curated Templates)</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any template to instantly load Telugu headline, copy, and destination into the composer.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={templateSearchQuery}
                onChange={(e) => setTemplateSearchQuery(e.target.value)}
                placeholder="Search Biryani, Samosa, Offers..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-emerald-600"
              />
            </div>
            <button
              onClick={() => setShowAllTemplatesModal(true)}
              className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">grid_view</span>
              <span>All 58 Templates</span>
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTemplateCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTemplateCategory === cat.id
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{cat.icon}</span>
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeTemplateCategory === cat.id ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                }`}
              >
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Template Cards Horizontal Grid / Carousel */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pt-1">
          {filteredTemplates.slice(0, 8).map((tpl) => (
            <div
              key={tpl.id}
              onClick={() => handleApplyTemplate(tpl)}
              className="group p-4 bg-slate-50/70 hover:bg-emerald-50/30 border border-slate-200 hover:border-emerald-300 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-3 relative hover:shadow-md shadow-2xs"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-white border border-slate-200 text-slate-700 capitalize">
                    {tpl.categoryLabel}
                  </span>
                  <span className="text-lg">{tpl.icon}</span>
                </div>
                <h3 className="font-black text-sm text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-1">
                  {tpl.title}
                </h3>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed font-medium">
                  {tpl.message}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-mono text-[10px] uppercase truncate max-w-[120px]">
                  /{tpl.deepLink}
                </span>
                <span className="font-bold text-emerald-700 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  <span>Apply</span>
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </span>
              </div>
            </div>
          ))}
        </div>

        {filteredTemplates.length > 8 && (
          <div className="pt-2 flex justify-center">
            <button
              onClick={() => setShowAllTemplatesModal(true)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 hover:underline"
            >
              <span>View all {filteredTemplates.length} templates in this category</span>
              <span className="material-symbols-outlined text-sm">arrow_downward</span>
            </button>
          </div>
        )}
      </section>

      {/* Main Two-Column Stage: Composer + Perfect Smartphone Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Modern Campaign Composer (7 Cols) */}
        <form
          onSubmit={handleSubmitCampaign}
          className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">Campaign Composer</h2>
              <p className="text-xs text-slate-500 mt-0.5">Customize your title, Telugu message body, banner image, and route.</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
              Unicode & Telugu Ready
            </span>
          </div>

          {/* Title Input */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Notification Headline *
              </label>
              <span className={`text-xs font-semibold ${title.length > 90 ? "text-rose-500" : "text-slate-400"}`}>
                {title.length}/100
              </span>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. వేడి వేడి బిర్యానీ రెడీ! 🍲 / Weekend Special Treat!"
              className="w-full px-4 py-3 bg-slate-50/70 border border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-600 focus:bg-white font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 text-sm transition"
              maxLength={100}
              required
            />
          </div>

          {/* Message Body with Emoji Quick Add */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Message Copy (Telugu / English) *
              </label>
              <span className={`text-xs font-semibold ${message.length > 450 ? "text-rose-500" : "text-slate-400"}`}>
                {message.length}/500
              </span>
            </div>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter tempting Telugu/English description..."
              className="w-full px-4 py-3 bg-slate-50/70 border border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-600 focus:bg-white font-medium text-slate-800 placeholder:text-slate-400 text-sm resize-none transition leading-relaxed"
              maxLength={500}
              required
            />

            {/* Quick Emoji Bar */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 mr-1">Insert Emoji:</span>
              {EMOJI_PICKER.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleInsertEmoji(emoji)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-emerald-50 hover:scale-110 active:scale-95 text-lg transition duration-150"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Category & Audience Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Food Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-600 font-bold text-sm text-slate-800"
              >
                <option value="lunch">Lunch Hours (11:30 AM - 03:00 PM)</option>
                <option value="dinner">Dinner Hours (07:00 PM - 10:30 PM)</option>
                <option value="weekend">Weekend Daawat (Sat / Sun)</option>
                <option value="offer">Special Promo & Cashback</option>
                <option value="curiosity">Snacks & Chai Time (04:00 PM - 07:00 PM)</option>
                <option value="reorder">Reorder & Inactive Triggers</option>
                <option value="general">General Broadcast</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Target Audience
              </label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-600 font-bold text-sm text-slate-800"
              >
                <option value="all">All Active Customers (Broadcast)</option>
                <option value="active_30_days">Active Regulars (Ordered in last 30d)</option>
                <option value="inactive_7_days">Dormant Foodies (Inactive 7+ days)</option>
                <option value="inactive_30_days">Inactive Users (30+ days)</option>
                <option value="veg_lovers">Vegetarian Only Customers</option>
                <option value="non_veg_lovers">Non-Veg Lovers</option>
                <option value="with_offers">Users with Wallet / Unused Coupons</option>
              </select>
            </div>
          </div>

          {/* Unified Destination Deep Link Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              In-App Screen Destination
            </label>
            <DestinationSelector
              destinationType={destinationType}
              destinationId={destinationId}
              onChange={({ destinationType: dt, destinationId: di, redirectUrl: ru }) => {
                setDestinationType(dt);
                setDestinationId(di);
                setDeepLink(ru);
              }}
            />
          </div>

          {/* Banner Image Uploader */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Notification Banner Image (Optional)
              </label>
              <span className="text-[11px] text-slate-400 font-medium">JPEG, PNG, WebP · Max 2 MB</span>
            </div>

            {imagePreview || imageUrl ? (
              <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 p-4">
                <div className="flex items-center gap-4">
                  <img
                    src={imagePreview || imageUrl}
                    alt="Upload Preview"
                    className="w-28 h-20 object-cover rounded-xl border border-slate-200 shadow-sm shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {imageFile ? imageFile.name : "Uploaded Banner Image"}
                    </p>
                    {imageFile && (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {(imageFile.size / 1024).toFixed(1)} KB
                      </p>
                    )}
                    {uploadingImage ? (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 shrink-0">Uploading...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-2">
                        <label className="cursor-pointer px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 transition">
                          Replace Image
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="px-3 py-1.5 text-xs font-bold rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <label className="border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50/60 hover:bg-emerald-50/20 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition text-center group">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={uploadingImage}
                />
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2.5 group-hover:scale-105 transition shadow-2xs">
                  <span className="material-symbols-outlined text-2xl">add_photo_alternate</span>
                </div>
                <p className="text-xs font-bold text-slate-800">Click to upload campaign banner image</p>
                <p className="text-[11px] text-slate-400 mt-1">Recommended: 16:9 ratio, under 2 MB (JPG, PNG, WebP)</p>
              </label>
            )}
          </div>

          {/* Delivery Mode & Timing Options */}
          <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="sendMode"
                  checked={sendMode === "now"}
                  onChange={() => setSendMode("now")}
                  className="accent-[#10b981] w-4 h-4 cursor-pointer"
                />
                <span className="text-sm font-bold text-slate-900">Send Immediately</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="sendMode"
                  checked={sendMode === "schedule"}
                  onChange={() => setSendMode("schedule")}
                  className="accent-[#10b981] w-4 h-4 cursor-pointer"
                />
                <span className="text-sm font-bold text-slate-900">Schedule for Later</span>
              </label>
            </div>

            {sendMode === "schedule" && (
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Target Dispatch Date & Time (IST)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-emerald-600 font-semibold text-slate-900 text-xs outline-none"
                  required={sendMode === "schedule"}
                />
              </div>
            )}

            {currentIst.isQuiet && (
              <div className="flex items-center gap-2.5 pt-2 border-t border-slate-200">
                <input
                  type="checkbox"
                  id="overrideQuiet"
                  checked={overrideQuietHours}
                  onChange={(e) => setOverrideQuietHours(e.target.checked)}
                  className="accent-amber-600 w-4 h-4 rounded cursor-pointer"
                />
                <label htmlFor="overrideQuiet" className="text-xs font-bold text-amber-900 cursor-pointer">
                  Override Quiet Hours (Dispatch immediately despite 10:00 PM - 08:00 AM IST curfew)
                </label>
              </div>
            )}
          </div>

          {/* Submit Action Button */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl font-black text-sm shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Dispatching Push...</span>
                </>
              ) : sendMode === "now" ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">send</span>
                  <span>Publish & Send Push Now</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">schedule</span>
                  <span>Schedule Push Campaign</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Right Column: Perfect Realistic Mobile Screen Display (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col items-center sticky top-8">
          {/* Preview Mode Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-white border border-slate-200 rounded-xl shadow-2xs mb-4">
            <button
              onClick={() => setPreviewDeviceMode("lockscreen")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                previewDeviceMode === "lockscreen"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">screen_lock_portrait</span>
              <span>Lock Screen</span>
            </button>
            <button
              onClick={() => setPreviewDeviceMode("banner")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                previewDeviceMode === "banner"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">notifications_active</span>
              <span>Heads-Up Banner</span>
            </button>
          </div>

          {/* Smartphone Physical Shell (iPhone 16 Pro Style) */}
          <div className="relative w-full max-w-[350px] bg-slate-950 rounded-[52px] p-3 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] border-[8px] border-slate-900 ring-1 ring-white/20 select-none">
            {/* Top Speaker Ear-piece */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-16 h-1 bg-slate-800 rounded-full z-30"></div>

            {/* Simulated Mobile Glass Screen */}
            <div className="relative w-full rounded-[42px] overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 min-h-[580px] flex flex-col justify-between p-4 text-white shadow-inner">
              {/* Wallpaper Ambient Glow */}
              <div className="absolute inset-0 bg-radial from-emerald-950/40 via-transparent to-slate-950 pointer-events-none"></div>

              {/* Status Bar & Dynamic Island */}
              <div className="relative z-20 pt-1">
                {/* Dynamic Island */}
                <div className="w-28 h-6 bg-black rounded-full mx-auto flex items-center justify-between px-3 shadow-md border border-slate-800/80 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-900/90 border border-slate-800 flex items-center justify-center">
                    <div className="w-1 h-1 rounded-full bg-blue-900"></div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-900 animate-pulse"></div>
                </div>

                {/* Left/Right Status Elements */}
                <div className="flex items-center justify-between px-3 text-[11px] font-bold text-slate-300">
                  <span>{currentIst.hourStr}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[13px]">signal_cellular_4_bar</span>
                    <span className="material-symbols-outlined text-[13px]">wifi</span>
                    <span className="material-symbols-outlined text-[15px] text-emerald-400">battery_full</span>
                  </div>
                </div>
              </div>

              {/* Lockscreen Mode View */}
              {previewDeviceMode === "lockscreen" ? (
                <>
                  {/* Apple Lockscreen Date & Giant Clock */}
                  <div className="text-center pt-3 space-y-0.5 z-10">
                    <div className="text-xs font-semibold text-slate-300 tracking-wide drop-shadow">
                      {currentIst.dateStr}
                    </div>
                    <div className="text-6xl font-light text-white tracking-tight drop-shadow-md font-sans">
                      {currentIst.hourStr}
                    </div>
                  </div>

                  {/* iOS Style Stacked Push Notification Card */}
                  <div className="my-auto z-10 pt-4">
                    <div className="bg-white/95 backdrop-blur-2xl rounded-2xl p-3.5 shadow-2xl border border-white/50 text-slate-900 space-y-2.5 transition-all">
                      {/* App Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-black text-[10px] shadow-2xs">
                            H
                          </div>
                          <span className="text-[11px] font-black tracking-wider uppercase text-slate-800">
                            HomeBites
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400">now</span>
                      </div>

                      {/* Title & Body */}
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-black text-slate-950 leading-snug">
                          {title || "వేడి వేడి బిర్యానీ రెడీ! 🍲"}
                        </h4>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed line-clamp-3">
                          {message || "Hungry? Piping hot authentic home-style food is waiting for you! Tap to order now."}
                        </p>
                      </div>

                      {/* Attached Banner Image Preview */}
                      {(imagePreview || imageUrl) && (
                        <div className="rounded-xl overflow-hidden mt-1.5 border border-slate-100 max-h-32 shadow-2xs">
                          <img
                            src={imagePreview || imageUrl}
                            alt="Campaign Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                        </div>
                      )}

                      {/* Interactive Route Pill & Actions */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                          <span>Opens:</span>
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded-full font-mono text-[9px] border border-emerald-200">
                            /{deepLink || destinationType}
                          </span>
                        </div>

                        <span className="px-2.5 py-1 bg-emerald-600 text-white font-bold rounded-lg text-[10px] shadow-2xs flex items-center gap-1">
                          <span>Order Now</span>
                          <span className="material-symbols-outlined text-[11px]">arrow_forward</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lock Screen Flashlight & Camera Icons */}
                  <div className="flex items-center justify-between px-3 z-10 pb-2">
                    <div className="w-10 h-10 rounded-full bg-slate-800/80 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
                      <span className="material-symbols-outlined text-base">flashlight_on</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-slate-800/80 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
                      <span className="material-symbols-outlined text-base">photo_camera</span>
                    </div>
                  </div>
                </>
              ) : (
                /* Heads-Up Banner / In-App Notification Mode */
                <div className="flex-1 flex flex-col justify-start pt-4 z-10 space-y-4">
                  {/* Floating Dropped Notification from Dynamic Island */}
                  <div className="bg-white/95 backdrop-blur-2xl rounded-2xl p-3.5 shadow-2xl border border-white/40 text-slate-900 space-y-2 animate-bounce-short">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center font-black text-[10px]">
                          H
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                          HomeBites
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">now</span>
                    </div>
                    <div>
                      <div className="text-xs font-black text-slate-950">{title}</div>
                      <div className="text-xs text-slate-600 font-medium line-clamp-2 mt-0.5">{message}</div>
                    </div>
                  </div>

                  {/* Simulated App Background Grid */}
                  <div className="grid grid-cols-4 gap-3 pt-8 px-2 opacity-30 pointer-events-none">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <div className="w-12 h-12 rounded-xl bg-slate-700"></div>
                        <div className="w-8 h-2 rounded bg-slate-800"></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* iPhone Home Swipe Bar */}
              <div className="w-full flex justify-center pb-1 z-20">
                <div className="w-32 h-1 bg-white/40 rounded-full"></div>
              </div>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400 mt-3 flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px] text-emerald-600">verified</span>
            Real-Time Visual Phone Rendering
          </span>
        </div>
      </div>

      {/* Campaign History & Performance Table Section */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Header & Controls */}
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#f9f9ff]">
          <div>
            <h2 className="font-bold text-lg text-slate-900">Campaign History & Delivery Analytics</h2>
            <p className="text-xs text-slate-500 mt-0.5">Track delivered pushes, recipient counts, and engagement status.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              className="px-4 py-2 rounded-xl border border-rose-200 text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 flex items-center gap-1.5 transition shadow-2xs"
            >
              <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
              Clear All History
            </button>

            <button
              onClick={() => fetchCampaigns(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1.5 transition shadow-2xs"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Refresh
            </button>
          </div>
        </div>

        {/* Filter Tabs & Search Bar */}
        <div className="px-6 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
            <button
              onClick={() => setHistoryFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                historyFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({campaigns.length})
            </button>
            <button
              onClick={() => setHistoryFilter("sent")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                historyFilter === "sent" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Sent ({kpis.sentCampaignsCount})
            </button>
            <button
              onClick={() => setHistoryFilter("draft")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                historyFilter === "draft" ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Drafts ({kpis.draftCount})
            </button>
            <button
              onClick={() => setHistoryFilter("scheduled")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                historyFilter === "scheduled" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Scheduled ({kpis.scheduledCount})
            </button>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search campaign history..."
              className="w-full px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-600 font-medium"
            />
          </div>
        </div>

        {/* History Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f0f3ff] text-[#555f6f] font-bold uppercase tracking-wider border-b border-[#dce2f3]">
              <tr>
                <th className="px-6 py-4">Campaign Info</th>
                <th className="px-6 py-4">Category & Target</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Performance</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400 font-semibold">
                    Loading campaigns...
                  </td>
                </tr>
              ) : filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400 font-semibold">
                    No campaigns found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((camp) => (
                  <tr key={camp.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 text-sm">{camp.title}</div>
                      <div className="text-[12px] text-slate-500 line-clamp-1 max-w-sm mt-0.5 font-medium">
                        {camp.message}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">Route: /{camp.deepLink || "menu"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-bold capitalize">
                          {camp.category}
                        </span>
                        <span className="text-[11px] text-slate-500 font-semibold capitalize">
                          {camp.audience?.replace(/_/g, " ")}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${
                          camp.isLocalDraft
                            ? "bg-amber-50 text-amber-900 border border-amber-300"
                            : camp.status === "sent"
                            ? "bg-emerald-100 text-emerald-800"
                            : camp.status === "scheduled"
                            ? "bg-blue-100 text-blue-800"
                            : camp.status === "cancelled"
                            ? "bg-slate-100 text-slate-500"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {camp.isLocalDraft ? "Local Draft" : camp.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {camp.stats ? (
                        <div className="space-y-0.5 font-medium">
                          <div className="font-bold text-slate-800">
                            Sent: <span className="text-emerald-700 font-black">{camp.stats.sent || 0}</span> / {camp.stats.targeted || 0}
                          </div>
                          {camp.stats.suppressed > 0 && (
                            <div className="text-[10px] text-amber-700 font-semibold">
                              Suppressed: {camp.stats.suppressed}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium">
                          {camp.isLocalDraft ? "Draft pending dispatch" : "Not dispatched"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      {(camp.status === "draft" || camp.isLocalDraft) && (
                        <button
                          onClick={() => handleTriggerSend(camp)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition shadow-2xs"
                          title="Quickly send push notification to all users"
                        >
                          Send Now
                        </button>
                      )}
                      {camp.status === "scheduled" && (
                        <button
                          onClick={() => handleCancelCampaign(camp.id)}
                          className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg font-bold transition"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteCampaign(camp.id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 rounded-lg font-semibold transition border border-slate-200"
                        title="Delete this campaign from history"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* All 58+ Templates Modal Explorer */}
      {showAllTemplatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden animate-slide-up">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-[#f9f9ff]">
              <div>
                <h3 className="font-black text-xl text-slate-900 flex items-center gap-2">
                  <span>Push Notification Template Library</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                    {CAMPAIGN_TEMPLATES.length} Templates
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Choose from authentic Telugu and English meal triggers crafted for home-food lovers.
                </p>
              </div>

              <button
                onClick={() => setShowAllTemplatesModal(false)}
                className="w-9 h-9 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Category Selector & Search inside modal */}
            <div className="p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveTemplateCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      activeTemplateCategory === cat.id
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    {cat.label} ({cat.count})
                  </button>
                ))}
              </div>

              <div className="w-full sm:w-64 shrink-0">
                <input
                  type="text"
                  value={templateSearchQuery}
                  onChange={(e) => setTemplateSearchQuery(e.target.value)}
                  placeholder="Search 58 templates..."
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:border-emerald-600 outline-none"
                />
              </div>
            </div>

            {/* Modal Body: Scrollable Grid */}
            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => handleApplyTemplate(tpl)}
                  className="p-4 bg-slate-50 hover:bg-emerald-50/40 border border-slate-200 hover:border-emerald-300 rounded-2xl transition cursor-pointer flex flex-col justify-between space-y-3 group hover:shadow-sm"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] px-2 py-0.5 rounded-md font-bold bg-white border border-slate-200 text-slate-700">
                        {tpl.categoryLabel}
                      </span>
                      <span className="text-xl">{tpl.icon}</span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 group-hover:text-emerald-700 transition-colors">
                      {tpl.title}
                    </h4>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      {tpl.message}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                    <span className="font-mono text-[10px] text-slate-400">/{tpl.deepLink}</span>
                    <button
                      type="button"
                      className="px-3 py-1 bg-emerald-600 group-hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                    >
                      <span>Apply</span>
                      <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Clear All History Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-slide-up">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <div>
                <h3 className="font-black text-lg text-slate-900">Clear Notification History?</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              This will permanently delete all past push campaign logs and notifications from both the Admin dashboard and the Firestore database.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={clearingHistory}
                onClick={() => setShowClearModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearingHistory}
                onClick={handleClearNotificationHistory}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {clearingHistory ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Clearing...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">delete_sweep</span>
                    <span>Clear All History</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
