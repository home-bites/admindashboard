import { signInWithEmailAndPassword, signOut as firebaseSignOut, sendPasswordResetEmail } from "firebase/auth";
import { arrayUnion, serverTimestamp, Timestamp } from "firebase/firestore";
import { auth, isFirebaseConfigured } from "../firebase/firebaseConfig";
import * as repos from "../repositories";

/**
 * Turn a failed write into something an operator can act on.
 *
 * Every mutating service here was wrapped in a catch that logged
 * "Offline fallback for X" and then returned a plausible success value —
 * `createMenuItem` returned the string "mock-menu-id", `updateMenuItem`
 * returned the id it was given. Callers could not distinguish that from a
 * real write, so the dashboard showed a success toast, closed the modal, and
 * moved on while nothing had been saved. The name is the giveaway: this was
 * built as a demo affordance for running without a backend, and it stayed in
 * once there was a real one.
 *
 * That is the worst possible failure mode for an admin tool. A write that
 * didn't happen must never look like one that did.
 *
 * `reportWriteFailure` re-throws so the caller's own error path runs, and
 * enriches permission errors with the auth state at the moment of the
 * failure — which is the thing you actually need to know and the thing the
 * raw Firestore message never tells you.
 */
function reportWriteFailure(operation, error) {
  const code = error?.code || "";

  if (code === "permission-denied" || /insufficient permissions/i.test(error?.message || "")) {
    const u = auth?.currentUser;
    console.error(
      `[${operation}] DENIED by Firestore rules.\n` +
      `  signed in as : ${u ? `${u.email || "(no email)"} (uid ${u.uid})` : "NOBODY — auth.currentUser is null"}\n` +
      `  email verified: ${u ? u.emailVerified : "n/a"}\n` +
      "  If 'signed in as' says NOBODY, the Firebase session has expired even though\n" +
      "  the dashboard still looks logged in — sign out and back in.\n" +
      "  Otherwise the deployed ruleset is rejecting this account: check\n" +
      "  Firebase Console > Firestore > Rules and compare it with firestore.rules,\n" +
      "  then run: firebase deploy --only firestore:rules",
      error
    );
  } else {
    console.error(`[${operation}] failed:`, error);
  }

  throw error;
}

// 1. Authentication Service
export const AuthService = {
  async login(email, password) {
    if (!isFirebaseConfigured) {
      throw new Error("Firebase is not configured properly. Please check your environment configuration.");
    }

    const cleanEmail = email ? email.trim().toLowerCase() : "";
    if (!cleanEmail || !password) {
      throw new Error("Please enter both email and password.");
    }

    let cred;
    try {
      // 1. Authenticate strictly via Firebase Authentication
      cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (e) {
      console.error("[AuthService] Firebase Sign-In Error:", e.code || e.message);
      if (
        e.code === 'auth/user-not-found' ||
        e.code === 'auth/wrong-password' ||
        e.code === 'auth/invalid-credential'
      ) {
        throw new Error("Invalid credentials. Please verify your email and password.");
      } else if (e.code === 'auth/user-disabled') {
        throw new Error("This administrator account has been disabled.");
      } else if (e.code === 'auth/too-many-requests') {
        throw new Error("Too many failed login attempts. Please try again later.");
      } else {
        throw new Error(e.message || "Authentication failed. Please try again.");
      }
    }

    const uid = cred.user.uid;

    // 2. Fetch User Profile from Firestore
    let userProfile = await repos.userRepository.getById(uid);

    // Profile provision for initial bootstrap admins if document missing
    if (!userProfile) {
      const allowedAdminEmails = ["admin@homebites.com", "support@hombites.com", "admin@homebites.local"];
      if (allowedAdminEmails.includes(cleanEmail)) {
        userProfile = {
          uid: uid,
          email: cleanEmail,
          displayName: "Super Admin",
          role: "Super Admin",
          status: "Active",
          isActive: true,
          permissions: ["ALL"],
          createdAt: new Date().toISOString(),
        };
        await repos.userRepository.set(uid, userProfile);
      } else {
        await firebaseSignOut(auth);
        throw new Error("User profile not found in database. Contact system administrator.");
      }
    }

    // 3. Status Validation
    if (userProfile.isActive === false || userProfile.status === "Inactive" || userProfile.status === "Suspended") {
      await firebaseSignOut(auth);
      throw new Error("Your account is currently inactive or suspended.");
    }

    // 4. Role Authorization Check
    const allowedRoles = ["Super Admin", "Admin", "Manager", "Chef", "Staff", "Kitchen Manager", "Delivery Manager"];
    if (!userProfile.role || !allowedRoles.includes(userProfile.role)) {
      await firebaseSignOut(auth);
      throw new Error("Access denied. You do not have administrator privileges to access this dashboard.");
    }

    // 5. Audit Logging
    try {
      await repos.auditLogRepository.logAction(
        uid,
        "Authentication",
        "LOGIN_SUCCESS",
        {
          uid,
          email: cleanEmail,
          role: userProfile.role,
          timestamp: new Date().toISOString()
        }
      );
    } catch (auditErr) {
      console.warn("Audit logging non-fatal warning:", auditErr.message);
    }

    return userProfile;
  },

  async logout(currentUser) {
    if (currentUser) {
      try {
        await repos.auditLogRepository.logAction(
          currentUser.uid,
          "Authentication",
          "LOGOUT",
          {
            action: "LOGOUT",
            uid: currentUser.uid,
            email: currentUser.email,
            role: currentUser.role,
            loginMethod: "firebase_auth",
            timestamp: new Date().toISOString()
          }
        );
      } catch (e) {
        console.warn("Could not write audit log:", e.message);
      }
    }

    if (isFirebaseConfigured && auth) {
      await firebaseSignOut(auth);
    }
  }
};

// Helper to format structured address objects into strings
const formatAddress = (addressField) => {
  if (!addressField) return "Counter Pickup";
  if (typeof addressField === "string") return addressField;
  if (typeof addressField === "object") {
    const parts = [];
    if (addressField.houseNumber) parts.push(addressField.houseNumber);
    if (addressField.street) parts.push(addressField.street);
    if (addressField.landmark) parts.push(addressField.landmark);
    if (addressField.addressLine) parts.push(addressField.addressLine);
    if (addressField.city) parts.push(addressField.city);
    if (addressField.state) parts.push(addressField.state);
    if (addressField.pincode) parts.push(addressField.pincode);
    if (addressField.label) parts.push(`(${addressField.label})`);
    
    if (parts.length > 0) return parts.join(", ");
    return JSON.stringify(addressField);
  }
  return String(addressField);
};

// Helper to parse dates robustly
const parseDate = (val) => {
  if (!val) return new Date(0);
  if (val instanceof Date) return val;
  if (typeof val.toDate === "function") return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }
  if (typeof val === "number") return new Date(val);
  return new Date(0);
};

