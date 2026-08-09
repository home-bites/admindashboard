import { create } from "zustand";
import { OrderService } from "../services";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/firebaseConfig";

export const useOrderStore = create((set, get) => ({
  orders: [],
  loading: false,
  error: null,
  unsubscribeOrders: null,

  subscribeOrders: () => {
    if (get().unsubscribeOrders) return;

    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
    if (isMock || !isFirebaseConfigured) {
      get().fetchOrders();
      return;
    }

    set({ loading: true, error: null });

    const formatAddress = (addr) => {
      if (!addr) return "N/A";
      if (typeof addr === "string") return addr;
      const parts = [
        addr.flatNo,
        addr.area,
        addr.landmark,
        addr.city,
        addr.pinCode
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : "N/A";
    };

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

    const unsubscribe = onSnapshot(
      query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(200)),
      (snapshot) => {
        const orders = [];
        snapshot.forEach((doc) => {
          const o = doc.data();
          if (o.isDeleted !== true) {
            orders.push({
              id: doc.id,
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
            });
          }
        });

        // Sort by createdAt descending
        orders.sort((a, b) => {
          const dateA = parseDate(a.createdAt || a.timestamp);
          const dateB = parseDate(b.createdAt || b.timestamp);
          return dateB - dateA;
        });

        set({ orders, loading: false });
      },
      (err) => {
        set({ error: err.message, loading: false });
      }
    );

    set({ unsubscribeOrders: unsubscribe });
  },

  disconnectOrders: () => {
    const unsub = get().unsubscribeOrders;
    if (unsub) {
      unsub();
      set({ unsubscribeOrders: null });
    }
  },

  fetchOrders: async () => {
    set({ loading: true, error: null });
    try {
      const orders = await OrderService.getOrders();
      set({ orders, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  addOrder: async (orderData, actor) => {
    set({ loading: true, error: null });
    try {
      await OrderService.createOrder(orderData, actor);
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  updateOrderStatus: async (id, status, actor) => {
    set({ loading: true, error: null });
    try {
      await OrderService.updateOrderStatus(id, status, actor);
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  assignDeliveryPartner: async (id, partnerId, partnerName, actor) => {
    set({ loading: true, error: null });
    try {
      await OrderService.assignDeliveryPartner(id, partnerId, partnerName, actor);
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  unassignDeliveryPartner: async (id, actor) => {
    set({ loading: true, error: null });
    try {
      await OrderService.unassignDeliveryPartner(id, actor);
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useOrderStore;
