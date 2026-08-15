import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { Link, useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/firebaseConfig";
import EmptyState from "../components/EmptyState";

const getStartOfWeek = (d) => {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  return start;
};

export const Dashboard = () => {
  const { addToast } = useUiStore();
  const navigate = useNavigate();

  // Primary Data State
  const [kitchenOnline, setKitchenOnline] = useState(true);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [partners, setPartners] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [timePeriod, setTimePeriod] = useState("This Month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Assign Rider State
  const [assigningOrderId, setAssigningOrderId] = useState(null);

  // Robust Date Parser to handle strings, numbers, Firestore Timestamps
  const parseDate = (val) => {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val.toDate === "function") return val.toDate();
    if (val.seconds !== undefined) return new Date(val.seconds * 1000);
    if (val._seconds !== undefined) return new Date(val._seconds * 1000);
    if (typeof val === "string" || typeof val === "number") {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  // 1. Listeners setup for all Firestore collections
  useEffect(() => {
    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true" || !isFirebaseConfigured;

    if (isMock) {
      setOrders([
        { id: "HB260001", orderId: "HB260001", customerName: "Sarah Jenkins", customerPhone: "+91 98765 43210", itemsText: "2x Spicy Tuna Bowl, 1x Coke", total: 480, status: "Preparing", createdAt: new Date(Date.now() - 3600000 * 2).toISOString(), paymentMethod: "Wallet", items: [{ name: "Spicy Tuna Bowl", qty: 2 }, { name: "Coke", qty: 1 }], statusHistory: [{ status: "Accepted", timestamp: new Date(Date.now() - 3600000 * 2).toISOString() }] },
        { id: "HB260002", orderId: "HB260002", customerName: "Michael Chen", customerPhone: "+91 98765 43211", itemsText: "1x Classic Burger, 1x Fries", total: 260, status: "Ready", createdAt: new Date(Date.now() - 3600000 * 5).toISOString(), paymentMethod: "COD", items: [{ name: "Classic Burger", qty: 1 }, { name: "Fries", qty: 1 }], statusHistory: [{ status: "Accepted", timestamp: new Date(Date.now() - 3600000 * 5).toISOString() }] },
        { id: "HB260003", orderId: "HB260003", customerName: "Emma Watson", customerPhone: "+91 98765 43212", itemsText: "3x Avocado Toast", total: 620, status: "Delivered", createdAt: new Date(Date.now() - 3600000 * 10).toISOString(), paymentMethod: "Razorpay", items: [{ name: "Avocado Toast", qty: 3 }], statusHistory: [{ status: "Accepted", timestamp: new Date(Date.now() - 3600000 * 11).toISOString() }, { status: "Delivered", timestamp: new Date(Date.now() - 3600000 * 10.5).toISOString() }] },
        { id: "HB260004", orderId: "HB260004", customerName: "Aarav Sharma", customerPhone: "+91 98765 43213", itemsText: "1x Garlic Bread, 1x Pasta", total: 390, status: "Delivered", createdAt: new Date(Date.now() - 3600000 * 24).toISOString(), paymentMethod: "Razorpay", items: [{ name: "Garlic Bread", qty: 1 }, { name: "Pasta", qty: 1 }], statusHistory: [{ status: "Accepted", timestamp: new Date(Date.now() - 3600000 * 25).toISOString() }, { status: "Delivered", timestamp: new Date(Date.now() - 3600000 * 24.3).toISOString() }] },
        { id: "HB260005", orderId: "HB260005", customerName: "Deepa Nair", customerPhone: "+91 98765 43214", itemsText: "2x Margherita Pizza", total: 540, status: "Cancelled", createdAt: new Date(Date.now() - 3600000 * 48).toISOString(), paymentMethod: "COD", items: [{ name: "Margherita Pizza", qty: 2 }], statusHistory: [{ status: "Cancelled", timestamp: new Date(Date.now() - 3600000 * 47).toISOString() }] }
      ]);
      setCustomers([
        { id: "cust1", name: "Sarah Jenkins", email: "sarah@gmail.com", phone: "+91 98765 43210", createdAt: new Date(Date.now() - 3600000 * 10).toISOString() },
        { id: "cust2", name: "Michael Chen", email: "michael@gmail.com", phone: "+91 98765 43211", createdAt: new Date(Date.now() - 3600000 * 24).toISOString() },
        { id: "cust3", name: "Emma Watson", email: "emma@gmail.com", phone: "+91 98765 43212", createdAt: new Date(Date.now() - 3600000 * 48).toISOString() }
      ]);
      setPartners([
        { id: "partner1", name: "Ramesh Kumar", partnerId: "HBDEL1001", currentStatus: "Available", approved: true, isOnline: true },
        { id: "partner2", name: "Suresh Raina", partnerId: "HBDEL1002", currentStatus: "Offline", approved: true, isOnline: false },
        { id: "partner3", name: "Amit Patel", partnerId: "HBDEL1003", currentStatus: "Delivering", approved: true, isOnline: true }
      ]);
      setMenuItems([
        { id: "menu1", name: "Spicy Tuna Bowl", category: "Bowls" },
        { id: "menu2", name: "Classic Burger", category: "Burgers" },
        { id: "menu3", name: "Avocado Toast", category: "Breakfast" },
        { id: "menu4", name: "Coke", category: "Beverages" },
        { id: "menu5", name: "Margherita Pizza", category: "Pizza" }
      ]);
      setCategories([
        { id: "cat1", name: "Bowls" },
        { id: "cat2", name: "Burgers" },
        { id: "cat3", name: "Breakfast" },
        { id: "cat4", name: "Beverages" },
        { id: "cat5", name: "Pizza" }
      ]);
      setKitchenOnline(true);
      setLoading(false);
      return;
    }

    const unsubKitchen = onSnapshot(doc(db, "appSettings", "general"), (docSnap) => {
      if (docSnap.exists()) {
        setKitchenOnline(docSnap.data().storeOpen ?? true);
      }
    }, (err) => {
      console.error("Dashboard Kitchen Error:", err);
    });

    const unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isDeleted !== true) {
          list.push({
            id: docSnap.id,
            ...data,
            customerName: data.customerName || data.customer || "Walk-in Customer",
            customerPhone: data.customerPhone || data.phone || "N/A"
          });
        }
      });
      list.sort((a, b) => {
        const dateA = a.createdAt ? parseDate(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? parseDate(b.createdAt) : new Date(0);
        return dateB - dateA;
      });
      setOrders(list);
      setLoading(false);
    }, (err) => {
      console.error("Dashboard Orders Sync Error:", err);
      addToast(`Orders Sync Error: ${err.message}`, "error");
      setLoading(false);
    });

    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isDeleted !== true && (data.role === "Customer" || !data.role)) {
          list.push({
            id: docSnap.id,
            ...data
          });
        }
      });
      setCustomers(list);
    }, (err) => {
      console.error("Dashboard Users Sync Error:", err);
      addToast(`Users Sync Error: ${err.message}`, "error");
    });

    const unsubPartners = onSnapshot(collection(db, "deliveryPartners"), (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isDeleted !== true) {
          list.push({
            id: docSnap.id,
            ...data
          });
        }
      });
      setPartners(list);
    }, (err) => {
      console.error("Dashboard Partners Sync Error:", err);
      addToast(`Partners Sync Error: ${err.message}`, "error");
    });

    const unsubMenuItems = onSnapshot(collection(db, "menuItems"), (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isDeleted !== true) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      setMenuItems(list);
    }, (err) => {
      console.error("Dashboard Menu Items Sync Error:", err);
    });

    const unsubCategories = onSnapshot(collection(db, "categories"), (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isDeleted !== true) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      setCategories(list);
    }, (err) => {
      console.error("Dashboard Categories Sync Error:", err);
    });

    return () => {
      unsubKitchen();
      unsubOrders();
      unsubUsers();
      unsubPartners();
      unsubMenuItems();
      unsubCategories();
    };
  }, []);

  const toggleKitchenStatus = async () => {
    const nextStatus = !kitchenOnline;
    setKitchenOnline(nextStatus);

    if (import.meta.env.VITE_ENABLE_MOCK_DATA === "true" || !isFirebaseConfigured) {
      addToast(
        nextStatus ? "Kitchen is now ONLINE (Mock Mode)." : "Kitchen is now OFFLINE (Mock Mode).",
        nextStatus ? "success" : "warning"
      );
      return;
    }

    try {
      await updateDoc(doc(db, "appSettings", "general"), {
        storeOpen: nextStatus
      });
      addToast(
        nextStatus ? "Kitchen is now ONLINE. Accepting new orders." : "Kitchen is now OFFLINE. Not accepting new orders.",
        nextStatus ? "success" : "warning"
      );
    } catch (err) {
      addToast(`Failed to update kitchen status: ${err.message}`, "error");
    }
  };

  const handleAssignRider = async (orderId, partnerId, partnerName) => {
    try {
      if (import.meta.env.VITE_ENABLE_MOCK_DATA === "true" || !isFirebaseConfigured) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "Out for Delivery", assignedPartnerId: partnerId, rider: partnerName } : o));
        addToast(`Order #${orderId} assigned to ${partnerName} (Mock Mode)`, "success");
        return;
      }

      const { doc, updateDoc, arrayUnion, serverTimestamp, Timestamp } = await import("firebase/firestore");
      await updateDoc(doc(db, "orders", orderId), {
        deliveryPartnerId: partnerId,
        assignedPartnerId: partnerId,
        assignedPartnerName: partnerName || "Rider",
        rider: partnerName || "Rider",
        assignmentStatus: "Assigned",
        status: "Out for Delivery",
        statusHistory: arrayUnion({
          status: "Out for Delivery",
          timestamp: Timestamp.now(),
        }),
        updatedAt: serverTimestamp()
      });

      const { setDoc } = await import("firebase/firestore");
      await setDoc(doc(db, "orderTracking", orderId), {
        orderId,
        status: "Out for Delivery",
        partnerId,
        latitude: 0,
        longitude: 0,
        updatedAt: new Date().toISOString()
      });

      addToast(`Order #${orderId} assigned to ${partnerName}`, "success");
    } catch (err) {
      addToast(`Failed to assign partner: ${err.message}`, "error");
    }
  };

  // --- Dynamic Calculations using robust parseDate parser ---
  const getFilteredOrders = () => {
    const now = new Date();
    return orders.filter(o => {
      const oDate = parseDate(o.createdAt || o.timestamp);
      if (!oDate) return false;

      switch (timePeriod) {
        case "Today": {
          const start = new Date(); start.setHours(0,0,0,0);
          const end = new Date(); end.setHours(23,59,59,999);
          return oDate >= start && oDate <= end;
        }
        case "Yesterday": {
          const start = new Date(); start.setDate(start.getDate() - 1); start.setHours(0,0,0,0);
          const end = new Date(); end.setDate(end.getDate() - 1); end.setHours(23,59,59,999);
          return oDate >= start && oDate <= end;
        }
        case "Last 7 Days": {
          const start = new Date(); start.setDate(start.getDate() - 7); start.setHours(0,0,0,0);
          return oDate >= start && oDate <= now;
        }
        case "This Week": {
          const start = getStartOfWeek(new Date());
          return oDate >= start && oDate <= now;
        }
        case "This Month": {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          return oDate >= start && oDate <= now;
        }
        case "Last Month": {
          const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
          return oDate >= start && oDate <= end;
        }
        case "This Year": {
          const start = new Date(now.getFullYear(), 0, 1);
          return oDate >= start && oDate <= now;
        }
        case "Custom Date Range": {
          if (!customStart) return true;
          const start = new Date(customStart); start.setHours(0,0,0,0);
          const end = customEnd ? new Date(customEnd) : new Date(); end.setHours(23,59,59,999);
          return oDate >= start && oDate <= end;
        }
        default:
          return true;
      }
    });
  };

  const periodOrders = getFilteredOrders();

  // Selected period sums
  const periodRevenue = periodOrders
    .filter(o => o.status === "Delivered")
    .reduce((sum, o) => sum + Number(o.total || o.totalAmount || 0), 0);

  const periodDeliveredCount = periodOrders.filter(o => o.status === "Delivered").length;
  const periodCancelledCount = periodOrders.filter(o => o.status === "Cancelled").length;
  const avgOrderValue = periodDeliveredCount > 0 ? (periodRevenue / periodDeliveredCount) : 0;

  // Global Time Snapshots (Today, Weekly, Monthly, Cumulative)
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  
  const nowTime = new Date();
  const weekStart = getStartOfWeek(new Date());
  const monthStart = new Date(nowTime.getFullYear(), nowTime.getMonth(), 1);

  const ordersTodayCount = orders.filter(o => {
    const d = parseDate(o.createdAt || o.timestamp);
    return d && d >= todayStart && d <= todayEnd;
  }).length;

  const deliveredTodayCount = orders.filter(o => {
    const d = parseDate(o.createdAt || o.timestamp);
    return o.status === "Delivered" && d && d >= todayStart && d <= todayEnd;
  }).length;

  const revenueToday = orders
    .filter(o => {
      const d = parseDate(o.createdAt || o.timestamp);
      return o.status === "Delivered" && d && d >= todayStart && d <= todayEnd;
    })
    .reduce((sum, o) => sum + Number(o.total || o.totalAmount || 0), 0);

  const revenueThisWeek = orders
    .filter(o => {
      const d = parseDate(o.createdAt || o.timestamp);
      return o.status === "Delivered" && d && d >= weekStart;
    })
    .reduce((sum, o) => sum + Number(o.total || o.totalAmount || 0), 0);

  const revenueThisMonth = orders
    .filter(o => {
      const d = parseDate(o.createdAt || o.timestamp);
      return o.status === "Delivered" && d && d >= monthStart;
    })
    .reduce((sum, o) => sum + Number(o.total || o.totalAmount || 0), 0);

  const totalRevenue = orders
    .filter(o => o.status === "Delivered")
    .reduce((sum, o) => sum + Number(o.total || o.totalAmount || 0), 0);

  const activeOrdersCount = orders.filter(o => [
    "Pending", "Placed", "Accepted", "Preparing", "Ready", "Out for Delivery"
  ].includes(o.status)).length;

  const preparingOrdersCount = orders.filter(o => o.status === "Preparing").length;

  const totalCustomersCount = customers.length;
  
  const onlineDeliveryPartners = partners.filter(p => p.isOnline).length;
  const activeDeliveryPartners = partners.filter(p => p.currentStatus !== "Offline" && p.isOnline).length;

  const totalMenuItems = menuItems.length;
  const totalCategories = categories.length;

  // Average Delivery Time
  let deliveryTimeSum = 0;
  let deliveryTimeCount = 0;
  periodOrders.forEach(o => {
    if (o.status === "Delivered" && o.statusHistory) {
      const acceptedStep = o.statusHistory.find(h => h.status === "Accepted");
      const deliveredStep = o.statusHistory.find(h => h.status === "Delivered");
      if (acceptedStep && deliveredStep) {
        const tStart = parseDate(acceptedStep.timestamp);
        const tEnd = parseDate(deliveredStep.timestamp);
        if (tStart && tEnd) {
          const diff = (tEnd - tStart) / (1000 * 60);
          if (diff > 0 && diff < 180) {
            deliveryTimeSum += diff;
            deliveryTimeCount++;
          }
        }
      }
    }
  });
  const avgDeliveryTime = deliveryTimeCount > 0 ? Math.round(deliveryTimeSum / deliveryTimeCount) : 22;

  // Unassigned list
  const ordersNeedingAssignment = orders.filter(o => 
    ["Accepted", "Preparing", "Ready"].includes(o.status) && 
    (!o.assignedPartnerId || o.assignedPartnerId === "")
  );

  // --- Dynamic analytical trend grouping ---
  const getTrendData = () => {
    const grouped = {};
    periodOrders.forEach(o => {
      const d = parseDate(o.createdAt || o.timestamp);
      if (!d) return;
      
      let key = "";
      if (timePeriod === "Today" || timePeriod === "Yesterday") {
        key = `${d.getHours()}:00`;
      } else if (timePeriod === "This Year") {
        key = d.toLocaleString("default", { month: "short" });
      } else {
        key = d.toLocaleDateString("default", { month: "short", day: "numeric" });
      }
      
      if (!grouped[key]) {
        grouped[key] = { revenue: 0, orders: 0 };
      }
      if (o.status === "Delivered") {
        grouped[key].revenue += Number(o.total || o.totalAmount || 0);
      }
      grouped[key].orders += 1;
    });

    const keys = Object.keys(grouped);
    if (timePeriod === "Today" || timePeriod === "Yesterday") {
      keys.sort((a, b) => parseInt(a) - parseInt(b));
    } else {
      keys.sort((a, b) => new Date(a) - new Date(b));
    }
    return keys.map(k => ({
      label: k,
      revenue: grouped[k].revenue,
      orders: grouped[k].orders
    }));
  };

  const trendData = getTrendData();
  const maxTrendRevenue = Math.max(...trendData.map(t => t.revenue), 100);
  const maxTrendOrders = Math.max(...trendData.map(t => t.orders), 5);

  // Status Distribution
  const statusMap = { Pending: 0, Preparing: 0, Ready: 0, Delivered: 0, Cancelled: 0 };
  periodOrders.forEach(o => {
    const s = o.status || "Pending";
    if (statusMap[s] !== undefined) statusMap[s]++;
  });

  // Payment Method Distribution
  const paymentMap = { COD: 0, Razorpay: 0, Wallet: 0 };
  periodOrders.forEach(o => {
    const p = o.paymentMethod || "Razorpay";
    if (paymentMap[p] !== undefined) paymentMap[p]++;
  });

  // Top Selling Dishes
  const dishSales = {};
  periodOrders.forEach(o => {
    if (o.items && Array.isArray(o.items)) {
      o.items.forEach(i => {
        const name = i.name || "Unknown Item";
        const qty = Number(i.quantity ?? i.qty ?? 1);
        dishSales[name] = (dishSales[name] || 0) + qty;
      });
    } else if (o.itemsText) {
      o.itemsText.split(",").forEach(itemStr => {
        const clean = itemStr.trim();
        const match = clean.match(/^(\d+)x\s+(.+)$/);
        if (match) {
          const qty = parseInt(match[1]);
          const name = match[2].trim();
          dishSales[name] = (dishSales[name] || 0) + qty;
        } else if (clean) {
          dishSales[clean] = (dishSales[clean] || 0) + 1;
        }
      });
    }
  });

  const topDishes = Object.keys(dishSales)
    .map(name => ({ name, sales: dishSales[name] }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  // Top Categories
  const categorySales = {};
  const itemToCategory = {};
  menuItems.forEach(item => {
    if (item.name && item.category) {
      itemToCategory[item.name.toLowerCase().trim()] = item.category;
    }
  });

  Object.keys(dishSales).forEach(name => {
    const cat = itemToCategory[name.toLowerCase().trim()] || "General";
    categorySales[cat] = (categorySales[cat] || 0) + dishSales[name];
  });

  const topCategoriesList = Object.keys(categorySales)
    .map(name => ({ name, sales: categorySales[name] }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  // Peak Ordering Hours
  const hourlyCount = Array(24).fill(0);
  periodOrders.forEach(o => {
    const d = parseDate(o.createdAt || o.timestamp);
    if (d) hourlyCount[d.getHours()]++;
  });
  const peakHours = hourlyCount.map((count, hour) => ({ label: `${hour}:00`, count }));

  // Delivery performance times
  const deliveryPerformance = { "Under 15m": 0, "15-30m": 0, "30-45m": 0, "Over 45m": 0 };
  periodOrders.forEach(o => {
    if (o.status === "Delivered" && o.statusHistory) {
      const acceptedStep = o.statusHistory.find(h => h.status === "Accepted");
      const deliveredStep = o.statusHistory.find(h => h.status === "Delivered");
      if (acceptedStep && deliveredStep) {
        const tStart = parseDate(acceptedStep.timestamp);
        const tEnd = parseDate(deliveredStep.timestamp);
        if (tStart && tEnd) {
          const diff = (tEnd - tStart) / (1000 * 60);
          if (diff > 0) {
            if (diff < 15) deliveryPerformance["Under 15m"]++;
            else if (diff < 30) deliveryPerformance["15-30m"]++;
            else if (diff < 45) deliveryPerformance["30-45m"]++;
            else deliveryPerformance["Over 45m"]++;
          }
        }
      }
    }
  });

  // Customer Growth area chart
  const growthMap = {};
  customers.forEach(c => {
    const d = parseDate(c.createdAt);
    if (d) {
      const key = d.toLocaleDateString("default", { month: "short", day: "numeric" });
      growthMap[key] = (growthMap[key] || 0) + 1;
    }
  });

  const growthLabels = Object.keys(growthMap).sort((a,b) => new Date(a) - new Date(b));
  let runningCustomerTotal = 0;
  const growthTrend = growthLabels.map(l => {
    runningCustomerTotal += growthMap[l];
    return { label: l, count: runningCustomerTotal };
  });

  return (
    <div className="p-8 bg-[#f4f6f9] min-h-screen space-y-6">
      {/* SAP Fiori Page Header */}
      <div className="bg-white border border-slate-200/80 rounded-lg p-6 shadow-2xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-bold text-xl text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            Operational Performance Cockpit
          </h1>
          <p className="text-[11px] text-slate-400 font-bold tracking-wider uppercase mt-1">
            System status: Connected • {new Date().toLocaleDateString("default", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* SAP Period Selection Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            {["Today", "Yesterday", "Last 7 Days", "This Month", "This Year", "Custom Date Range"].map(p => (
              <button
                key={p}
                onClick={() => setTimePeriod(p)}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                  timePeriod === p
                    ? "bg-[#10b981] text-white shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {timePeriod === "Custom Date Range" && (
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200 animate-slide-up">
              <input 
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-200 rounded focus:border-[#10b981] outline-none"
              />
              <span className="text-xs text-slate-400 font-bold">to</span>
              <input 
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-200 rounded focus:border-[#10b981] outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* SAP Fiori KPI Tile Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* KPI Tile 1: Revenue */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 flex flex-col justify-between hover:border-[#10b981]/50 transition-all shadow-3xs relative overflow-hidden group">
          <div>
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Revenue ({timePeriod})</span>
              <span className="material-symbols-outlined text-slate-400 text-lg">payments</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <h2 className="text-2xl font-black text-slate-800">₹{periodRevenue.toFixed(2)}</h2>
            </div>
          </div>

          {/* Micro Area Sparkline */}
          <div className="h-10 w-full mt-4 flex items-end">
            {trendData.length > 1 ? (
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path
                  d={`M 0,100 ${trendData.slice(-7).map((t, idx) => `L ${idx * (100 / 6)},${100 - (t.revenue / maxTrendRevenue) * 80}`).join(" ")} L 100,100 Z`}
                  fill="url(#miniRev)"
                />
                <path
                  d={trendData.slice(-7).map((t, idx) => `${idx === 0 ? "M" : "L"} ${idx * (100 / 6)},${100 - (t.revenue / maxTrendRevenue) * 80}`).join(" ")}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                />
                <defs>
                  <linearGradient id="miniRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
              </svg>
            ) : (
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-[#10b981] h-full" style={{ width: "35%" }}></div>
              </div>
            )}
          </div>

          <div className="text-[10px] text-slate-400 font-bold border-t pt-2 mt-3 flex justify-between">
            <span>Cumulative: ₹{totalRevenue.toFixed(2)}</span>
            <span className="text-[#10b981]">Active</span>
          </div>
        </div>

        {/* KPI Tile 2: Orders Count */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 flex flex-col justify-between hover:border-[#10b981]/50 transition-all shadow-3xs relative overflow-hidden group">
          <div>
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Orders Count ({timePeriod})</span>
              <span className="material-symbols-outlined text-slate-400 text-lg">shopping_bag</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <h2 className="text-2xl font-black text-slate-800">{periodOrders.length}</h2>
            </div>
          </div>

          {/* Micro Column Sparkline */}
          <div className="h-10 w-full mt-4 flex items-end gap-1.5">
            {trendData.length > 0 ? (
              trendData.slice(-7).map((t, idx) => {
                const h = (t.orders / maxTrendOrders) * 100;
                return (
                  <div 
                    key={idx}
                    className="flex-1 bg-slate-100 hover:bg-[#10b981]/40 transition-colors rounded-t"
                    style={{ height: `${Math.max(15, h)}%` }}
                    title={`${t.label}: ${t.orders} orders`}
                  />
                );
              })
            ) : (
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-[#10b981] h-full" style={{ width: "20%" }}></div>
              </div>
            )}
          </div>

          <div className="text-[10px] text-slate-400 font-bold border-t pt-2 mt-3 flex justify-between">
            <span>Today: {ordersTodayCount} orders</span>
            <span>Monthly: {periodOrders.length}</span>
          </div>
        </div>

        {/* KPI Tile 3: Average Order Value */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 flex flex-col justify-between hover:border-[#10b981]/50 transition-all shadow-3xs relative overflow-hidden group">
          <div>
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Avg. Ticket Size</span>
              <span className="material-symbols-outlined text-slate-400 text-lg">query_stats</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <h2 className="text-2xl font-black text-slate-800">₹{avgOrderValue.toFixed(2)}</h2>
            </div>
          </div>

          {/* Micro progress status slider */}
          <div className="mt-6">
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#10b981] h-full rounded-full" style={{ width: `${Math.min(100, (avgOrderValue / 1000) * 100)}%` }}></div>
            </div>
            <span className="text-[9px] text-slate-400 font-bold mt-1 block">Rating vs Target (₹1,000)</span>
          </div>

          <div className="text-[10px] text-slate-400 font-bold border-t pt-2 mt-3 flex justify-between">
            <span>Completed orders: {periodDeliveredCount}</span>
            <span className="text-slate-500">AOV</span>
          </div>
        </div>

        {/* KPI Tile 4: Delivery Performance */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 flex flex-col justify-between hover:border-[#10b981]/50 transition-all shadow-3xs relative overflow-hidden group">
          <div>
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Avg. Dispatch Time</span>
              <span className="material-symbols-outlined text-slate-400 text-lg">timer</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <h2 className="text-2xl font-black text-slate-800">{avgDeliveryTime} mins</h2>
            </div>
          </div>

          {/* Micro bullet target indicator */}
          <div className="mt-6 flex justify-between items-center text-[10px] font-bold text-slate-400">
            <span>SLA Limit: 45m</span>
            <span className="text-[#10b981] font-black">Within SLA</span>
          </div>

          <div className="text-[10px] text-slate-400 font-bold border-t pt-2 mt-3 flex justify-between">
            <span>Active Fleet: {activeDeliveryPartners}</span>
            <span>Online: {onlineDeliveryPartners}</span>
          </div>
        </div>
      </div>

      {/* SAP Fiori Detail Analytics Charts Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chart Card 1: Revenue Line */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 shadow-2xs flex flex-col">
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h4 className="font-bold text-sm text-slate-800">Revenue Trend Distribution</h4>
            <span className="text-[10px] text-slate-400 font-bold uppercase">{timePeriod}</span>
          </div>
          <div className="h-48 flex items-end relative w-full pt-4">
            {trendData.length === 0 ? (
              <div className="m-auto text-xs text-slate-400 italic">No revenue recorded in this period</div>
            ) : (
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path
                  d={`M 0,100 ${trendData.map((t, idx) => `L ${idx * (100 / Math.max(1, trendData.length - 1))},${100 - (t.revenue / maxTrendRevenue) * 90}`).join(" ")} L 100,100 Z`}
                  fill="url(#mainRevGrad)"
                />
                <path
                  d={trendData.map((t, idx) => `${idx === 0 ? "M" : "L"} ${idx * (100 / Math.max(1, trendData.length - 1))},${100 - (t.revenue / maxTrendRevenue) * 90}`).join(" ")}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
                <defs>
                  <linearGradient id="mainRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
              </svg>
            )}
          </div>
          <div className="flex justify-between mt-2.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
            <span>{trendData[0]?.label || "Start"}</span>
            <span>{trendData[trendData.length - 1]?.label || "End"}</span>
          </div>
        </div>

        {/* Chart Card 2: Orders Trend */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 shadow-2xs flex flex-col">
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h4 className="font-bold text-sm text-slate-800">Order Volume Spread</h4>
            <span className="text-[10px] text-slate-400 font-bold uppercase">{timePeriod}</span>
          </div>
          <div className="h-48 flex items-end justify-around gap-2 pt-4">
            {trendData.length === 0 ? (
              <div className="m-auto text-xs text-slate-400 italic">No orders in this period</div>
            ) : (
              trendData.map((t, idx) => {
                const heightPct = (t.orders / maxTrendOrders) * 100;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div 
                      className="w-full bg-[#10b981]/25 hover:bg-[#10b981] rounded-t transition-all"
                      style={{ height: `${Math.max(10, heightPct)}%` }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-0.5 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap mb-1">
                        {t.orders} orders
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex justify-between mt-2.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
            <span>{trendData[0]?.label || "Start"}</span>
            <span>{trendData[trendData.length - 1]?.label || "End"}</span>
          </div>
        </div>

        {/* Chart Card 3: Order Status Distribution */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 shadow-2xs flex flex-col">
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h4 className="font-bold text-sm text-slate-800">Order Status Breakdown</h4>
            <span className="text-[10px] text-slate-400 font-bold uppercase">Real-Time</span>
          </div>
          <div className="flex-grow flex items-center justify-center gap-6">
            <svg className="w-28 h-28 shrink-0" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.91" fill="none" stroke="#f1f5f9" strokeWidth="3" />
              {(() => {
                const total = Math.max(1, periodOrders.length);
                let accum = 0;
                const colors = { Delivered: "#10b981", Preparing: "#f59e0b", Ready: "#3b82f6", Cancelled: "#ef4444", Pending: "#6b7280" };
                return Object.keys(statusMap).map(status => {
                  const val = statusMap[status];
                  const pct = (val / total) * 100;
                  if (pct === 0) return null;
                  const strokeDash = `${pct} ${100 - pct}`;
                  const offset = 100 - accum;
                  accum += pct;
                  return (
                    <circle
                      key={status}
                      cx="18"
                      cy="18"
                      r="15.91"
                      fill="none"
                      stroke={colors[status] || "#cbd5e1"}
                      strokeWidth="3.2"
                      strokeDasharray={strokeDash}
                      strokeDashoffset={offset}
                    />
                  );
                });
              })()}
            </svg>
            <div className="text-xs space-y-1.5 flex-grow">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#10b981]"></span> Delivered: {statusMap.Delivered}</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#f59e0b]"></span> Preparing: {statusMap.Preparing}</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span> Ready: {statusMap.Ready}</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#ef4444]"></span> Cancelled: {statusMap.Cancelled}</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-400"></span> Pending: {statusMap.Pending}</div>
            </div>
          </div>
        </div>
      </div>

      {/* SAP Fiori Detail Analytics Charts Panel (Row 2) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chart Card 4: Payment Distribution */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 shadow-2xs flex flex-col">
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h4 className="font-bold text-sm text-slate-800">Billing Channel Share</h4>
            <span className="text-[10px] text-slate-400 font-bold uppercase">{timePeriod}</span>
          </div>
          <div className="flex-grow flex items-center justify-center gap-6">
            <svg className="w-28 h-28 shrink-0" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.91" fill="none" stroke="#f1f5f9" strokeWidth="3" />
              {(() => {
                const total = Math.max(1, Object.values(paymentMap).reduce((a,b)=>a+b, 0));
                let accum = 0;
                const colors = { COD: "#f59e0b", Razorpay: "#10b981", Wallet: "#6366f1" };
                return Object.keys(paymentMap).map(pay => {
                  const val = paymentMap[pay];
                  const pct = (val / total) * 100;
                  if (pct === 0) return null;
                  const strokeDash = `${pct} ${100 - pct}`;
                  const offset = 100 - accum;
                  accum += pct;
                  return (
                    <circle
                      key={pay}
                      cx="18"
                      cy="18"
                      r="15.91"
                      fill="none"
                      stroke={colors[pay] || "#cbd5e1"}
                      strokeWidth="3.2"
                      strokeDasharray={strokeDash}
                      strokeDashoffset={offset}
                    />
                  );
                });
              })()}
            </svg>
            <div className="text-xs space-y-1.5 flex-grow">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#10b981]"></span> Razorpay: {paymentMap.Razorpay}</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#f59e0b]"></span> COD: {paymentMap.COD}</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#6366f1]"></span> Wallet: {paymentMap.Wallet}</div>
            </div>
          </div>
        </div>

        {/* Chart Card 5: Top Dishes */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 shadow-2xs flex flex-col">
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h4 className="font-bold text-sm text-slate-800">Top Selling Products</h4>
            <span className="text-[10px] text-slate-400 font-bold uppercase">{timePeriod}</span>
          </div>
          <div className="flex-grow space-y-3.5 pt-2">
            {topDishes.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-8">No order items sold yet</p>
            ) : (
              topDishes.map((d, idx) => {
                const maxVal = Math.max(...topDishes.map(x=>x.sales), 1);
                return (
                  <div key={idx} className="space-y-1 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span className="text-slate-700">{d.name}</span>
                      <span className="font-bold text-slate-800">{d.sales} sold</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-[#10b981] h-full rounded-full" style={{ width: `${(d.sales / maxVal) * 100}%` }}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chart Card 6: Top Categories */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 shadow-2xs flex flex-col">
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h4 className="font-bold text-sm text-slate-800">Top Category Share</h4>
            <span className="text-[10px] text-slate-400 font-bold uppercase">{timePeriod}</span>
          </div>
          <div className="flex-grow space-y-3.5 pt-2">
            {topCategoriesList.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-8">No category details found</p>
            ) : (
              topCategoriesList.map((c, idx) => {
                const maxVal = Math.max(...topCategoriesList.map(x=>x.sales), 1);
                return (
                  <div key={idx} className="space-y-1 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span className="text-slate-700">{c.name}</span>
                      <span className="font-bold text-slate-800">{c.sales} sales</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-[#10b981] h-full rounded-full" style={{ width: `${(c.sales / maxVal) * 100}%` }}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* SAP Fiori Detail Analytics Charts Panel (Row 3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chart Card 7: Peak Hours */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 shadow-2xs flex flex-col">
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h4 className="font-bold text-sm text-slate-800">Peak Demand Hours</h4>
            <span className="text-[10px] text-slate-400 font-bold uppercase">{timePeriod}</span>
          </div>
          <div className="h-48 flex items-end justify-between gap-1 pt-4">
            {peakHours.map((h, idx) => {
              const maxVal = Math.max(...peakHours.map(x=>x.count), 1);
              const heightPct = (h.count / maxVal) * 100;
              const showLabel = h.hour % 4 === 0;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div 
                    className="w-full bg-[#10b981]/20 hover:bg-[#10b981] rounded-t transition-all"
                    style={{ height: `${Math.max(5, heightPct)}%` }}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] py-0.5 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap mb-1">
                      {h.hour}:00 - {h.count} orders
                    </div>
                  </div>
                  {showLabel && <span className="text-[8px] text-slate-400 mt-1 font-bold">{h.hour}h</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart Card 8: Delivery Perf */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 shadow-2xs flex flex-col">
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h4 className="font-bold text-sm text-slate-800">Rider SLA Buckets</h4>
            <span className="text-[10px] text-slate-400 font-bold uppercase">{timePeriod}</span>
          </div>
          <div className="flex-grow space-y-3.5 pt-2">
            {Object.keys(deliveryPerformance).map((bucket, idx) => {
              const count = deliveryPerformance[bucket];
              const maxVal = Math.max(...Object.values(deliveryPerformance), 1);
              return (
                <div key={idx} className="space-y-1 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-700">{bucket}</span>
                    <span className="font-bold text-slate-800">{count} order(s)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-[#10b981] h-full rounded-full" style={{ width: `${(count / maxVal) * 100}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart Card 9: Growth */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 shadow-2xs flex flex-col">
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h4 className="font-bold text-sm text-slate-800">Consumer Growth Curve</h4>
            <span className="text-[10px] text-slate-400 font-bold uppercase">Cumulative</span>
          </div>
          <div className="h-48 flex items-end relative w-full pt-4">
            {growthTrend.length === 0 ? (
              <div className="m-auto text-xs text-slate-400 italic">No registrations logged</div>
            ) : (
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path
                  d={`M 0,100 ${growthTrend.map((g, idx) => `L ${idx * (100 / Math.max(1, growthTrend.length - 1))},${100 - (g.count / Math.max(1, runningCustomerTotal)) * 90}`).join(" ")} L 100,100 Z`}
                  fill="url(#growthGrad)"
                />
                <path
                  d={growthTrend.map((g, idx) => `${idx === 0 ? "M" : "L"} ${idx * (100 / Math.max(1, growthTrend.length - 1))},${100 - (g.count / Math.max(1, runningCustomerTotal)) * 90}`).join(" ")}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
                <defs>
                  <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
              </svg>
            )}
          </div>
          <div className="flex justify-between mt-2.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
            <span>{growthTrend[0]?.label || "Start"}</span>
            <span>{growthTrend[growthTrend.length - 1]?.label || "End"}</span>
          </div>
        </div>
      </div>

      {/* System Status Controls & Rider Queue Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Kitchen Status */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-sm mb-2">Kitchen status control</h3>
            <div className={`flex items-center justify-between p-4 border rounded-lg transition-all ${
              kitchenOnline 
                ? "bg-green-50/50 border-green-200 text-green-800"
                : "bg-amber-50/50 border-amber-200 text-amber-800"
            }`}>
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${kitchenOnline ? "bg-green-500 animate-pulse" : "bg-amber-500"}`}></span>
                <span className="text-xs font-black uppercase tracking-wider">{kitchenOnline ? "ONLINE" : "OFFLINE"}</span>
              </div>
              <button 
                onClick={toggleKitchenStatus}
                className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold shadow-2xs hover:bg-slate-50 text-slate-700 transition-colors"
              >
                {kitchenOnline ? "Go Offline" : "Go Online"}
              </button>
            </div>
          </div>
          
          <div className="border-t pt-4 mt-6">
            <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">Inventory Cockpit</h4>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-50 p-2.5 border rounded-lg">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Menu Items</span>
                <span className="font-black text-slate-800 mt-1 block">{totalMenuItems}</span>
              </div>
              <div className="bg-slate-50 p-2.5 border rounded-lg">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Categories</span>
                <span className="font-black text-slate-800 mt-1 block">{totalCategories}</span>
              </div>
              <div className="bg-slate-50 p-2.5 border rounded-lg">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Users</span>
                <span className="font-black text-slate-800 mt-1 block">{totalCustomersCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center Column: Rider queue */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 text-sm">Rider Assignment Queues</h3>
              <span className="bg-rose-50 text-rose-700 font-bold text-[10px] px-2 py-0.5 rounded-full border border-rose-200 uppercase tracking-wider">
                {ordersNeedingAssignment.length} pending
              </span>
            </div>

            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {ordersNeedingAssignment.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-10 text-center font-medium">All active kitchen orders assigned successfully.</p>
              ) : (
                ordersNeedingAssignment.map(order => (
                  <div key={order.id} className="p-3 border border-slate-100 rounded-lg bg-slate-50/50 hover:border-slate-200 transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-bold text-slate-800">Order #{order.id}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[200px] font-semibold">{order.itemsText}</p>
                      </div>
                      <button 
                        onClick={() => setAssigningOrderId(assigningOrderId === order.id ? null : order.id)} 
                        className="text-xs font-bold text-[#10b981] hover:underline"
                      >
                        {assigningOrderId === order.id ? "Cancel" : "Assign"}
                      </button>
                    </div>

                    {assigningOrderId === order.id && (
                      <div className="mt-3 pt-3 border-t border-slate-200/60 animate-fadeIn">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Online Partner:</p>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {partners.filter(p => p.isOnline && p.approved).length === 0 ? (
                            <p className="text-[10px] text-rose-600 italic">No delivery partners active online</p>
                          ) : (
                            partners.filter(p => p.isOnline && p.approved).map(p => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  handleAssignRider(order.id, p.id, p.name);
                                  setAssigningOrderId(null);
                                }}
                                className="w-full text-left px-2 py-1.5 hover:bg-[#10b981]/10 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
                              >
                                {p.name} ({p.partnerId})
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          
          <Link to="/delivery-partners" className="block text-center w-full mt-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-50 transition-colors">
            View All Partner Accounts
          </Link>
        </div>

        {/* Right Column: Shortcuts */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-sm mb-4">Quick Shortcuts</h3>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => navigate("/menu")} 
                className="p-3 border border-slate-100 rounded-lg bg-slate-50 hover:bg-[#10b981]/5 hover:border-[#10b981]/30 transition-all text-left flex flex-col justify-between h-20"
              >
                <span className="material-symbols-outlined text-[#10b981] text-[18px]">add_box</span>
                <span className="text-[11px] font-bold text-slate-700">Add Menu Item</span>
              </button>
              <button 
                onClick={() => navigate("/coupons")} 
                className="p-3 border border-slate-100 rounded-lg bg-slate-50 hover:bg-[#10b981]/5 hover:border-[#10b981]/30 transition-all text-left flex flex-col justify-between h-20"
              >
                <span className="material-symbols-outlined text-[#10b981] text-[18px]">confirmation_number</span>
                <span className="text-[11px] font-bold text-slate-700">Create Coupon</span>
              </button>
              <button 
                onClick={() => navigate("/banners")} 
                className="p-3 border border-slate-100 rounded-lg bg-slate-50 hover:bg-[#10b981]/5 hover:border-[#10b981]/30 transition-all text-left flex flex-col justify-between h-20"
              >
                <span className="material-symbols-outlined text-[#10b981] text-[18px]">ads_click</span>
                <span className="text-[11px] font-bold text-slate-700">Add Banner</span>
              </button>
              <button 
                onClick={() => navigate("/orders")} 
                className="p-3 border border-slate-100 rounded-lg bg-slate-50 hover:bg-[#10b981]/5 hover:border-[#10b981]/30 transition-all text-left flex flex-col justify-between h-20"
              >
                <span className="material-symbols-outlined text-[#10b981] text-[18px]">restaurant</span>
                <span className="text-[11px] font-bold text-slate-700">Create Spot Order</span>
              </button>
            </div>
          </div>

          <button 
            onClick={() => navigate("/delivery-partners")} 
            className="w-full mt-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-50 transition-colors"
          >
            Add Delivery Partner
          </button>
        </div>
      </div>

      {/* SAP Fiori Recent Transactions Table */}
      <div className="bg-white border border-slate-200/80 rounded-lg overflow-hidden shadow-3xs">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-[#f0f3ff]/20">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400">history</span>
            Recent Orders
          </h3>
          <Link to="/orders" className="text-[#10b981] font-bold text-xs flex items-center gap-1 hover:underline">
            View All Orders 
            <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-slate-200">
                <th className="py-3 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Order ID</th>
                <th className="py-3 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Customer</th>
                <th className="py-3 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Items Ordered</th>
                <th className="py-3 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Total Amount</th>
                <th className="py-3 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-100">
              {orders.slice(0, 5).map(o => (
                <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-6 font-bold text-[#10b981]">#{o.id}</td>
                  <td className="py-4 px-6 font-semibold">{o.customerName || o.customer}</td>
                  <td className="py-4 px-6 max-w-xs truncate" title={o.itemsText}>{o.itemsText}</td>
                  <td className="py-4 px-6 font-bold text-slate-800">₹{Number(o.total || o.totalAmount || 0).toFixed(2)}</td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] uppercase font-bold border ${
                      o.status === "Delivered" ? "bg-green-50 text-green-700 border-green-200" :
                      o.status === "Cancelled" ? "bg-red-50 text-red-700 border-red-200" :
                      "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>{o.status}</span>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan="5" className="py-12 text-center text-slate-400 italic">No order transactions logged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
