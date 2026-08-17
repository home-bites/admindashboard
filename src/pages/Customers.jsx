import React, { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, doc, updateDoc, query, orderBy, limit } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/firebaseConfig";
import { useUiStore } from "../store/uiStore";
import EmptyState from "../components/EmptyState";

/** A COD block lasts 24 hours. Same figure the backend applies on abuse. */
const COD_BLOCK_HOURS = 24;

/**
 * One date parser for the three shapes a timestamp arrives in here.
 *
 * A Cloud Function writes a Firestore Timestamp, this dashboard writes a Date,
 * and the mock path writes an ISO string. Mirrors the helper in orderStore.js
 * rather than assuming one shape — `codBlockedUntil` is now the single thing
 * that decides whether a customer may pay cash, so misreading it in one shape
 * would either free a blocked customer or hold a released one.
 */
const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val.toDate === "function") return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  if (typeof val === "number") return new Date(val);
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/**
 * Whether COD is blocked, and the sentence explaining it.
 *
 * Derived from `codBlockedUntil` alone, compared against the clock. The old
 * `codBlocked` boolean this replaces was written by the button on this page
 * and read by nothing at all — no app, no website, no rule, no function — so
 * "COD Restricted successfully" was a toast over a field nobody consulted, and
 * the customer went on paying cash.
 *
 * A timestamp compared against now cannot get stuck the way a boolean can:
 * there is no release job to fail, and nothing to leave behind if one does.
 * Past the deadline the customer is simply unblocked, everywhere, at once.
 */
