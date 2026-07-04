import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/firebaseConfig";

export const TopNavBar = ({ searchPlaceholder = "Search orders, menus, or customers..." }) => {
  const { sidebarCollapsed } = useUiStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Search States
  const [queryVal, setQueryVal] = useState("");
  const [results, setResults] = useState({ orders: [], menuItems: [], customers: [] });
  const [allData, setAllData] = useState({ orders: [], menuItems: [], customers: [] });

  useEffect(() => {
    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true" || !isFirebaseConfigured;
    if (isMock) {
      setAllData({
        orders: [
          { id: "HB260001", customerName: "Sarah Jenkins", customer: "Sarah Jenkins", status: "Preparing" },
          { id: "HB260002", customerName: "Michael Chen", customer: "Michael Chen", status: "Ready" }
        ],
        customers: [
          { id: "cust1", name: "Sarah Jenkins", email: "sarah@gmail.com" },
          { id: "cust2", name: "Michael Chen", email: "michael@gmail.com" }
        ],
        menuItems: [
          { id: "menu1", name: "Spicy Tuna Bowl", category: "Bowls" },
          { id: "menu2", name: "Classic Burger", category: "Burgers" }
        ]
      });
      return;
    }

    const unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isDeleted !== true) {
          list.push({
            id: docSnap.id,
            ...data,
            customerName: data.customerName || data.customer || "Walk-in Customer"
          });
        }
      });
      setAllData(prev => ({ ...prev, orders: list }));
    });

    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isDeleted !== true && (data.role === "Customer" || !data.role)) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      setAllData(prev => ({ ...prev, customers: list }));
    });

    const unsubMenu = onSnapshot(collection(db, "menuItems"), (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isDeleted !== true) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      setAllData(prev => ({ ...prev, menuItems: list }));
    });

    return () => {
      unsubOrders();
      unsubUsers();
      unsubMenu();
    };
  }, []);

  const handleSearchChange = (val) => {
    setQueryVal(val);
    if (!val.trim()) {
      setResults({ orders: [], menuItems: [], customers: [] });
      return;
    }
    const clean = val.toLowerCase().trim();
    const filteredOrders = allData.orders.filter(o => 
      o.id.toLowerCase().includes(clean) ||
      (o.customer && o.customer.toLowerCase().includes(clean)) ||
      (o.customerName && o.customerName.toLowerCase().includes(clean))
    );
    const filteredCustomers = allData.customers.filter(c => 
      c.name?.toLowerCase().includes(clean) ||
      c.email?.toLowerCase().includes(clean) ||
      c.phone?.toLowerCase().includes(clean) ||
      c.mobileNumber?.toLowerCase().includes(clean)
    );
    const filteredMenu = allData.menuItems.filter(m => 
      m.name?.toLowerCase().includes(clean) ||
      m.category?.toLowerCase().includes(clean)
    );
    setResults({ 
      orders: filteredOrders.slice(0, 5), 
      customers: filteredCustomers.slice(0, 5), 
      menuItems: filteredMenu.slice(0, 5) 
    });
  };

  return (
    <header
      className={`fixed top-0 right-0 h-16 z-40 bg-white border-b border-slate-100 flex justify-between items-center px-6 transition-all duration-300 ${
        sidebarCollapsed ? "w-[calc(100%-5rem)]" : "w-[calc(100%-16rem)]"
      }`}
    >
      {/* Search Bar */}
      <div className="flex-grow max-w-md relative flex items-center">
        <span className="material-symbols-outlined absolute left-3 text-slate-400" style={{ fontSize: "20px" }}>
          search
        </span>
        <input
          value={queryVal}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200/80 rounded-lg pl-10 pr-4 py-2 font-body-sm text-body-sm text-[#151c27] focus:outline-none focus:ring-2 focus:ring-[#10b981] focus:ring-opacity-10 focus:border-[#10b981] transition-shadow font-semibold"
          placeholder={searchPlaceholder}
          type="text"
        />

        {/* Global Search Dropdown Overlay */}
        {queryVal.trim() !== "" && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[99] p-4 max-h-[350px] overflow-y-auto font-body-sm text-[#151c27] text-xs">
            <div className="flex justify-between items-center mb-3 border-b pb-1">
              <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Search Results</span>
              <button 
                onClick={() => handleSearchChange("")} 
                className="text-[#10b981] font-bold text-[10px] hover:underline"
              >
                Clear
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Orders */}
              {results.orders.length > 0 && (
                <div>
                  <h5 className="font-black text-slate-400 mb-1.5 flex items-center gap-1 uppercase text-[9px] tracking-wider">
                    <span className="material-symbols-outlined text-[13px]">receipt_long</span> Orders
                  </h5>
                  <div className="space-y-1">
                    {results.orders.map(o => (
                      <div 
                        key={o.id} 
                        onClick={() => { navigate("/orders"); handleSearchChange(""); }}
                        className="p-2 hover:bg-[#10b981]/5 border border-slate-100 rounded-lg cursor-pointer flex justify-between items-center transition-colors font-medium"
                      >
                        <span className="font-bold text-[#10b981]">#{o.id}</span>
                        <span className="text-slate-500 font-semibold">{o.customer || o.customerName} • {o.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customers */}
              {results.customers.length > 0 && (
                <div>
                  <h5 className="font-black text-slate-400 mb-1.5 flex items-center gap-1 uppercase text-[9px] tracking-wider">
                    <span className="material-symbols-outlined text-[13px]">group</span> Customers
                  </h5>
                  <div className="space-y-1">
                    {results.customers.map(c => (
                      <div 
                        key={c.id} 
                        onClick={() => { navigate("/customers"); handleSearchChange(""); }}
                        className="p-2 hover:bg-[#10b981]/5 border border-slate-100 rounded-lg cursor-pointer flex justify-between items-center transition-colors font-medium"
                      >
                        <span className="font-bold text-slate-800">{c.name}</span>
                        <span className="text-slate-400 font-mono text-[9px]">{c.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Menu Items */}
              {results.menuItems.length > 0 && (
                <div>
                  <h5 className="font-black text-slate-400 mb-1.5 flex items-center gap-1 uppercase text-[9px] tracking-wider">
                    <span className="material-symbols-outlined text-[13px]">restaurant_menu</span> Menu Items
                  </h5>
                  <div className="space-y-1">
                    {results.menuItems.map(m => (
                      <div 
                        key={m.id} 
                        onClick={() => { navigate("/menu"); handleSearchChange(""); }}
                        className="p-2 hover:bg-[#10b981]/5 border border-slate-100 rounded-lg cursor-pointer flex justify-between items-center transition-colors font-medium"
                      >
                        <span className="font-bold text-slate-800">{m.name}</span>
                        <span className="text-slate-400 font-semibold">{m.category}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.orders.length === 0 && results.customers.length === 0 && results.menuItems.length === 0 && (
                <p className="text-center text-slate-400 italic py-4">No matching records found</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions & Profile */}
      <div className="flex items-center gap-4">
        {user?.isDevelopmentMode && (
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-[#ffdad6] text-[#93000a] border border-[#ffdad6] rounded-full text-xs font-semibold uppercase tracking-wider animate-pulse">
            <span className="material-symbols-outlined text-[14px]">bug_report</span>
            Development Mode
          </div>
        )}
        
        <button
          className="p-2 rounded-full text-slate-500 hover:bg-slate-50 transition-all hover:text-[#10b981]"
          title="Notifications"
        >
          <span className="material-symbols-outlined">notifications</span>
        </button>

        <button
          className="p-2 rounded-full text-slate-500 hover:bg-slate-50 transition-all hover:text-[#10b981]"
          title="Help"
        >
          <span className="material-symbols-outlined">help_outline</span>
        </button>

        <div className="h-8 w-px bg-slate-150 mx-2"></div>

        <div className="flex items-center gap-3 py-1.5 px-3 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-[#10b981] text-white flex items-center justify-center font-label-md font-bold uppercase">
            {user?.displayName ? user.displayName.charAt(0) : "A"}
          </div>
          <div className="flex flex-col items-start text-left">
            <span className="font-label-sm text-label-sm text-[#151c27] font-semibold">
              {user?.displayName || "Admin Profile"}
            </span>
            <span className="text-[10px] text-slate-400 font-bold tracking-wide uppercase">{user?.role || ""}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopNavBar;
