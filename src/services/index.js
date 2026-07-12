import { signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { arrayUnion, serverTimestamp, Timestamp } from "firebase/firestore";
import { auth, isFirebaseConfigured } from "../firebase/firebaseConfig";
import * as repos from "../repositories";

// 1. Authentication Service
export const AuthService = {
  async login(email, password) {
    if (!isFirebaseConfigured) {
      throw new Error("Firebase is not configured.");
    }

    // Standard Firebase authentication
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const uid = user.uid;

    // Fetch user profile from Firestore repository
    let userProfile = await repos.userRepository.getById(uid);

    if (!userProfile) {
      // Create audit log entry for missing account before logging out
      try {
        await repos.auditLogRepository.logAction(
          uid,
          "Authentication",
          "LOGIN_FAILED_MISSING_ACCOUNT",
          {
            action: "LOGIN_FAILED",
            uid: uid,
            email: user.email,
            role: "None",
            loginMethod: "firebase_auth",
            timestamp: new Date().toISOString(),
            reason: "Account not configured by administrator."
          }
        );
      } catch (e) {
        console.warn("Could not write audit log:", e.message);
      }

      // Logout user immediately
      await firebaseSignOut(auth);

      throw new Error("Account not configured by administrator.");
    }

    // Verify user is active
    if (userProfile.isActive === false || userProfile.status === "Inactive") {
      // Create audit log entry for inactive account attempt
      try {
        await repos.auditLogRepository.logAction(
          uid,
          "Authentication",
          "LOGIN_FAILED_INACTIVE_ACCOUNT",
          {
            action: "LOGIN_FAILED",
            uid: uid,
            email: user.email,
            role: userProfile.role || "None",
            loginMethod: "firebase_auth",
            timestamp: new Date().toISOString(),
            reason: "Account is inactive."
          }
        );
      } catch (e) {
        console.warn("Could not write audit log:", e.message);
      }

      // Logout user immediately
      await firebaseSignOut(auth);

      throw new Error("Access Denied: Your account is inactive. Please contact a Super Admin.");
    }

    if (!userProfile.role) {
      // Logout user immediately
      await firebaseSignOut(auth);
      throw new Error("Account not configured by administrator.");
    }

    const authenticatedUser = {
      uid,
      email: user.email,
      displayName: userProfile.displayName || user.displayName || "Admin User",
      role: userProfile.role,
      isDevelopmentMode: false
    };

    // Log to audit log in the exact format required
    try {
      await repos.auditLogRepository.logAction(
        uid,
        "Authentication",
        "LOGIN",
        {
          action: "LOGIN",
          uid: uid,
          email: user.email,
          displayName: userProfile.displayName || user.displayName || "Admin User",
          role: userProfile.role,
          loginMethod: "firebase_auth",
          timestamp: new Date().toISOString()
        }
      );
    } catch (e) {
      console.warn("Could not write audit log:", e.message);
    }

    return authenticatedUser;
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
        itemsText: o.itemsText || (o.items ? o.items.map(i => `${i.qty || 1}x ${i.name}`).join(", ") : ""),
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
      
      // Write user and rider notifications for status change
      try {
        const order = await repos.orderRepository.getById(orderId);
        if (order) {
          if (order.customerId) {
            let title = "Order Status Update";
            let message = `Your order #${order.orderId || orderId} is now ${status}.`;
            if (status === "Accepted") {
              title = "Order Confirmed";
              message = `Your order #${order.orderId || orderId} has been accepted by the Home Chef.`;
            } else if (status === "Preparing") {
              title = "Preparing Your Meal";
              message = `Your gourmet meal for order #${order.orderId || orderId} is being prepared.`;
            } else if (status === "Ready") {
              title = "Order Ready for Pickup";
              message = `Your order #${order.orderId || orderId} is cooked and ready for pickup!`;
            } else if (status === "Delivered") {
              title = "Order Delivered";
              message = `Your order #${order.orderId || orderId} has been successfully delivered. Enjoy!`;
            } else if (status === "Cancelled") {
              title = "Order Cancelled";
              message = `Your order #${order.orderId || orderId} has been cancelled.`;
            }
            await repos.notificationRepository.create({
              userId: order.customerId,
              title,
              message,
              type: "orders",
              referenceId: orderId,
              isRead: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }

          const riderId = order.assignedPartnerId || order.deliveryPartnerId;
          if (riderId) {
            let riderTitle = "";
            let riderMessage = "";
            if (status === "Preparing") {
              riderTitle = "Meal Preparing";
              riderMessage = `Order #${order.orderId || orderId} is being prepared by the Home Chef.`;
            } else if (status === "Ready") {
              riderTitle = "Order Ready for Pickup";
              riderMessage = `Order #${order.orderId || orderId} is ready! Please pick it up from the Home Chef.`;
            } else if (status === "Cancelled") {
              riderTitle = "Order Cancelled";
              riderMessage = `Order #${order.orderId || orderId} has been cancelled by the customer/chef.`;
            }
            if (riderTitle) {
              await repos.notificationRepository.create({
                userId: riderId,
                title: riderTitle,
                message: riderMessage,
                type: "orders",
                referenceId: orderId,
                isRead: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
            }
          }
        }
      } catch (notiErr) {
        console.warn("Could not write notification:", notiErr.message);
      }
      
      return result;
    } catch (e) {
      console.warn("Offline fallback for updateOrderStatus:", e.message);
      return orderId;
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
      console.warn("Offline fallback for assignDeliveryPartner:", e.message);
      return orderId;
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
        rider: orderData.rider || "Assigning...",
        deliveryAddress: orderData.address || "Counter Pickup",
        city: orderData.city || "Bengaluru",
        note: orderData.note || "",
        verificationCode: Math.floor(1000 + Math.random() * 9000).toString(),
        verificationStatus: "Pending",
        verificationGeneratedAt: new Date().toISOString()
      };

      await repos.orderRepository.set(orderId, payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "orders", "ORDER_CREATE", { orderId, orderData: payload });
      return orderId;
    } catch (e) {
      console.warn("Offline fallback for createOrder:", e.message);
      return "mock-order-id";
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
      console.warn("Offline fallback for createCategory:", e.message);
      return "mock-category-id";
    }
  },
  async updateCategory(categoryId, categoryData, actor) {
    try {
      const result = await repos.categoryRepository.update(categoryId, categoryData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "categories", "CATEGORY_UPDATE", { categoryId, categoryData });
      return result;
    } catch (e) {
      console.warn("Offline fallback for updateCategory:", e.message);
      return categoryId;
    }
  },
  async deleteCategory(categoryId, actor) {
    try {
      const result = await repos.categoryRepository.delete(categoryId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "categories", "CATEGORY_DELETE", { categoryId });
      return result;
    } catch (e) {
      console.warn("Offline fallback for deleteCategory:", e.message);
      return categoryId;
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
      console.warn("Offline fallback for createMenuItem:", e.message);
      return "mock-menu-id";
    }
  },
  async updateMenuItem(itemId, menuData, actor) {
    try {
      const result = await repos.menuItemRepository.update(itemId, menuData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "menuItems", "MENU_ITEM_UPDATE", { itemId, menuData });
      return result;
    } catch (e) {
      console.warn("Offline fallback for updateMenuItem:", e.message);
      return itemId;
    }
  },
  async deleteMenuItem(itemId, actor) {
    try {
      const result = await repos.menuItemRepository.delete(itemId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "menuItems", "MENU_ITEM_DELETE", { itemId });
      return result;
    } catch (e) {
      console.warn("Offline fallback for deleteMenuItem:", e.message);
      return itemId;
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
      console.warn("Offline fallback for createBanner:", e.message);
      return "mock-banner-id";
    }
  },
  async updateBanner(bannerId, bannerData, actor) {
    try {
      const result = await repos.bannerRepository.update(bannerId, bannerData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "banners", "BANNER_UPDATE", { bannerId, bannerData });
      return result;
    } catch (e) {
      console.warn("Offline fallback for updateBanner:", e.message);
      return bannerId;
    }
  },
  async deleteBanner(bannerId, actor) {
    try {
      const result = await repos.bannerRepository.delete(bannerId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "banners", "BANNER_DELETE", { bannerId });
      return result;
    } catch (e) {
      console.warn("Offline fallback for deleteBanner:", e.message);
      return bannerId;
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
        status: c.isActive !== false ? "Active" : "Expired",
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
        isActive: couponData.status === "Active" || couponData.isActive !== false,
        type: couponData.type || "",
        usageLimit: couponData.usageLimit || 1000,
        usedCount: couponData.usedCount || 0
      };
      const result = await repos.couponRepository.create(payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "coupons", "COUPON_CREATE", { couponId: result, couponData: payload });
      return result;
    } catch (e) {
      console.warn("Offline fallback for createCoupon:", e.message);
      return "mock-coupon-id";
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
        isActive: couponData.status !== undefined ? (couponData.status === "Active") : couponData.isActive,
        type: couponData.type
      };
      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
      
      const result = await repos.couponRepository.update(couponId, payload);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "coupons", "COUPON_UPDATE", { couponId, couponData: payload });
      return result;
    } catch (e) {
      console.warn("Offline fallback for updateCoupon:", e.message);
      return couponId;
    }
  },
  async deleteCoupon(couponId, actor) {
    try {
      const result = await repos.couponRepository.delete(couponId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "coupons", "COUPON_DELETE", { couponId });
      return result;
    } catch (e) {
      console.warn("Offline fallback for deleteCoupon:", e.message);
      return couponId;
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
      console.warn("Offline fallback for createDeal:", e.message);
      return "mock-deal-id";
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
      console.warn("Offline fallback for updateDeal:", e.message);
      return dealId;
    }
  },
  async deleteDeal(dealId, actor) {
    try {
      const result = await repos.dealRepository.delete(dealId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "deals", "DEAL_DELETE", { dealId });
      return result;
    } catch (e) {
      console.warn("Offline fallback for deleteDeal:", e.message);
      return dealId;
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
      console.warn("Offline fallback for createDeliveryPartner:", e.message);
      return "mock-partner-id";
    }
  },
  async updateDeliveryPartner(partnerId, partnerData, actor) {
    try {
      const result = await repos.deliveryPartnerRepository.update(partnerId, partnerData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "deliveryPartners", "PARTNER_UPDATE", { partnerId, partnerData });
      return result;
    } catch (e) {
      console.warn("Offline fallback for updateDeliveryPartner:", e.message);
      return partnerId;
    }
  },
  async deleteDeliveryPartner(partnerId, actor) {
    try {
      const result = await repos.deliveryPartnerRepository.delete(partnerId);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "deliveryPartners", "PARTNER_DELETE", { partnerId });
      return result;
    } catch (e) {
      console.warn("Offline fallback for deleteDeliveryPartner:", e.message);
      return partnerId;
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
      console.warn("Offline fallback for createWalletTransaction:", e.message);
      return "mock-txn-id";
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
      console.warn("Offline fallback for updateSupportTicket:", e.message);
      return ticketId;
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
          couponEnabled: true,
          deliveryTrackingEnabled: true
        };
      }
      return data;
    } catch (e) {
      console.warn("Offline fallback for getSettings:", e.message);
      return {
        id: "general",
        rainCharge: 0,
        deliveryCharge: 30,
        supportPhone: "+91 98765 43210",
        storeOpen: true,
        maintenanceMode: false,
        minimumOrderValue: 150,
        walletEnabled: true,
        couponEnabled: true,
        deliveryTrackingEnabled: true
      };
    }
  },
  async updateSettings(settingsData, actor) {
    try {
      const result = await repos.appSettingsRepository.set("general", settingsData);
      await repos.auditLogRepository.logAction(actor?.uid || "system", "appSettings", "SETTINGS_UPDATE", { settingsData });
      return result;
    } catch (e) {
      console.warn("Offline fallback for updateSettings:", e.message);
      return "general";
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
      console.warn("Offline fallback for deleteReview:", e.message);
      return reviewId;
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