// 2. Orders Service
export const OrderService = {
  async getOrders() {
    try {
      const list = await repos.orderRepository.getAll();
      const mapped = list.map(o => ({
        ...o,
        customer: o.customerName || o.customer || "Walk-in Customer",
        phone: o.customerPhone || o.phone || "N/A",
        time: o.time || "Just now",
        timestamp: o.timestamp || (o.createdAt ? parseDate(o.createdAt).toLocaleString() : ""),
        itemsText: o.itemsText || (o.items ? o.items.map(i => `${i.quantity ?? i.qty ?? 1}x ${i.name}`).join(", ") : ""),
        items: o.items || [],
        subtotal: Number(o.subtotal || 0),
        tax: Number(o.tax || 0),
        deliveryFee: Number(o.deliveryFee || o.deliveryCharge || 0),
        total: Number(o.total || o.totalAmount || 0),
        status: o.status || "Pending",
        rider: o.rider || (o.assignedPartnerName ? `${o.assignedPartnerName}` : "Assigning..."),
        address: formatAddress(o.deliveryAddress || o.address),
        city: o.city || "Bengaluru",
        note: o.note || ""
      }));
      
      // Chronological descending sort (newest first)
      mapped.sort((a, b) => {
        const dateA = parseDate(a.createdAt || a.timestamp);
        const dateB = parseDate(b.createdAt || b.timestamp);
        return dateB - dateA;
      });
      return mapped;
    } catch (e) {
      console.warn("Offline fallback for getOrders:", e.message);
      return [];
    }
  },
  /**
   * Record that money has been received for an order, or undo that.
   *
   * Used for the two cases the automatic paths cannot cover: cash a rider
   * collected on a COD delivery, and a counter payment the admin took by hand.
   * Online orders are settled by the signature-verified Razorpay webhook and
   * must never be marked here — doing so would assert a payment nobody checked.
   *
   * `paid` is written lowercase because orderStore.isSettledOrder compares
   * String(paymentStatus).toLowerCase() === "paid". Writing "Paid" would look
   * right in the console and still leave the order in the awaiting queue.
   *
   * Reversible on purpose: this is a human ticking a box, and a mis-click on a
   * money field should be fixable without a developer. Both directions are
   * audit-logged with the actor, so "who marked this paid" always has an answer.
   */
  async setOrderPaymentReceived(orderId, received, actor) {
    try {
      const updateData = {
        paymentStatus: received ? "paid" : "pending",
        paymentReceivedAt: received ? Timestamp.now() : null,
        paymentReceivedBy: received ? (actor?.uid || "system") : null,
        updatedAt: serverTimestamp(),
      };
      const result = await repos.orderRepository.update(orderId, updateData);
      await repos.auditLogRepository.logAction(
        actor?.uid || "system",
        "orders",
        received ? "ORDER_PAYMENT_RECEIVED" : "ORDER_PAYMENT_REVERTED",
        { orderId },
      );
      return result;
    } catch (e) {
      reportWriteFailure("setOrderPaymentReceived", e);
    }
  },

  async updateOrderStatus(orderId, status, actor) {
    try {
      const updateData = {
        status,
        statusHistory: arrayUnion({
          status,
          timestamp: Timestamp.now(),
        }),
        updatedAt: serverTimestamp(),
      };
      if (status === "Delivered") {
        updateData.verificationVerifiedAt = serverTimestamp();
        updateData.verificationStatus = true;
        updateData.assignmentStatus = "Completed";
      }
      const result = await repos.orderRepository.update(orderId, updateData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "orders", "ORDER_STATUS_UPDATE", { orderId, status });
      
      // Sync delivery partner status to Available upon delivery completion
      if (status === "Delivered") {
        try {
          const order = await repos.orderRepository.getById(orderId);
          if (order && order.assignedPartnerId) {
            await repos.deliveryPartnerRepository.update(order.assignedPartnerId, {
              currentStatus: "Available",
              isAvailable: true
            });
          }
        } catch (partnerErr) {
          console.warn("Could not update delivery partner status:", partnerErr.message);
        }
      }
      
      /* Notifications are the server's job, not this page's.
       *
       * Two bugs lived in the block that used to be here.
       *
       * First, `onOrderUpdated` in functions/index.js already raises a
       * notification for every status change, so each transition produced
       * two: one from the trigger and one from this browser. They were not
       * even the same shape, and the trigger's `createNotificationOnce`
       * idempotency could not collapse a document it did not write.
       *
       * Second, and worse, the rider notification here was written with
       * `type: "orders"` and nothing else to say who it was for. A person who
       * uses one account in both apps — orders dinner, rides in the evening —
       * has the same uid in both, so "Order #… is ready! Please pick it up
       * from the Home Chef" appeared in their *customer* app, next to an
       * earnings deposit of ₹0.00. The server now derives the audience from
       * the notification's type, which is the only thing that can tell a
       * partner message from a customer one when the recipient is the same
       * person.
       *
       * If a status transition needs to tell the rider something, add it to
       * `onOrderUpdated` with a type from PARTNER_NOTIFICATION_TYPES. Do not
       * write it from here. */

      return result;
    } catch (e) {
      reportWriteFailure("updateOrderStatus", e);
    }
  },
  async assignDeliveryPartner(orderId, partnerId, partnerName, actor) {
    try {
      const result = await repos.orderRepository.update(orderId, { 
        deliveryPartnerId: partnerId,
        assignedPartnerId: partnerId,
        assignedPartnerName: partnerName || "Rider",
        rider: partnerName || "Rider",
        assignmentStatus: "Assigned",
        status: "Out for Delivery",
        assignmentMethod: "Manual Assignment",
        statusHistory: arrayUnion({
          status: "Out for Delivery",
          timestamp: Timestamp.now(),
        }),
        verificationGeneratedAt: Timestamp.now(),
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await repos.orderTrackingRepository.create({ 
        orderId, 
        status: "Out for Delivery", 
        partnerId,
        latitude: 0,
        longitude: 0
      });
      await repos.auditLogRepository.logAction(actor?.uid || "system", "orders", "DELIVERY_ASSIGNMENT", { orderId, partnerId, partnerName });
      
      // Write user and partner notifications for delivery assignment
      try {
        const order = await repos.orderRepository.getById(orderId);
        if (order) {
          if (order.customerId) {
            await repos.notificationRepository.create({
              userId: order.customerId,
              title: "Out for Delivery",
              message: `Your order #${order.orderId || orderId} is out for delivery with ${partnerName || "Rider"}.`,
              type: "orders",
              referenceId: orderId,
              isRead: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
          if (partnerId) {
            await repos.notificationRepository.create({
              userId: partnerId,
              title: "New Order Assigned",
              message: `You have been assigned order #${order.orderId || orderId}. Please pick it up.`,
              type: "orders",
              referenceId: orderId,
              isRead: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
        }
      } catch (notiErr) {
        console.warn("Could not write notification:", notiErr.message);
      }
      
      return result;
    } catch (e) {
      reportWriteFailure("assignDeliveryPartner", e);
    }
  },
  async unassignDeliveryPartner(orderId, actor) {
    try {
      const result = await repos.orderRepository.update(orderId, {
        deliveryPartnerId: "",
        assignedPartnerId: "",
        assignedPartnerName: "",
        rider: "Assigning...",
        assignmentStatus: "Unassigned",
        assignmentMethod: "Unassigned",
        updatedAt: serverTimestamp()
      });
      await repos.auditLogRepository.logAction(actor?.uid || "system", "orders", "DELIVERY_UNASSIGNMENT", { orderId });
      return result;
    } catch (e) {
      reportWriteFailure("unassignDeliveryPartner", e);
    }
  },
  async createOrder(orderData, actor) {
    try {
      let orderId = "";
      const currentYear = new Date().getFullYear();

      if (repos.orderRepository.isMockMode()) {
        const orders = await repos.orderRepository.getAll();
        const finalOrderNumber = orders.length + 1;
        const yearShort = String(currentYear).substring(2);
        const paddedNumber = String(finalOrderNumber).padStart(4, "0");
        orderId = `HB${yearShort}${paddedNumber}`;
      } else {
        const { doc, runTransaction } = await import("firebase/firestore");
        const { db } = await import("../firebase/firebaseConfig");

        orderId = await runTransaction(db, async (transaction) => {
          const counterRef = doc(db, "systemCounters", "orders");
          const counterSnap = await transaction.get(counterRef);
          
          let finalOrderNumber = 1;
          if (counterSnap.exists()) {
            const counterData = counterSnap.data() || {};
            const dbYear = counterData.currentYear;
            const dbOrderNumber = counterData.currentOrderNumber || 0;
            if (dbYear === currentYear) {
              finalOrderNumber = dbOrderNumber + 1;
            }
          }
          
          transaction.set(counterRef, {
            currentYear: currentYear,
            currentOrderNumber: finalOrderNumber,
          });

          const yearShort = String(currentYear).substring(2);
          const paddedNumber = String(finalOrderNumber).padStart(4, "0");
          return `HB${yearShort}${paddedNumber}`;
        });
      }

      const payload = {
        id: orderId,
        orderId: orderId,
        // Links the order to a real account. Every client filters its own
        // orders with where('customerId','==',uid) — official_page
        // OrdersPage.jsx:339 and OrderTracking.jsx:193, customer_app
        // order_provider.dart:59 — so without this field an order placed for
        // a known customer is invisible to that customer. It was absent
        // entirely before, which meant passing a customerId through orderData
        // was silently dropped.
        //
        // null, not "", for a genuine walk-in: an equality query never matches
        // null, whereas an empty string is a value somebody could accidentally
        // match on.
        //
        // Note this also feeds the loyalty and wallet paths further down this
        // file (they already read order.customerId), so a linked spot order
        // now earns points like any other order. That is intended.
        customerId: orderData.customerId || null,
        customerName: orderData.customer || "Walk-in Customer",
        customerPhone: orderData.phone || "N/A",
        time: "Just now",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        itemsText: orderData.itemsText || "",
        items: orderData.items || [],
        subtotal: Number(orderData.subtotal || 0),
        tax: Number(orderData.tax || 0),
        deliveryCharge: Number(orderData.deliveryFee || 0),
        totalAmount: Number(orderData.total || 0),
        status: orderData.status || "Pending",
        // orderStore.isSettledOrder treats COD/CASH/WALLET as settled and
        // everything else as awaiting an online payment. The payload carried
        // no paymentMethod at all, so admin-created counter orders failed that
        // test and landed in "Awaiting Payment" — the queue for online
        // payments still in flight — instead of the live kitchen list.
        //
        // Money at the till is collected in person, so CASH is the honest
        // default here. Passed through rather than hardcoded so a spot order
        // taken on UPI can say so later.
        paymentMethod: orderData.paymentMethod || "CASH",
        // Without this the order is invisible.
        //
        // orderStore.js:67 subscribes with
        //   query(collection(db,"orders"), orderBy("createdAt","desc"), limit(200))
        // and Firestore silently EXCLUDES any document that lacks the field it
        // is ordering by. The payload never set createdAt, so every spot order
        // was written correctly, returned an id, reported success — and never
        // appeared in the live list. No error, because nothing errored.
        //
        // Timestamp.now(), NOT serverTimestamp().
        //
        // serverTimestamp() resolves to null in the local cache until the
        // server acknowledges the write. Combined with the orderBy("createdAt")
        // above, that means a freshly placed order is excluded from the live
        // list until the round trip completes — and excluded forever if the
        // write is sitting in Firestore's offline queue, which is what a
        // resolved promise with nothing in the console looks like.
        //
        // A client Timestamp is written into the cache immediately, so the
        // order appears at once and still sorts correctly against app and
        // website orders. The trade is that it trusts the till's clock.
        createdAt: Timestamp.now(),
        rider: orderData.rider || "Assigning...",
        deliveryAddress: orderData.address || "Counter Pickup",
        city: orderData.city || "Bengaluru",
        note: orderData.note || "",
        // Left empty on purpose. `onOrderCreatedIssueCode` issues the code
        // server-side for every order, whatever created it, so all three
        // clients behave identically and the value is never chosen somewhere
        // a customer could observe it. Math.random() here also produced a
        // weaker code than the crypto.randomInt the function uses.
        verificationCode: "",
        verificationStatus: "Pending",
        verificationAttempts: 0
      };

      await repos.orderRepository.set(orderId, payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "orders", "ORDER_CREATE", { orderId, orderData: payload });
      return orderId;
    } catch (e) {
      reportWriteFailure("createOrder", e);
    }
  }
};

// 3. Categories Service
export const CategoryService = {
  async getCategories() {
    try {
      return await repos.categoryRepository.getAll();
    } catch (e) {
      console.warn("Offline fallback for getCategories:", e.message);
      return [];
    }
  },
  async createCategory(categoryData, actor) {
    try {
      const result = await repos.categoryRepository.create(categoryData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "categories", "CATEGORY_CREATE", { categoryData });
      return result;
    } catch (e) {
      reportWriteFailure("createCategory", e);
    }
  },
  async updateCategory(categoryId, categoryData, actor) {
    try {
      const result = await repos.categoryRepository.update(categoryId, categoryData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "categories", "CATEGORY_UPDATE", { categoryId, categoryData });
      return result;
    } catch (e) {
      reportWriteFailure("updateCategory", e);
    }
  },
  async deleteCategory(categoryId, actor) {
    try {
      const result = await repos.categoryRepository.delete(categoryId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "categories", "CATEGORY_DELETE", { categoryId });
      return result;
    } catch (e) {
      reportWriteFailure("deleteCategory", e);
    }
  }
};

// 4. Menu Items Service
export const MenuItemService = {
  async getMenuItems() {
    try {
      return await repos.menuItemRepository.getAll();
    } catch (e) {
      console.warn("Offline fallback for getMenuItems:", e.message);
      return [];
    }
  },
  async createMenuItem(menuData, actor) {
    try {
      const result = await repos.menuItemRepository.create(menuData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "menuItems", "MENU_ITEM_CREATE", { menuData });
      return result;
    } catch (e) {
      reportWriteFailure("createMenuItem", e);
    }
  },
  async updateMenuItem(itemId, menuData, actor) {
    try {
      const result = await repos.menuItemRepository.update(itemId, menuData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "menuItems", "MENU_ITEM_UPDATE", { itemId, menuData });
      return result;
    } catch (e) {
      reportWriteFailure("updateMenuItem", e);
    }
  },
  async deleteMenuItem(itemId, actor) {
    try {
      const result = await repos.menuItemRepository.delete(itemId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "menuItems", "MENU_ITEM_DELETE", { itemId });
      return result;
    } catch (e) {
      reportWriteFailure("deleteMenuItem", e);
    }
  }
};

// 5. Banners Service
export const BannerService = {
  async getBanners() {
    try {
      return await repos.bannerRepository.getAll();
    } catch (e) {
      console.warn("Offline fallback for getBanners:", e.message);
      return [];
    }
  },
  async createBanner(bannerData, actor) {
    try {
      const result = await repos.bannerRepository.create(bannerData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "banners", "BANNER_CREATE", { bannerData });
      return result;
    } catch (e) {
      reportWriteFailure("createBanner", e);
    }
  },
  async updateBanner(bannerId, bannerData, actor) {
    try {
      const result = await repos.bannerRepository.update(bannerId, bannerData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "banners", "BANNER_UPDATE", { bannerId, bannerData });
      return result;
    } catch (e) {
      reportWriteFailure("updateBanner", e);
    }
  },
  async deleteBanner(bannerId, actor) {
    try {
      const result = await repos.bannerRepository.delete(bannerId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "banners", "BANNER_DELETE", { bannerId });
      return result;
    } catch (e) {
      reportWriteFailure("deleteBanner", e);
    }
  }
};

// 6. Coupons Service
export const CouponService = {
  async getCoupons() {
    try {
      const list = await repos.couponRepository.getAll();
      return list.map(c => ({
        ...c,
        minOrder: c.minimumOrderValue !== undefined ? Number(c.minimumOrderValue) : Number(c.minOrder || 0),
        expiry: c.expiryDate || c.expiry || "No Expiry",
        status: c.status || (c.isHidden ? "Hidden" : (c.isActive !== false ? "Active" : "Expired")),
        type: c.type || (c.discountType === "Percentage" ? `${c.discountValue || 0}% Off` : c.discountType === "Flat Discount" ? `₹${c.discountValue || 0}.00 Flat Off` : "Free Delivery")
      }));
    } catch (e) {
      console.warn("Offline fallback for getCoupons:", e.message);
      return [];
    }
  },
  async createCoupon(couponData, actor) {
    try {
      const payload = {
        code: couponData.code?.toUpperCase() || "",
        discountType: couponData.discountType || "Percentage",
        discountValue: couponData.discountValue !== undefined ? Number(couponData.discountValue) : 0,
        minimumOrderValue: couponData.minOrder !== undefined ? Number(couponData.minOrder) : 0,
        expiryDate: couponData.expiryDate || couponData.expiry || "",
        isActive: couponData.status === "Active" || couponData.status === "Hidden" || couponData.isActive !== false,
        isHidden: couponData.status === "Hidden" || !!couponData.isHidden
          || couponData.showToCustomer === false,
        status: couponData.status || "Active",
        type: couponData.type || "",
        usageLimit: couponData.totalLimit || couponData.usageLimit || 1000,
        usedCount: couponData.usedCount || 0,

        // Same omission as updateCoupon had: the create form collects all of
        // these and none of them were being stored.
        showToCustomer: couponData.showToCustomer !== false,
        isVisible: couponData.showToCustomer !== false,
        description: couponData.description || "",
        maxDiscountAmount: Number(couponData.maxDiscountAmount || 0),
        userLimit: Number(couponData.userLimit || 1),
        userEligibility: couponData.userEligibility || "all",
        appliesRegular: couponData.appliesRegular !== false,
        appliesSubscription: !!couponData.appliesSubscription,
        subWeekly: !!couponData.subWeekly,
        subMonthly: !!couponData.subMonthly,
        subQuarterly: !!couponData.subQuarterly,
        autoApply: !!couponData.autoApply,
        isDeleted: false,
      };
      const result = await repos.couponRepository.create(payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "coupons", "COUPON_CREATE", { couponId: result, couponData: payload });
      return result;
    } catch (e) {
      reportWriteFailure("createCoupon", e);
    }
  },
  async updateCoupon(couponId, couponData, actor) {
    try {
      const payload = {
        code: couponData.code?.toUpperCase(),
        discountType: couponData.discountType,
        discountValue: couponData.discountValue !== undefined ? Number(couponData.discountValue) : undefined,
        minimumOrderValue: couponData.minOrder !== undefined ? Number(couponData.minOrder) : undefined,
        expiryDate: couponData.expiryDate || couponData.expiry,
        isActive: couponData.status !== undefined
          ? (couponData.status === "Active" || couponData.status === "Hidden")
          : couponData.isActive,

        // Visibility is its own control, not a consequence of status.
        //
        // This used to read `status !== undefined ? status === "Hidden" : ...`,
        // which meant an explicit isHidden was discarded whenever a status was
        // also sent — and the form always sends one. Hiding an Active coupon
        // computed "Active" === "Hidden" -> false and wrote the coupon back as
        // visible, while the toast still said "Coupon updated successfully".
        //
        // Active-and-hidden is the whole point of a code-only promo, so the
        // explicit flag wins and status is only a fallback for callers that
        // don't set one.
        isHidden: couponData.isHidden !== undefined
          ? !!couponData.isHidden
          : (couponData.showToCustomer !== undefined
              ? !couponData.showToCustomer
              : couponData.status === "Hidden"),

        status: couponData.status,
        type: couponData.type,

        // Fields below were silently dropped by the old whitelist: the admin
        // filled them in, the save reported success, and they never reached
        // Firestore. Applicability in particular is what the customer app
        // uses to decide whether a coupon may be applied to a subscription.
        showToCustomer: couponData.showToCustomer,
        isVisible: couponData.isVisible,
        description: couponData.description,
        maxDiscountAmount: couponData.maxDiscountAmount !== undefined
          ? Number(couponData.maxDiscountAmount) : undefined,
        userLimit: couponData.userLimit !== undefined
          ? Number(couponData.userLimit) : undefined,
        userEligibility: couponData.userEligibility,
        appliesRegular: couponData.appliesRegular,
        appliesSubscription: couponData.appliesSubscription,
        subWeekly: couponData.subWeekly,
        subMonthly: couponData.subMonthly,
        subQuarterly: couponData.subQuarterly,
        autoApply: couponData.autoApply,
        usageLimit: couponData.totalLimit !== undefined
          ? Number(couponData.totalLimit) : couponData.usageLimit,
      };
      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
      
      const result = await repos.couponRepository.update(couponId, payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "coupons", "COUPON_UPDATE", { couponId, couponData: payload });
      return result;
    } catch (e) {
      reportWriteFailure("updateCoupon", e);
    }
  },
  async deleteCoupon(couponId, actor) {
    try {
      const result = await repos.couponRepository.delete(couponId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "coupons", "COUPON_DELETE", { couponId });
      return result;
    } catch (e) {
      reportWriteFailure("deleteCoupon", e);
    }
  }
};

// 7. Deals Service
export const DealService = {
  async getDeals() {
    try {
      const list = await repos.dealRepository.getAll();
      return list.map(d => ({
        ...d,
        minOrder: d.minimumOrderValue !== undefined ? Number(d.minimumOrderValue) : Number(d.minOrder || 0),
        expiry: d.expiryDate || d.expiry || "No Expiry",
        status: d.isActive !== false ? "Active" : "Expired"
      }));
    } catch (e) {
      console.warn("Offline fallback for getDeals:", e.message);
      return [];
    }
  },
  async createDeal(dealData, actor) {
    try {
      const payload = {
        title: dealData.title || "",
        type: dealData.type || "",
        minimumOrderValue: dealData.minOrder !== undefined ? Number(dealData.minOrder) : 0,
        expiryDate: dealData.expiryDate || dealData.expiry || "",
        isActive: dealData.status === "Active" || dealData.isActive !== false,
        linkedMenuItems: dealData.linkedMenuItems || [],
        description: dealData.description || "",
        bannerImage: dealData.bannerImage || "",
        usage: dealData.usage || "0 times"
      };
      const result = await repos.dealRepository.create(payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "deals", "DEAL_CREATE", { dealId: result, dealData: payload });
      return result;
    } catch (e) {
      reportWriteFailure("createDeal", e);
    }
  },
  async updateDeal(dealId, dealData, actor) {
    try {
      const payload = {
        title: dealData.title,
        type: dealData.type,
        minimumOrderValue: dealData.minOrder !== undefined ? Number(dealData.minOrder) : undefined,
        expiryDate: dealData.expiryDate || dealData.expiry,
        isActive: dealData.status !== undefined ? (dealData.status === "Active") : dealData.isActive,
        linkedMenuItems: dealData.linkedMenuItems,
        description: dealData.description,
        bannerImage: dealData.bannerImage
      };
      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

      const result = await repos.dealRepository.update(dealId, payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "deals", "DEAL_UPDATE", { dealId, dealData: payload });
      return result;
    } catch (e) {
      reportWriteFailure("updateDeal", e);
    }
  },
  async deleteDeal(dealId, actor) {
    try {
      const result = await repos.dealRepository.delete(dealId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "deals", "DEAL_DELETE", { dealId });
      return result;
    } catch (e) {
      reportWriteFailure("deleteDeal", e);
    }
  }
};

// 8. Delivery Partners Service
export const DeliveryPartnerService = {
  async getDeliveryPartners() {
    try {
      return await repos.deliveryPartnerRepository.getAll();
    } catch (e) {
      console.warn("Offline fallback for getDeliveryPartners:", e.message);
      return [];
    }
  },
  async createDeliveryPartner(partnerData, actor) {
    try {
      const result = await repos.deliveryPartnerRepository.create(partnerData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "deliveryPartners", "PARTNER_CREATE", { partnerData });
      return result;
    } catch (e) {
      reportWriteFailure("createDeliveryPartner", e);
    }
  },
  async updateDeliveryPartner(partnerId, partnerData, actor) {
    try {
      const result = await repos.deliveryPartnerRepository.update(partnerId, partnerData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "deliveryPartners", "PARTNER_UPDATE", { partnerId, partnerData });
      return result;
    } catch (e) {
      reportWriteFailure("updateDeliveryPartner", e);
    }
  },
  async deleteDeliveryPartner(partnerId, actor) {
    try {
      const result = await repos.deliveryPartnerRepository.delete(partnerId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "deliveryPartners", "PARTNER_DELETE", { partnerId });
      return result;
    } catch (e) {
      reportWriteFailure("deleteDeliveryPartner", e);
    }
  }
};

// 9. Wallet Service
export const WalletService = {
  async getWalletTransactions() {
    try {
      return await repos.walletTransactionRepository.getAll();
    } catch (e) {
      console.warn("Offline fallback for getWalletTransactions:", e.message);
      return [];
    }
  },
  async createWalletTransaction(txnData, actor) {
    try {
      const payload = {
        userId: txnData.userId || "system",
        amount: Number(txnData.amount || 0),
        transactionType: txnData.type || txnData.transactionType || "Earning",
        referenceId: txnData.referenceId || "",
        description: txnData.description || "",
        date: txnData.date || new Date().toISOString(),
        status: txnData.status || "Settled"
      };
      const result = await repos.walletTransactionRepository.create(payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "walletTransactions", "WALLET_TRANSACTION_CREATE", { txnData: payload });
      return result;
    } catch (e) {
      reportWriteFailure("createWalletTransaction", e);
    }
  }
};

// 10. Support Tickets Service
export const SupportTicketService = {
  async getSupportTickets() {
    try {
      return await repos.supportTicketRepository.getAll();
    } catch (e) {
      console.warn("Offline fallback for getSupportTickets:", e.message);
      return [];
    }
  },
  async updateSupportTicket(ticketId, ticketData, actor) {
    try {
      const result = await repos.supportTicketRepository.update(ticketId, ticketData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "supportTickets", "TICKET_UPDATE", { ticketId, ticketData });
      return result;
    } catch (e) {
      reportWriteFailure("updateSupportTicket", e);
    }
  }
};

// 11. Settings Service
export const SettingsService = {
  async getSettings() {
    try {
      const data = await repos.appSettingsRepository.getById("general");
      if (!data) {
        return {
          id: "general",
          rainCharge: 0,
          deliveryCharge: 30,
          supportPhone: "+91 98765 43210",
          storeOpen: true,
          maintenanceMode: false,
          minimumOrderValue: 150,
          walletEnabled: true,
          loyaltyEnabled: true,
          couponEnabled: true,
          deliveryTrackingEnabled: true
        };
      }
      return data;
    } catch (e) {
      reportWriteFailure("getSettings", e);
    }
  },
  async updateSettings(settingsData, actor) {
    try {
      const result = await repos.appSettingsRepository.set("general", settingsData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "appSettings", "SETTINGS_UPDATE", { settingsData });
      return result;
    } catch (e) {
      reportWriteFailure("updateSettings", e);
    }
  }
};

// 12. Reviews Service
export const ReviewService = {
  async getReviews() {
    try {
      return await repos.reviewRepository.getAll();
    } catch (e) {
      console.warn("Offline fallback for getReviews:", e.message);
      return [];
    }
  },
  async deleteReview(reviewId, actor) {
    try {
      const result = await repos.reviewRepository.delete(reviewId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "reviews", "REVIEW_DELETE", { reviewId });
      return result;
    } catch (e) {
      reportWriteFailure("deleteReview", e);
    }
  }
};

// 13. Audit Logs Service
export const AuditLogService = {
  async getLogs() {
    try {
      return await repos.auditLogRepository.getAll();
    } catch (e) {
      console.warn("Offline fallback for getLogs:", e.message);
      return [];
    }
  },
  async logAction(userId, module, action, metadata) {
    try {
      return await repos.auditLogRepository.logAction(userId, module, action, metadata);
    } catch (e) {
      console.warn("Offline fallback for logAction:", e.message);
      return null;
    }
  }
};

// 14. Diet Foods Service
export const DietFoodService = {
  async getAll() {
    try {
      return await repos.dietFoodRepository.getAll();
    } catch (e) {
      console.warn("Offline fallback for getDietFoods:", e.message);
      return [];
    }
  },
  async create(data, actor) {
    try {
      const payload = {
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        calories: Number(data.calories || 0),
        proteinGrams: Number(data.proteinGrams || 0),
        carbsGrams: Number(data.carbsGrams || 0),
        fatsGrams: Number(data.fatsGrams || 0),
        fiberGrams: Number(data.fiberGrams || 0),
        glycemicIndex: Number(data.glycemicIndex || 0),
        isDiet: true,
        healthTags: Array.isArray(data.healthTags) ? data.healthTags : [],
        allergens: Array.isArray(data.allergens) ? data.allergens : [],
        ingredients: Array.isArray(data.ingredients) ? data.ingredients : []
      };
      const id = await repos.dietFoodRepository.create(payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "dietFoods", "DIET_FOOD_CREATE", { id, name: data.name });
      return id;
    } catch (e) {
      console.error("Error creating diet food:", e);
      throw e;
    }
  },
  async update(id, data, actor) {
    try {
      const payload = {
        ...data,
        updatedAt: new Date().toISOString(),
        calories: Number(data.calories || 0),
        proteinGrams: Number(data.proteinGrams || 0),
        carbsGrams: Number(data.carbsGrams || 0),
        fatsGrams: Number(data.fatsGrams || 0),
        fiberGrams: Number(data.fiberGrams || 0),
        glycemicIndex: Number(data.glycemicIndex || 0)
      };
      await repos.dietFoodRepository.update(id, payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "dietFoods", "DIET_FOOD_UPDATE", { id, changes: Object.keys(data) });
      return id;
    } catch (e) {
      console.error("Error updating diet food:", e);
      throw e;
    }
  },
  async delete(id, actor) {
    try {
      await repos.dietFoodRepository.delete(id);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "dietFoods", "DIET_FOOD_DELETE", { id });
      return id;
    } catch (e) {
      console.error("Error deleting diet food:", e);
      throw e;
    }
  }
};

// 15. Meal Plans Service
export const MealPlanService = {
  async getAll() {
    try {
      return await repos.mealPlanRepository.getAll();
    } catch (e) {
      console.warn("Offline fallback for getMealPlans:", e.message);
      return [];
    }
  },
  async create(data, actor) {
    try {
      const payload = {
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        price: Number(data.price || 0),
        discountedPrice: Number(data.discountedPrice || data.price || 0),
        durationDays: Number(data.durationDays || 7),
        activeSubscribers: Number(data.activeSubscribers || 0),
        weeklySchedule: data.weeklySchedule || {}
      };
      const id = await repos.mealPlanRepository.create(payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "mealPlans", "MEAL_PLAN_CREATE", { id, name: data.title });
      return id;
    } catch (e) {
      console.error("Error creating meal plan:", e);
      throw e;
    }
  },
  async update(id, data, actor) {
    try {
      const payload = {
        ...data,
        updatedAt: new Date().toISOString()
      };
      await repos.mealPlanRepository.update(id, payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "mealPlans", "MEAL_PLAN_UPDATE", { id });
      return id;
    } catch (e) {
      console.error("Error updating meal plan:", e);
      throw e;
    }
  },
  async delete(id, actor) {
    try {
      await repos.mealPlanRepository.delete(id);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "mealPlans", "MEAL_PLAN_DELETE", { id });
      return id;
    } catch (e) {
      console.error("Error deleting meal plan:", e);
      throw e;
    }
  }
};

// 16. Diet Categories Service
export const DietCategoryService = {
  async getAll() {
    try {
      return await repos.dietCategoryRepository.getAll();
    } catch (e) {
      return [];
    }
  },
  async create(data, actor) {
    const payload = { ...data, createdAt: new Date().toISOString() };
    const id = await repos.dietCategoryRepository.create(payload);
    await repos.auditLogRepository.logAction(actor?.uid || "system", "dietCategories", "DIET_CATEGORY_CREATE", { id, name: data.name });
    return id;
  },
  async update(id, data, actor) {
    await repos.dietCategoryRepository.update(id, { ...data, updatedAt: new Date().toISOString() });
    await repos.auditLogRepository.logAction(actor?.uid || "system", "dietCategories", "DIET_CATEGORY_UPDATE", { id });
    return id;
  },
  async delete(id, actor) {
    await repos.dietCategoryRepository.delete(id);
    await repos.auditLogRepository.logAction(actor?.uid || "system", "dietCategories", "DIET_CATEGORY_DELETE", { id });
    return id;
  }
};

// 17. Diet Offers Service
export const DietOfferService = {
  async getAll() {
    try {
      return await repos.dietOfferRepository.getAll();
    } catch (e) {
      return [];
    }
  },
  async create(data, actor) {
    const payload = { ...data, createdAt: new Date().toISOString() };
    const id = await repos.dietOfferRepository.create(payload);
    await repos.auditLogRepository.logAction(actor?.uid || "system", "dietOffers", "DIET_OFFER_CREATE", { id });
    return id;
  },
  async delete(id, actor) {
    await repos.dietOfferRepository.delete(id);
    await repos.auditLogRepository.logAction(actor?.uid || "system", "dietOffers", "DIET_OFFER_DELETE", { id });
    return id;
  }
};

// 18. Diet Banners Service
export const DietBannerService = {
  async getAll() {
    try {
      return await repos.dietBannerRepository.getAll();
    } catch (e) {
      return [];
    }
  },
  async create(data, actor) {
    const payload = { ...data, createdAt: new Date().toISOString() };
    const id = await repos.dietBannerRepository.create(payload);
    await repos.auditLogRepository.logAction(actor?.uid || "system", "dietBanners", "DIET_BANNER_CREATE", { id });
    return id;
  },
  async delete(id, actor) {
    await repos.dietBannerRepository.delete(id);
    await repos.auditLogRepository.logAction(actor?.uid || "system", "dietBanners", "DIET_BANNER_DELETE", { id });
    return id;
  }
};

// 17. Subscriptions Service
export const SubscriptionService = {
  async getAll() {
    try {
      return await repos.subscriptionRepository.getAll();
    } catch (e) {
      return [];
    }
  },
  async updateStatus(id, status, actor, reason = "") {
    try {
      await repos.subscriptionRepository.update(id, {
        status,
        updatedAt: new Date().toISOString(),
        statusChangeReason: reason
      });
      await repos.auditLogRepository.logAction(actor?.uid || "system", "subscriptions", "SUBSCRIPTION_STATUS_CHANGE", { id, status, reason });
      return id;
    } catch (e) {
      console.error("Error updating subscription status:", e);
      throw e;
    }
  }
};

// 18. Reports Export Service (PDF, Excel, CSV)
export const ReportExportService = {
  exportCSV(filename, headers, rows) {
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  exportExcel(filename, headers, rows) {
    // Generates an Excel XML / TSV format compatible with Excel and Google Sheets
    let xml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"/><style>td { mso-number-format:"\\@"; }</style></head>
    <body><table><thead><tr>`;
    headers.forEach(h => { xml += `<th style="background-color:#10b981;color:#ffffff;font-weight:bold;">${h}</th>`; });
    xml += `</tr></thead><tbody>`;
    rows.forEach(r => {
      xml += `<tr>`;
      r.forEach(c => { xml += `<td>${String(c ?? "")}</td>`; });
      xml += `</tr>`;
    });
    xml += `</tbody></table></body></html>`;

    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0, 10)}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  exportPDF(title, headers, rows) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const tableRows = rows.map(r => `<tr>${r.map(c => `<td style="border:1px solid #e2e8f0;padding:8px;font-size:12px;">${c}</td>`).join("")}</tr>`).join("");
    const tableHeaders = headers.map(h => `<th style="border:1px solid #10b981;background:#10b981;color:white;padding:10px;font-size:13px;text-align:left;">${h}</th>`).join("");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} - HomeBites Executive Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 24px; color: #1e293b; }
            .header { border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-space-between; align-items: center; }
            .title { font-size: 22px; font-weight: bold; color: #0f172a; }
            .subtitle { font-size: 12px; color: #64748b; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">HomeBites Command Center - ${title}</div>
              <div class="subtitle">Generated on ${new Date().toLocaleString()} | Enterprise Audit Report</div>
            </div>
          </div>
          <table>
            <thead><tr>${tableHeaders}</tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div class="footer">Confidential - HomeBites Executive Dashboard &amp; Analytics</div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }
};