const getCodBlock = (customer) => {
  const until = parseDate(customer?.codBlockedUntil);
  const abandonments = Number(customer?.codAbandonments || 0);
  const cancellations = Number(customer?.codCancellations || 0);

  if (!until) {
    return { blocked: false, until: null, reason: null, reasonText: "", remainingText: "", abandonments, cancellations };
  }

  const msLeft = until.getTime() - Date.now();
  const blocked = msLeft > 0;
  const reason = customer?.codBlockedReason || null;

  let reasonText;
  if (reason === "admin") {
    reasonText = "Blocked by support";
  } else if (reason === "abuse") {
    // The counters are reset to zero at the moment the block is applied, so
    // the next block needs three fresh quits rather than one more. That makes
    // the figure read 0 on a freshly auto-blocked customer, and quoting
    // "0 checkout abandonments" at support would be worse than saying nothing.
    reasonText = abandonments > 0
      ? `Auto-blocked: ${abandonments} checkout abandonment${abandonments === 1 ? "" : "s"}`
      : "Auto-blocked: too many abandoned COD checkouts";
  } else {
    reasonText = "Blocked (reason not recorded)";
  }

  if (!blocked) {
    return { blocked: false, until, reason, reasonText, remainingText: "released", abandonments, cancellations };
  }

  const totalMinutes = Math.floor(msLeft / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const remainingText = totalMinutes < 1
    ? "releases in under a minute"
    : hours > 0
      ? `releases in ${hours}h ${minutes}m`
      : `releases in ${minutes}m`;

  return { blocked: true, until, reason, reasonText, remainingText, abandonments, cancellations };
};

export const Customers = () => {
  const { addToast } = useUiStore();
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Layout States
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerTab, setDrawerTab] = useState("orders"); // "orders" | "addresses" | "activity"
  
  // Edit Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCodBlocked, setEditCodBlocked] = useState(false);
  // What the switch read when the modal opened. Saving only touches the COD
  // fields when the admin actually moved it — see handleSaveCustomer.
  const [editCodWasBlocked, setEditCodWasBlocked] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);

  /*
   * A block ends by the clock, not by anyone writing to the document, so no
   * snapshot arrives to re-render this page when it lapses. Without a tick the
   * badge would still read "COD Blocked · releases in 2m" forty minutes after
   * the customer got COD back — a screen support makes promises from.
   */
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true" || !isFirebaseConfigured;

    if (isMock) {
      // Mock customers cover the three COD states the real data has: never
      // blocked, blocked right now, and blocked at some point in the past and
      // since released by expiry. ISO strings on purpose — that is one of the
      // three timestamp shapes parseDate has to survive, and the mock path is
      // where it is cheapest to notice it does not.
      setCustomers([
        { id: "cust1", name: "Sarah Jenkins", email: "sarah@jenkins.com", phone: "+91 98765 43210", mobileNumber: "+91 98765 43210", createdAt: new Date().toISOString(), isActive: true, codBlockedUntil: null, codBlockedReason: null, codAbandonments: 0, codCancellations: 0, walletBalance: 250, referredBy: "Michael Chen" },
        { id: "cust2", name: "Michael Chen", email: "michael@chen.com", phone: "+91 98765 43211", mobileNumber: "+91 98765 43211", createdAt: new Date().toISOString(), isActive: true, codBlockedUntil: new Date(Date.now() + 6 * 60 * 60 * 1000 + 20 * 60 * 1000).toISOString(), codBlockedReason: "abuse", codBlockedAt: new Date(Date.now() - 17 * 60 * 60 * 1000 - 40 * 60 * 1000).toISOString(), codAbandonments: 3, codCancellations: 1, walletBalance: 0, referredBy: "" },
        { id: "cust3", name: "Emma Watson", email: "emma@watson.com", phone: "+91 98765 43212", mobileNumber: "+91 98765 43212", createdAt: new Date().toISOString(), isActive: false, codBlockedUntil: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), codBlockedReason: "admin", codBlockedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), codAbandonments: 1, codCancellations: 0, walletBalance: 1200, referredBy: "Sarah Jenkins" }
      ]);
      setOrders([
        { id: "HB260001", customerId: "cust1", itemsText: "2x Spicy Tuna Bowl, 1x Coke", totalAmount: 480, total: 480, status: "Delivered", createdAt: new Date().toISOString(), paymentMethod: "Wallet", couponCode: "WELCOME50", discountAmount: 50 },
        { id: "HB260002", customerId: "cust2", itemsText: "1x Classic Burger, 1x Fries", totalAmount: 260, total: 260, status: "Ready", createdAt: new Date().toISOString(), paymentMethod: "COD", couponCode: "", discountAmount: 0 },
        { id: "HB260003", customerId: "cust3", itemsText: "3x Avocado Toast", totalAmount: 620, total: 620, status: "Delivered", createdAt: new Date().toISOString(), paymentMethod: "Razorpay", couponCode: "SAVE100", discountAmount: 100 }
      ]);
      setAddresses([
        { id: "addr1", userId: "cust1", houseNumber: "12A", street: "Kitchener Rd", landmark: "Near park", city: "Guntur", pincode: "522001", label: "Home" },
        { id: "addr2", userId: "cust2", houseNumber: "45-B", street: "Main St", landmark: "Opp mall", city: "Guntur", pincode: "522002", label: "Work" },
        { id: "addr3", userId: "cust3", houseNumber: "78", street: "Green Avenue", landmark: "Opp temple", city: "Guntur", pincode: "522003", label: "Home" }
      ]);
      setReviews([
        { id: "rev1", customerId: "cust1", itemName: "Spicy Tuna Bowl", rating: 5, comment: "Super fresh and delicious, Chef!", createdAt: new Date().toISOString() },
        { id: "rev2", customerId: "cust3", itemName: "Avocado Toast", rating: 4, comment: "Excellent taste but slightly cold.", createdAt: new Date().toISOString() }
      ]);
      setAuditLogs([
        { id: "log1", uid: "cust1", email: "sarah@jenkins.com", action: "LOGIN", timestamp: new Date().toISOString(), loginMethod: "firebase_auth" },
        { id: "log2", uid: "cust2", email: "michael@chen.com", action: "LOGIN", timestamp: new Date().toISOString(), loginMethod: "firebase_auth" }
      ]);
      setLoading(false);
      return;
    }

    const unsubUsers = onSnapshot(query(collection(db, "users"), limit(200)), (snapshot) => {
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
      setLoading(false);
    });

    const unsubOrders = onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(200)), (snapshot) => {
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
      setOrders(list);
    });

    const unsubAddresses = onSnapshot(query(collection(db, "addresses"), limit(200)), (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          ...data
        });
      });
      setAddresses(list);
    });

    const unsubReviews = onSnapshot(query(collection(db, "reviews"), limit(200)), (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          ...data
        });
      });
      setReviews(list);
    });

    const unsubLogs = onSnapshot(query(collection(db, "auditLogs"), limit(200)), (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          ...data
        });
      });
      setAuditLogs(list);
    });

    return () => {
      unsubUsers();
      unsubOrders();
      unsubAddresses();
      unsubReviews();
      unsubLogs();
    };
  }, [addToast]);

  const formatAddress = (addr) => {
    if (!addr) return "N/A";
    const parts = [
      addr.houseNumber || addr.houseNo,
      addr.street || addr.streetName,
      addr.landmark,
      addr.city,
      addr.pincode
    ].filter(Boolean);
    return parts.length > 0 ? `${parts.join(", ")} ${addr.label ? `(${addr.label})` : ""}` : "N/A";
  };

  const handleToggleSuspend = async (customer) => {
    const newActiveState = customer.isActive === false ? true : false;
    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true" || !isFirebaseConfigured;
    
    if (isMock) {
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, isActive: newActiveState } : c));
      setSelectedCustomer(prev => prev && prev.id === customer.id ? { ...prev, isActive: newActiveState } : prev);
      addToast(newActiveState ? "Customer account activated" : "Customer account suspended", "success");
      return;
    }

    try {
      await updateDoc(doc(db, "users", customer.id), { isActive: newActiveState });
      addToast(newActiveState ? "Customer activated successfully" : "Customer suspended successfully", "success");
    } catch (err) {
      addToast(`Failed to update customer status: ${err.message}`, "error");
    }
  };

  /**
   * The write that puts a 24-hour COD block on, or takes it off now.
   *
   * Blocking writes a deadline rather than a flag, so it releases itself.
   * Releasing clears the deadline and the reason together — leaving a stale
   * `codBlockedReason` behind on a released customer would have this page
   * explaining a block that no longer exists.
   *
   * The timestamps are computed from the admin's clock rather than
   * serverTimestamp(), because serverTimestamp() cannot express "now plus 24
   * hours"; taking `codBlockedAt` from the same clock keeps the pair
   * consistent with each other, which is what support reads them as.
   */
  const codBlockPayload = (shouldBlock) => {
    if (!shouldBlock) return { codBlockedUntil: null, codBlockedReason: null };
    const now = new Date();
    return {
      codBlockedUntil: new Date(now.getTime() + COD_BLOCK_HOURS * 60 * 60 * 1000),
      codBlockedReason: "admin",
      codBlockedAt: now,
    };
  };

  const handleToggleCodBlock = async (customer) => {
    const shouldBlock = !getCodBlock(customer).blocked;
    const payload = codBlockPayload(shouldBlock);
    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true" || !isFirebaseConfigured;

    const applyLocally = () => {
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, ...payload } : c));
      setSelectedCustomer(prev => prev && prev.id === customer.id ? { ...prev, ...payload } : prev);
    };

    if (isMock) {
      applyLocally();
      addToast(shouldBlock ? `Cash on Delivery blocked for ${COD_BLOCK_HOURS} hours` : "Cash on Delivery released", "success");
      return;
    }

    try {
      await updateDoc(doc(db, "users", customer.id), payload);
      // Applied locally as well as remotely. The users listener refreshes the
      // table, but the detail drawer holds its own copy of the customer and
      // would otherwise keep describing the previous state until reopened.
      applyLocally();
      addToast(
        shouldBlock
          ? `Cash on Delivery blocked for ${COD_BLOCK_HOURS} hours`
          : "Cash on Delivery released — the customer can pay cash again now",
        "success",
      );
    } catch (err) {
      addToast(`Failed to update the COD block: ${err.message}`, "error");
    }
  };

  const handleDeleteCustomer = async (customer) => {
    if (!window.confirm(`Are you sure you want to delete customer account "${customer.name || 'Customer'}"?`)) return;
    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true" || !isFirebaseConfigured;

    if (isMock) {
      setCustomers(prev => prev.filter(c => c.id !== customer.id));
      if (selectedCustomer?.id === customer.id) setSelectedCustomer(null);
      addToast("Customer account deleted successfully (Soft Delete)", "success");
      return;
    }

    try {
      await updateDoc(doc(db, "users", customer.id), { isDeleted: true });
      addToast("Customer account deleted successfully (Soft Delete)", "success");
      if (selectedCustomer?.id === customer.id) setSelectedCustomer(null);
    } catch (err) {
      addToast(`Failed to delete customer: ${err.message}`, "error");
    }
  };

  const handleOpenEditModal = (customer) => {
    setEditCustomer(customer);
    setEditName(customer.name || "");
    setEditEmail(customer.email || "");
    setEditPhone(customer.phone || customer.mobileNumber || "");
    const codBlocked = getCodBlock(customer).blocked;
    setEditCodBlocked(codBlocked);
    setEditCodWasBlocked(codBlocked);
    setEditIsActive(customer.isActive !== false);
    setIsEditModalOpen(true);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!editName.trim()) {
      addToast("Name is required", "error");
      return;
    }
    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true" || !isFirebaseConfigured;

    const payload = {
      name: editName,
      email: editEmail,
      phone: editPhone,
      mobileNumber: editPhone,
      isActive: editIsActive,
      // The COD fields are written only when the switch actually moved.
      //
      // Writing them unconditionally would restart the 24 hours every time
      // anyone saved a phone number correction on a blocked customer — the
      // block would quietly never end, and nothing on the screen would say so.
      // The old form did not have this problem only because it wrote a boolean
      // that nothing read.
      ...(editCodBlocked !== editCodWasBlocked ? codBlockPayload(editCodBlocked) : {})
    };

    if (isMock) {
      setCustomers(prev => prev.map(c => c.id === editCustomer.id ? { ...c, ...payload } : c));
      setSelectedCustomer(prev => prev && prev.id === editCustomer.id ? { ...prev, ...payload } : prev);
      addToast("Customer updated successfully", "success");
      setIsEditModalOpen(false);
      return;
    }

    try {
      await updateDoc(doc(db, "users", editCustomer.id), payload);
      addToast("Customer details updated successfully", "success");
      setIsEditModalOpen(false);
      setSelectedCustomer(prev => prev && prev.id === editCustomer.id ? { ...prev, ...payload } : prev);
    } catch (err) {
      addToast(`Failed to update customer: ${err.message}`, "error");
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.mobileNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f9f9ff]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#10b981]"></div>
      </div>
    );
  }

  // Details calculations for selected user
  const customerOrders = selectedCustomer ? orders.filter(o => o.customerId === selectedCustomer.id) : [];
  const customerAddresses = selectedCustomer ? addresses.filter(a => a.userId === selectedCustomer.id) : [];
  const customerReviews = selectedCustomer ? reviews.filter(r => r.customerId === selectedCustomer.id) : [];
  const customerLogs = selectedCustomer ? auditLogs.filter(l => l.uid === selectedCustomer.id || l.email === selectedCustomer.email) : [];
  
  // Extract unique coupons used from orders
  const couponsUsed = Array.from(new Set(customerOrders.map(o => o.couponCode).filter(Boolean)));

  return (
    <div className="p-8 min-h-screen bg-[#f9f9ff] flex gap-6 overflow-hidden relative">
      {/* Left panel: Customers Directory */}
      <section className="flex-grow flex flex-col bg-white border border-[#dce2f3] rounded-xl shadow-xs overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#dce2f3] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#f9f9ff]">
          <div>
            <h2 className="font-headline-md text-headline-md text-[#151c27] font-bold">Customers Directory</h2>
            <p className="font-body-sm text-body-sm text-[#555f6f] mt-0.5">Audit user files, monitor shopping activities, and manage restrictions.</p>
          </div>
          <div className="relative w-full sm:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#555f6f] text-[18px]">search</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-[#d3daea] rounded-lg focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-all font-body-sm text-body-sm text-[#151c27] placeholder:text-[#555f6f]/60 outline-none"
              placeholder="Search ID, name, phone..."
              type="text"
            />
          </div>
        </div>

        {/* Directory Table */}
        <div className="flex-grow overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f0f3ff] border-b border-[#d3daea] font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider">
                <th className="py-3.5 px-6 font-bold">Customer Details</th>
                <th className="py-3.5 px-6 font-bold">Contact</th>
                <th className="py-3.5 px-6 font-bold">Billing Status</th>
                <th className="py-3.5 px-6 font-bold">COD Option</th>
                <th className="py-3.5 px-6 font-bold">Created Date</th>
                <th className="py-3.5 px-6 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm text-[#151c27] divide-y divide-[#dce2f3]/40">
              {filteredCustomers.map(c => {
                const isActive = c.isActive !== false;
                const cod = getCodBlock(c);
                const displayPhone = c.phone || c.mobileNumber || "N/A";
                
                return (
                  <tr 
                    key={c.id} 
                    onClick={() => {
                      setSelectedCustomer(c);
                      setDrawerTab("orders");
                    }}
                    className={`hover:bg-[#f0f3ff]/30 transition-colors cursor-pointer ${
                      selectedCustomer?.id === c.id ? "bg-[#10b981]/5 border-l-4 border-[#10b981]" : ""
                    }`}
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 border border-[#dce2f3] flex items-center justify-center font-bold text-xs text-[#10b981] shrink-0 shadow-inner">
                          {c.name ? c.name.split(" ").map(w => w.charAt(0)).join("").toUpperCase() : "CU"}
                        </div>
                        <div>
                          <p className="font-bold text-[#151c27]">{c.name || "Gourmet Customer"}</p>
                          <p className="text-[10px] text-slate-400 font-mono">UID: {c.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <p className="font-semibold text-slate-700">{c.email || "N/A"}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{displayPhone}</p>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        isActive 
                          ? "bg-green-50 text-green-700 border-green-200" 
                          : "bg-red-50 text-red-700 border-red-200"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-green-500" : "bg-red-500"}`}></span>
                        {isActive ? "Active Account" : "Suspended"}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        !cod.blocked
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${!cod.blocked ? "bg-emerald-500" : "bg-rose-500"}`}></span>
                        {!cod.blocked ? "COD Allowed" : "COD Blocked"}
                      </span>
                      {/* Why and for how long, on the row itself. A blocked
                          badge with no cause is the thing support cannot act
                          on: they cannot tell an automatic block that will
                          clear itself this afternoon from one a colleague
                          applied deliberately. */}
                      {cod.blocked && (
                        <p className="text-[10px] text-slate-400 font-semibold mt-1 leading-snug">
                          {cod.reasonText} · {cod.remainingText}
                        </p>
                      )}
                    </td>
                    <td className="py-4 px-6 text-slate-500">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "N/A"}
                    </td>
                    <td className="py-4 px-6 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex gap-1.5">
                        <button 
                          onClick={() => handleOpenEditModal(c)}
                          className="p-1 rounded hover:bg-[#f0f3ff] text-slate-500 hover:text-[#10b981] transition-colors"
                          title="Edit Customer"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button 
                          onClick={() => handleToggleSuspend(c)}
                          className={`p-1 rounded hover:bg-[#f0f3ff] transition-colors ${
                            isActive ? "text-slate-400 hover:text-slate-600" : "text-amber-500 hover:text-amber-600"
                          }`}
                          title={isActive ? "Suspend Customer" : "Activate Customer"}
                        >
                          <span className="material-symbols-outlined text-[18px]">block</span>
                        </button>
                        <button
                          onClick={() => handleToggleCodBlock(c)}
                          className={`p-1 rounded hover:bg-[#f0f3ff] transition-colors ${
                            cod.blocked ? "text-emerald-500 hover:text-emerald-600" : "text-slate-400 hover:text-slate-600"
                          }`}
                          title={cod.blocked
                            ? "Release the COD block now"
                            : `Block Cash on Delivery for ${COD_BLOCK_HOURS} hours`}
                        >
                          <span className="material-symbols-outlined text-[18px]">payments</span>
                        </button>
                        <button 
                          onClick={() => handleDeleteCustomer(c)}
                          className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Delete Customer"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-12 text-center">
                    <EmptyState
                      icon="group"
                      title="No Customers Found"
                      description="No records match your query. Try searching for other profiles."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Right panel: Detail Inspector Drawer */}
      {selectedCustomer && (
        <section className="w-[420px] bg-white border border-[#dce2f3] rounded-xl shadow-xs overflow-hidden flex flex-col shrink-0 animate-fade-in">
          {/* Drawer Header */}
          <div className="p-5 border-b border-[#dce2f3] bg-[#f9f9ff] flex flex-col gap-4 relative">
            <button 
              onClick={() => setSelectedCustomer(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 hover:bg-[#f0f3ff] rounded-full transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 border-2 border-white shadow flex items-center justify-center font-bold text-lg text-[#10b981] shrink-0">
                {selectedCustomer.name ? selectedCustomer.name.split(" ").map(w => w.charAt(0)).join("").toUpperCase() : "CU"}
              </div>
              <div>
                <h3 className="text-base font-bold text-[#151c27] leading-tight">{selectedCustomer.name}</h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">UID: {selectedCustomer.id}</p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-3 mt-1">
              <div className="bg-[#f0f3ff] border border-[#dce2f3]/50 rounded-lg p-2.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Wallet Balance</span>
                <span className="text-sm font-black text-[#10b981] mt-0.5 block">₹{(selectedCustomer.walletBalance || 0).toFixed(2)}</span>
              </div>
              <div className="bg-[#f0f3ff] border border-[#dce2f3]/50 rounded-lg p-2.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Orders Placed</span>
                <span className="text-sm font-black text-slate-800 mt-0.5 block">{customerOrders.length} order(s)</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-t border-[#dce2f3] pt-3 -mb-5">
              {[
                { id: "orders", label: "Orders", icon: "receipt_long" },
                { id: "addresses", label: "Addresses", icon: "location_on" },
                { id: "activity", label: "Profile Specs", icon: "badge" }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setDrawerTab(t.id)}
                  className={`flex-1 pb-2 text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 transition-all ${
                    drawerTab === t.id 
                      ? "border-[#10b981] text-[#10b981]" 
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-grow overflow-y-auto p-5 bg-[#f9f9ff]/30">
            
            {/* Orders Tab */}
            {drawerTab === "orders" && (
              <div className="space-y-3">
                {customerOrders.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-8">No order transactions found for this user.</p>
                ) : (
                  customerOrders.map(o => (
                    <div key={o.id} className="bg-white border border-[#dce2f3] rounded-xl p-3.5 shadow-xs flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-extrabold text-[#10b981]">#{o.id}</span>
                          <p className="text-[11px] text-slate-700 font-bold leading-normal mt-1 max-w-[200px] truncate" title={o.itemsText || ""}>
                            {o.itemsText || (o.items && o.items.map(i => `${i.quantity ?? i.qty ?? 1}x ${i.name}`).join(", "))}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${
                          o.status === "Delivered" ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}>{o.status}</span>
                      </div>
                      <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-[10px] text-slate-400 font-bold">
                        <span>{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : ""} • {o.paymentMethod || "Online"}</span>
                        <span className="text-slate-800 text-xs font-black">₹{o.totalAmount || o.total || 0}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Addresses Tab */}
            {drawerTab === "addresses" && (
              <div className="space-y-3">
                {customerAddresses.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-8">No saved delivery addresses found.</p>
                ) : (
                  customerAddresses.map((addr, idx) => (
                    <div key={addr.id || idx} className="bg-white border border-[#dce2f3] rounded-xl p-3.5 shadow-xs flex gap-2">
                      <span className="material-symbols-outlined text-[18px] text-[#10b981] shrink-0 mt-0.5">location_on</span>
                      <div>
                        <span className="bg-slate-100 text-slate-600 font-black text-[9px] px-1.5 py-0.5 rounded uppercase">{addr.label || "Address"}</span>
                        <p className="text-xs text-slate-700 mt-1.5 leading-relaxed font-semibold">
                          {formatAddress(addr)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Profile Specifications Tab */}
            {drawerTab === "activity" && (
              <div className="space-y-4">
                {/*
                  COD standing.
                  First card in the panel because it is the one thing on this
                  screen a customer rings up about. The two counters are shown
                  whether or not a block is active: support's question is
                  usually "why was I blocked?", and the answer is a number they
                  can be told, not a policy they have to be read.
                */}
                {(() => {
                  const cod = getCodBlock(selectedCustomer);
                  return (
                    <div className="bg-white border border-[#dce2f3] rounded-xl p-4 shadow-xs">
                      <h4 className="font-bold text-xs text-slate-700 border-b pb-2 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-[#10b981]">payments</span> Cash on Delivery
                      </h4>

                      <div className="pt-3 space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Status:</span>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            cod.blocked
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cod.blocked ? "bg-rose-500" : "bg-emerald-500"}`}></span>
                            {cod.blocked ? "Blocked" : "Allowed"}
                          </span>
                        </div>

                        {cod.blocked && (
                          <>
                            <div className="flex justify-between border-t border-slate-100 pt-2">
                              <span className="text-slate-400">Why:</span>
                              <span className="font-bold text-slate-700 text-right">{cod.reasonText}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-100 pt-2">
                              <span className="text-slate-400">Time left:</span>
                              <span className="font-bold text-slate-700">
                                {cod.remainingText} ({cod.until.toLocaleString()})
                              </span>
                            </div>
                          </>
                        )}

                        {/* A lapsed block is still worth showing. "They were
                            blocked until Tuesday and are not now" is the
                            answer to a complaint about last week. */}
                        {!cod.blocked && cod.until && (
                          <div className="flex justify-between border-t border-slate-100 pt-2">
                            <span className="text-slate-400">Previous block:</span>
                            <span className="font-bold text-slate-700 text-right">
                              {cod.reasonText}, released {cod.until.toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Read-only counters. These are server-owned — the
                          sweeper and the cancel path write them, this screen
                          only reports them. Editing them here would let an
                          admin move a customer closer to a block by hand with
                          no record of having done it. */}
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div className="bg-[#f0f3ff] border border-[#dce2f3]/50 rounded-lg p-2.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Checkout Abandonments</span>
                          <span className="text-sm font-black text-slate-800 mt-0.5 block">{cod.abandonments}</span>
                        </div>
                        <div className="bg-[#f0f3ff] border border-[#dce2f3]/50 rounded-lg p-2.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">COD Cancellations</span>
                          <span className="text-sm font-black text-slate-800 mt-0.5 block">{cod.cancellations}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleCodBlock(selectedCustomer)}
                        className={`w-full mt-3 px-3 py-2 rounded-lg font-bold text-xs transition-all border ${
                          cod.blocked
                            ? "bg-white border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981]/5"
                            : "bg-white border-rose-200 text-rose-600 hover:bg-rose-50"
                        }`}
                      >
                        {cod.blocked ? "Release COD now" : `Block COD for ${COD_BLOCK_HOURS} hours`}
                      </button>
                    </div>
                  );
                })()}

                {/* Referrals Section */}
                <div className="bg-white border border-[#dce2f3] rounded-xl p-4 shadow-xs">
                  <h4 className="font-bold text-xs text-slate-700 border-b pb-2 uppercase tracking-wide flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-[#10b981]">diversity_3</span> Referral Logs
                  </h4>
                  <div className="pt-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Referred By:</span>
                      <span className="font-bold text-slate-700">{selectedCustomer.referredBy || "Direct Join (None)"}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-2">
                      <span className="text-slate-400">Joined Date:</span>
                      <span className="font-bold text-slate-700">
                        {selectedCustomer.createdAt ? new Date(selectedCustomer.createdAt).toLocaleString() : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Promo Coupons Applied */}
                <div className="bg-white border border-[#dce2f3] rounded-xl p-4 shadow-xs">
                  <h4 className="font-bold text-xs text-slate-700 border-b pb-2 uppercase tracking-wide flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-[#10b981]">confirmation_number</span> Coupons Used
                  </h4>
                  {couponsUsed.length === 0 ? (
                    <p className="text-xs text-slate-400 italic mt-3 text-center">No promo code usages registered.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-3">
                      {couponsUsed.map(code => (
                        <span key={code} className="px-2.5 py-1 bg-[#10b981]/10 border border-[#10b981]/20 rounded-md font-bold text-[10px] text-[#10b981] uppercase">
                          {code}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Customer Food Reviews */}
                <div className="bg-white border border-[#dce2f3] rounded-xl p-4 shadow-xs">
                  <h4 className="font-bold text-xs text-slate-700 border-b pb-2 uppercase tracking-wide flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-[#10b981]">rate_review</span> Feedback Reviews
                  </h4>
                  {customerReviews.length === 0 ? (
                    <p className="text-xs text-slate-400 italic mt-3 text-center">No review logs available.</p>
                  ) : (
                    <div className="space-y-3 pt-3">
                      {customerReviews.map(rev => (
                        <div key={rev.id} className="pb-3 last:pb-0 border-b last:border-0 border-slate-100 text-xs">
                          <div className="flex justify-between items-center font-bold mb-1">
                            <span className="text-slate-800">{rev.itemName || "Menu Item"}</span>
                            <span className="text-amber-500 flex items-center font-semibold">
                              <span className="material-symbols-outlined text-[14px]">star</span>
                              {rev.rating}
                            </span>
                          </div>
                          <p className="text-slate-500 italic mt-0.5 font-medium">"{rev.comment}"</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Login Log History */}
                <div className="bg-white border border-[#dce2f3] rounded-xl p-4 shadow-xs">
                  <h4 className="font-bold text-xs text-slate-700 border-b pb-2 uppercase tracking-wide flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-[#10b981]">login</span> Security Login Logs
                  </h4>
                  {customerLogs.length === 0 ? (
                    <p className="text-xs text-slate-400 italic mt-3 text-center">No login history recorded.</p>
                  ) : (
                    <div className="space-y-2 pt-3 max-h-40 overflow-y-auto">
                      {customerLogs.map(log => (
                        <div key={log.id} className="flex justify-between items-center text-[10px] pb-1.5 border-b border-slate-100/50 last:border-0">
                          <span className="text-slate-500 font-bold">{new Date(log.timestamp).toLocaleString()}</span>
                          <span className="text-slate-400 font-mono text-[9px]">{log.loginMethod || "firebase_auth"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Edit Customer Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-[#151c27]/40 backdrop-blur-xs" onClick={() => setIsEditModalOpen(false)}></div>
          <div className="bg-white rounded-xl shadow-[0_10px_24px_rgba(0,0,0,0.08)] border border-[#dce2f3] w-full max-w-md relative z-10 flex flex-col overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-[#dce2f3] flex justify-between items-center bg-[#f9f9ff]">
              <h3 className="font-headline-sm text-headline-sm font-bold text-[#151c27]">
                Edit Customer File
              </h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-[#f0f3ff] rounded-full transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSaveCustomer} className="p-6 space-y-4">
              <div>
                <label className="block font-label-sm text-label-sm text-slate-500 uppercase tracking-wider font-semibold mb-1">
                  Customer Name
                </label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-body-sm text-body-sm text-[#151c27] transition-all font-semibold"
                  placeholder="Customer Name"
                  required
                  type="text"
                />
              </div>

              <div>
                <label className="block font-label-sm text-label-sm text-slate-500 uppercase tracking-wider font-semibold mb-1">
                  Email Address
                </label>
                <input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-body-sm text-body-sm text-[#151c27] transition-all font-semibold"
                  placeholder="Email"
                  type="email"
                />
              </div>

              <div>
                <label className="block font-label-sm text-label-sm text-slate-500 uppercase tracking-wider font-semibold mb-1">
                  Phone / Mobile Number
                </label>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-body-sm text-body-sm text-[#151c27] transition-all font-semibold"
                  placeholder="Phone"
                  type="tel"
                />
              </div>

              {/* Switches */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-label-sm text-label-sm text-[#151c27] font-bold">Block Cash on Delivery</p>
                    {/* Says what the switch actually does now. It used to say
                        "toggle to block cash payment at checkout" while
                        writing a field no checkout ever read; it now sets a
                        24-hour deadline that the app, the website and the
                        server all honour, and that expires on its own. */}
                    <p className="text-[10px] text-slate-400 font-semibold">
                      {editCodWasBlocked
                        ? "Currently blocked. Switching off releases COD immediately."
                        : `Switching on blocks COD for ${COD_BLOCK_HOURS} hours, then it releases itself.`}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      checked={editCodBlocked}
                      onChange={(e) => setEditCodBlocked(e.target.checked)}
                      className="sr-only peer"
                      type="checkbox"
                    />
                    <div className="w-10 h-5.5 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-[#10b981]"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-label-sm text-label-sm text-[#151c27] font-bold">Is Account Active</p>
                    <p className="text-[10px] text-slate-400 font-semibold">Toggle to suspend access to HomeBites services</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="sr-only peer"
                      type="checkbox"
                    />
                    <div className="w-10 h-5.5 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-[#10b981]"></div>
                  </label>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3.5">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-[#d3daea] bg-white rounded-lg text-slate-500 font-bold text-xs hover:bg-[#f0f3ff] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#10b981] hover:bg-[#059669] text-white rounded-lg font-bold text-xs transition-all shadow-sm border-t border-white/20 inner-shine"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
