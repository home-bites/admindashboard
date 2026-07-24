import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useOrderStore } from "../store/orderStore";
import { useDeliveryPartnerStore } from "../store/deliveryPartnerStore";
import { useMenuStore } from "../store/menuStore";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

export const Orders = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  
  const { 
    orders, 
    loading, 
    subscribeOrders, 
    disconnectOrders, 
    addOrder, 
    updateOrderStatus, 
    assignDeliveryPartner,
    unassignDeliveryPartner 
  } = useOrderStore();
  
  const { deliveryPartners, fetchDeliveryPartners, subscribeDeliveryPartners, disconnectDeliveryPartners } = useDeliveryPartnerStore();
  const { menuItems, fetchMenuItems } = useMenuStore();

  // Tabs: "active" (Live kitchen dashboard) or "history" (Order history directory)
  const [activeTab, setActiveTab] = useState("active");

  // Search and Advanced Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [modeFilter, setModeFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Order History specific filters
  const [histSearch, setHistSearch] = useState("");
  const [histStartDate, setHistStartDate] = useState("");
  const [histEndDate, setHistEndDate] = useState("");
  const [histStatus, setHistStatus] = useState("All");
  const [histPayment, setHistPayment] = useState("All");
  const [histMode, setHistMode] = useState("All");
  const [histRider, setHistRider] = useState("All");

  // Active views
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeMenuOrder, setActiveMenuOrder] = useState(null);
  const [activeTracking, setActiveTracking] = useState(null);
  const [selectedPartnerIdForAssign, setSelectedPartnerIdForAssign] = useState("");
  const [detailTab, setDetailTab] = useState("details"); // "details" | "kot"

  // Spot Order Form States
  const [showSpotOrderModal, setShowSpotOrderModal] = useState(false);
  const [spotCustomerName, setSpotCustomerName] = useState("Walk-in Customer");
  const [spotCustomerPhone, setSpotCustomerPhone] = useState("");
  const [spotCookingInstructions, setSpotCookingInstructions] = useState("");
  const [spotSelectedItems, setSpotSelectedItems] = useState({}); // { itemId: qty }
  const [spotSearchQuery, setSpotSearchQuery] = useState("");

  const isTakeaway = selectedOrder 
    ? (selectedOrder.address === "Counter Pickup" || (selectedOrder.deliveryAddress && selectedOrder.deliveryAddress.addressLine === "Counter Pickup"))
    : false;

  // Dynamic refresh for order elapsed time (runs every 30 seconds)
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // Inject print styles for KOT slips
  useEffect(() => {
    const style = document.createElement("style");
    style.type = "text/css";
    style.innerHTML = `
      @media print {
        body * {
          visibility: hidden !important;
        }
        #kot-print-area, #kot-print-area * {
          visibility: visible !important;
        }
        #kot-print-area {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          padding: 15px !important;
          background: white !important;
          color: black !important;
          font-family: 'Courier New', Courier, monospace !important;
          font-size: 14px !important;
          line-height: 1.4 !important;
        }
        #kot-print-area button, #kot-print-area .no-print {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    if (activeMenuOrder) {
      setSelectedPartnerIdForAssign(activeMenuOrder.assignedPartnerId || "");
    } else if (selectedOrder) {
      setSelectedPartnerIdForAssign(selectedOrder.assignedPartnerId || "");
    } else {
      setSelectedPartnerIdForAssign("");
    }
  }, [activeMenuOrder, selectedOrder]);

  useEffect(() => {
    subscribeOrders();
    return () => disconnectOrders();
  }, [subscribeOrders, disconnectOrders]);

  useEffect(() => {
    subscribeDeliveryPartners();
    return () => disconnectDeliveryPartners();
  }, [subscribeDeliveryPartners, disconnectDeliveryPartners]);

  useEffect(() => {
    fetchMenuItems();
  }, [fetchMenuItems]);

  // Real-time tracking listener
  useEffect(() => {
    if (!selectedOrder || !selectedOrder.id || !selectedOrder.assignedPartnerId) {
      setActiveTracking(null);
      return;
    }

    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
    if (isMock) {
      setActiveTracking({
        currentLatitude: 16.3067,
        currentLongitude: 80.4365,
        eta: "15 mins",
        remainingDistance: "3.2 km"
      });
      return;
    }

    const unsub = onSnapshot(
      doc(db, "orderTracking", selectedOrder.id),
      (docSnap) => {
        if (docSnap.exists()) {
          setActiveTracking(docSnap.data());
        } else {
          setActiveTracking(null);
        }
      },
      (err) => {
        console.warn("Error listening to active order tracking:", err);
      }
    );

    return () => unsub();
  }, [selectedOrder]);

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus, user);
      addToast(`Order #${orderId} status updated to ${newStatus}`, "success");
      
      setSelectedOrder((prev) => {
        if (prev && prev.id === orderId) {
          return { ...prev, status: newStatus };
        }
        return prev;
      });
      
      setActiveMenuOrder((prev) => {
        if (prev && prev.id === orderId) {
          return { ...prev, status: newStatus };
        }
        return prev;
      });
    } catch (err) {
      addToast(`Failed to update order status: ${err.message}`, "error");
    }
  };

  const handleAssignDeliveryPartner = async (orderId, partnerId, partnerName) => {
    try {
      await assignDeliveryPartner(orderId, partnerId, partnerName, user);
      addToast(`Assigned ${partnerName} to Order #${orderId}`, "success");
      
      const updatedFields = {
        assignedPartnerId: partnerId,
        assignedPartnerName: partnerName,
        rider: partnerName,
        status: "Out for Delivery"
      };

      setActiveMenuOrder((prev) => prev && prev.id === orderId ? { ...prev, ...updatedFields } : prev);
      setSelectedOrder((prev) => prev && prev.id === orderId ? { ...prev, ...updatedFields } : prev);
    } catch (err) {
      addToast(`Failed to assign delivery partner: ${err.message}`, "error");
    }
  };

  const handlePlaceSpotOrder = async (e) => {
    e.preventDefault();
    
    // Validate phone number if entered
    if (spotCustomerPhone && spotCustomerPhone.trim() !== "") {
      const cleanedPhone = spotCustomerPhone.trim();
      const reg = /^[6-9]\d{9}$/;
      if (!reg.test(cleanedPhone)) {
        addToast("Please enter a valid 10-digit Indian phone number starting with 6-9.", "error");
        return;
      }
      if (/0123456789|1234567890|9876543210|8765432109/.test(cleanedPhone) || /^(\d)\1{9}$/.test(cleanedPhone)) {
        addToast("Phone number cannot be sequential or repetitive digits.", "error");
        return;
      }
    }

    // Prepare items list
    const items = [];
    let subtotal = 0;
    
    Object.entries(spotSelectedItems).forEach(([itemId, qty]) => {
      if (qty > 0) {
        const item = menuItems.find(m => m.id === itemId);
        if (item) {
          items.push({
            name: item.name,
            qty: qty,
            price: Number(item.price),
            notes: ""
          });
          subtotal += Number(item.price) * qty;
        }
      }
    });

    if (items.length === 0) {
      addToast("Please add at least one menu item to the order.", "error");
      return;
    }

    const taxRate = 5.0; // standard 5% tax
    const tax = subtotal * (taxRate / 100);
    const platformFee = 0.00; // no platform fee for counter pickup
    const deliveryFee = 0.00;
    const total = subtotal + tax + platformFee + deliveryFee;

    const newOrder = {
      customer: spotCustomerName.trim() || "Walk-in Customer",
      phone: spotCustomerPhone.trim() || "N/A",
      itemsText: items.map(i => `${i.qty}x ${i.name}`).join(", "),
      items: items,
      subtotal: subtotal,
      tax: tax,
      deliveryFee: deliveryFee,
      total: total,
      status: "Accepted", // Directly accepted since it's a spot order placed by admin
      rider: "No Rider Required",
      address: "Counter Pickup",
      city: "Store Location",
      note: spotCookingInstructions.trim() || "",
      createdAt: new Date().toISOString()
    };

    try {
      await addOrder(newOrder, user);
      addToast("Spot food order placed successfully", "success");
      // Reset state and close modal
      setSpotCustomerName("Walk-in Customer");
      setSpotCustomerPhone("");
      setSpotCookingInstructions("");
      setSpotSelectedItems({});
      setShowSpotOrderModal(false);
    } catch (err) {
      addToast(`Failed to place spot order: ${err.message}`, "error");
    }
  };

  if (loading && orders.length === 0) {
    return <LoadingComponents.LoadingPage />;
  }

  // Calculate elapsed time and priority
  const getOrderPriority = (order) => {
    if (!order.createdAt) return { label: "Normal", color: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500" };
    
    let createdAtSeconds = 0;
    if (order.createdAt.seconds !== undefined) {
      createdAtSeconds = order.createdAt.seconds;
    } else if (order.createdAt instanceof Date) {
      createdAtSeconds = Math.floor(order.createdAt.getTime() / 1000);
    } else if (typeof order.createdAt.toDate === "function") {
      createdAtSeconds = Math.floor(order.createdAt.toDate().getTime() / 1000);
    } else if (typeof order.createdAt === "number") {
      createdAtSeconds = Math.floor(order.createdAt / 1000);
    }

    if (!createdAtSeconds) return { label: "Normal", color: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500" };
    
    const elapsedMinutes = Math.floor((Date.now() / 1000 - createdAtSeconds) / 60);
    
    if (elapsedMinutes < 5) {
      return { label: "Normal", color: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500", elapsed: elapsedMinutes };
    } else if (elapsedMinutes <= 12) {
      return { label: "Preparing Soon", color: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", elapsed: elapsedMinutes };
    } else {
      return { label: "Urgent", color: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500", elapsed: elapsedMinutes };
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "Pending":
        return "bg-rose-50 text-rose-700 border border-rose-200";
      case "Accepted":
        return "bg-amber-50 text-amber-700 border border-amber-200";
      case "Preparing":
        return "bg-blue-50 text-blue-700 border border-blue-200";
      case "Ready":
        return "bg-emerald-50 text-emerald-700 border border-emerald-200";
      case "Out for Delivery":
      case "OutForDelivery":
        return "bg-indigo-50 text-indigo-700 border border-indigo-200";
      case "Delivered":
        return "bg-gray-100 text-gray-700 border border-gray-200";
      case "Cancelled":
      default:
        return "bg-red-100 text-red-700 border border-red-200";
    }
  };

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    const matchesSearch = 
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.itemsText && o.itemsText.toLowerCase().includes(searchQuery.toLowerCase()));
      
    if (!matchesSearch) return false;
    
    // Status Filter
    if (selectedStatus !== "All") {
      const targetStatus = selectedStatus === "New Orders" ? "Pending" : selectedStatus;
      if (o.status.toLowerCase() !== targetStatus.toLowerCase()) return false;
    }

    // Payment Filter
    if (paymentFilter !== "All") {
      const isCod = o.paymentMethod?.toUpperCase() === "COD";
      if (paymentFilter === "Online" && isCod) return false;
      if (paymentFilter === "COD" && !isCod) return false;
    }

    // Delivery / Takeaway Mode Filter
    const isTakeaway = o.address === "Counter Pickup" || (o.deliveryAddress && o.deliveryAddress.addressLine === "Counter Pickup");
    if (modeFilter !== "All") {
      if (modeFilter === "Takeaway" && !isTakeaway) return false;
      if (modeFilter === "Delivery" && isTakeaway) return false;
    }

    // Date Filter
    if (dateFilter) {
      let oDate = "";
      if (o.createdAt) {
        let d = o.createdAt.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt);
        oDate = d.toISOString().split("T")[0];
      }
      if (oDate !== dateFilter) return false;
    }

    return true;
  });

  const counts = {
    All: orders.length,
    Pending: orders.filter((o) => o.status === "Pending").length,
    Preparing: orders.filter((o) => o.status === "Preparing" || o.status === "Accepted").length,
    Ready: orders.filter((o) => o.status === "Ready").length,
    "Out for Delivery": orders.filter((o) => o.status === "Out for Delivery" || o.status === "OutForDelivery").length,
    Delivered: orders.filter((o) => o.status === "Delivered").length,
    Cancelled: orders.filter((o) => o.status === "Cancelled").length,
  };

  const handlePrintKOT = (order) => {
    if (!order) return;
    const printWindow = window.open("", "_blank", "width=600,height=800");
    if (!printWindow) {
      addToast("Popup blocker prevented opening the print window", "error");
      return;
    }
    
    const itemsHtml = order.items ? order.items.map(item => `
      <tr class="item-row">
        <td class="qty">${item.qty || 1}x</td>
        <td class="desc">
          <div class="name">${item.name}</div>
          ${item.notes ? `<div class="notes">* Cooking Note: ${item.notes}</div>` : ""}
          ${item.selectedAddons && item.selectedAddons.length > 0 ? `<div class="addons">+ ${item.selectedAddons.join(", ")}</div>` : ""}
        </td>
        <td class="amt">₹${((item.price || 0) * (item.qty || 1)).toFixed(2)}</td>
      </tr>
    `).join("") : "";

    const dateStr = order.createdAt 
      ? (order.createdAt.seconds ? new Date(order.createdAt.seconds * 1000) : new Date(order.createdAt)).toLocaleString()
      : new Date().toLocaleString();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>KOT - Order #${order.id}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 76mm;
            margin: 0;
            padding: 4mm;
            font-size: 11px;
            color: #000;
            line-height: 1.4;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .header { margin-bottom: 4mm; }
          .title { font-size: 16px; font-weight: bold; margin: 0; text-transform: uppercase; }
          .subtitle { font-size: 10px; margin: 2px 0 0 0; letter-spacing: 0.5px; }
          .divider { border-top: 1px dashed #000; margin: 3mm 0; }
          .double-divider { border-top: 1px double #000; border-bottom: 1px double #000; height: 3px; margin: 3mm 0; }
          .meta-info table { width: 100%; border-collapse: collapse; }
          .meta-info td { padding: 2px 0; font-size: 10px; }
          .meta-label { font-weight: bold; width: 35%; }
          .items-table { width: 100%; border-collapse: collapse; margin-top: 2mm; }
          .items-table th { border-bottom: 1px solid #000; padding: 3px 0; font-weight: bold; text-align: left; font-size: 10px; }
          .items-table th.amt { text-align: right; }
          .item-row td { padding: 4px 0; vertical-align: top; }
          .item-row td.qty { width: 12%; font-weight: bold; }
          .item-row td.desc { width: 63%; }
          .item-row td.desc .name { font-weight: bold; }
          .item-row td.desc .notes { font-size: 9px; margin-top: 2px; font-style: italic; }
          .item-row td.desc .addons { font-size: 9px; color: #333; margin-top: 1px; }
          .item-row td.amt { width: 25%; text-align: right; font-weight: bold; }
          .totals-table { width: 100%; margin-top: 2mm; border-collapse: collapse; }
          .totals-table td { padding: 3px 0; font-size: 10px; }
          .totals-table .grand-total { font-size: 13px; font-weight: bold; border-top: 1px dashed #000; }
          .footer { margin-top: 6mm; font-size: 9px; text-align: center; }
          .star-rating { font-size: 14px; letter-spacing: 2px; margin: 1mm 0; }
          @media print { body { width: 76mm; } }
        </style>
      </head>
      <body>
        <div class="header text-center">
          <div class="title">HomeBites</div>
          <div class="subtitle">5-STAR GOURMET KITCHEN</div>
          <div class="star-rating">★★★★★</div>
          <div class="subtitle" style="font-size: 9px;">Central Operations Hub</div>
        </div>
        
        <div class="double-divider"></div>
        
        <div class="meta-info">
          <table>
            <tr>
              <td class="meta-label">ORDER ID:</td>
              <td style="font-weight: bold; font-size: 12px;">#${order.id}</td>
            </tr>
            <tr>
              <td class="meta-label">DATE/TIME:</td>
              <td>${dateStr}</td>
            </tr>
            <tr>
              <td class="meta-label">CUSTOMER:</td>
              <td>${order.customer}</td>
            </tr>
            <tr>
              <td class="meta-label">PHONE:</td>
              <td>${order.phone}</td>
            </tr>
            <tr>
              <td class="meta-label">DELIVERY:</td>
              <td>${order.address || "Counter Pickup"}</td>
            </tr>
            <tr>
              <td class="meta-label">METHOD:</td>
              <td style="font-weight: bold; text-transform: uppercase;">${order.paymentMethod || "Online"}</td>
            </tr>
          </table>
         </div>
         
         <div class="divider"></div>
         
         <table class="items-table">
           <thead>
             <tr>
               <th style="width: 12%;">QTY</th>
               <th style="width: 63%;">DESCRIPTION</th>
               <th class="amt" style="width: 25%;">AMOUNT</th>
             </tr>
           </thead>
           <tbody>
             ${itemsHtml}
           </tbody>
         </table>
         
         <div class="divider"></div>
         
         <table class="totals-table">
           <tr>
             <td>SUBTOTAL:</td>
             <td class="text-right">₹${(order.subtotal || 0).toFixed(2)}</td>
           </tr>
           <tr>
             <td>CGST & SGST (5%):</td>
             <td class="text-right">₹${(order.tax || 0).toFixed(2)}</td>
           </tr>
           <tr>
             <td>DELIVERY CHARGE:</td>
             <td class="text-right">₹${(order.deliveryFee || 0).toFixed(2)}</td>
           </tr>
           ${order.discountAmount > 0 ? `
             <tr>
               <td>DISCOUNT:</td>
               <td class="text-right">-₹${order.discountAmount.toFixed(2)}</td>
             </tr>
           ` : ""}
           <tr class="grand-total">
             <td style="padding-top: 4px; font-weight: bold;">TOTAL PAID:</td>
             <td class="text-right" style="padding-top: 4px; font-weight: bold;">₹${(order.total || 0).toFixed(2)}</td>
           </tr>
         </table>
         
         <div class="divider"></div>
         
         <div class="meta-info">
           <table>
             <tr>
               <td class="meta-label">RIDER:</td>
               <td>${order.rider || "Assigning..."}</td>
             </tr>
             <tr>
               <td class="meta-label">OTP PIN:</td>
               <td style="font-weight: bold; font-size: 12px; color: #000;">${order.verificationCode || "1234"}</td>
             </tr>
           </table>
         </div>
         
         <div class="double-divider"></div>
         
         <div class="footer">
           <div>*** CENTRAL KITCHEN COPY ***</div>
           <div style="margin-top: 1.5mm;">Gourmet Meals Cooked with Love & Hygiene.</div>
           <div style="font-weight: bold; margin-top: 1.5mm;">- Chef HomeBites -</div>
         </div>
         
         <script>
           window.onload = function() {
             window.print();
             setTimeout(function() { window.close(); }, 500);
           }
         </script>
       </body>
       </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleExportCSV = (data) => {
    const headers = ["Order ID", "Customer", "Phone", "Date/Time", "Items", "Subtotal", "Tax", "Delivery Fee", "Total", "Payment Method", "Rider", "Status"];
    const rows = data.map(o => [
      o.id,
      `"${(o.customer || "").replace(/"/g, '""')}"`,
      o.phone || "",
      o.createdAt ? (o.createdAt.seconds ? new Date(o.createdAt.seconds * 1000).toLocaleString() : new Date(o.createdAt).toLocaleString()) : "",
      `"${(o.itemsText || "").replace(/"/g, '""')}"`,
      o.subtotal || 0,
      o.tax || 0,
      o.deliveryFee || 0,
      o.total || 0,
      o.paymentMethod || "Online",
      o.rider || "N/A",
      o.status
    ]);
    
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `homebites_orders_history_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast("CSV Export downloaded successfully", "success");
  };

  const handleExportExcel = (data) => {
    const headers = ["Order ID", "Customer", "Phone", "Date/Time", "Items", "Subtotal", "Tax", "Delivery Fee", "Total", "Payment Method", "Rider", "Status"];
    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Orders Report</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          th { background-color: #10b981; color: #ffffff; font-weight: bold; border: 0.5pt solid #dce2f3; }
          td { border: 0.5pt solid #dce2f3; text-align: left; }
        </style>
      </head>
      <body>
        <table>
          <tr><th colspan="${headers.length}" style="font-size:16px;text-align:center;font-weight:bold;height:30px;background-color:#10b981;color:white;">HomeBites Order History Report</th></tr>
          <tr><td colspan="${headers.length}" style="text-align:center;font-style:italic;">Generated on ${new Date().toLocaleString()}</td></tr>
          <tr></tr>
          <tr>
            ${headers.map(h => `<th>${h}</th>`).join("")}
          </tr>
          ${data.map(o => `
            <tr>
              <td>${o.id}</td>
              <td>${o.customer}</td>
              <td>${o.phone || ""}</td>
              <td>${o.createdAt ? (o.createdAt.seconds ? new Date(o.createdAt.seconds * 1000).toLocaleString() : new Date(o.createdAt).toLocaleString()) : ""}</td>
              <td>${o.itemsText || ""}</td>
              <td>${(o.subtotal || 0).toFixed(2)}</td>
              <td>${(o.tax || 0).toFixed(2)}</td>
              <td>${(o.deliveryFee || 0).toFixed(2)}</td>
              <td>${(o.total || 0).toFixed(2)}</td>
              <td>${o.paymentMethod || "Online"}</td>
              <td>${o.rider || "N/A"}</td>
              <td>${o.status}</td>
            </tr>
          `).join("")}
        </table>
      </body>
      </html>
    `;
    
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `homebites_orders_${new Date().toISOString().slice(0,10)}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast("Excel report downloaded successfully", "success");
  };

  const handleExportPDF = (data) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      addToast("Popup blocker prevented opening PDF export", "error");
      return;
    }
    
    const rowsHtml = data.map(o => `
      <tr>
        <td>#${o.id}</td>
        <td>${o.customer}<br/><small>${o.phone || ""}</small></td>
        <td>${o.createdAt ? (o.createdAt.seconds ? new Date(o.createdAt.seconds * 1000).toLocaleString() : new Date(o.createdAt).toLocaleString()) : ""}</td>
        <td>${o.itemsText || ""}</td>
        <td style="text-align: right;">₹${(o.total || 0).toFixed(2)}</td>
        <td>${o.paymentMethod || "Online"}</td>
        <td>${o.rider || "N/A"}</td>
        <td><span style="font-weight: bold;">${o.status}</span></td>
      </tr>
    `).join("");
    
    const htmlContent = `
      <html>
      <head>
        <title>HomeBites Orders Report</title>
        <style>
          body { font-family: sans-serif; padding: 20px; color: #151c27; }
          h2 { text-align: center; color: #10b981; }
          .meta { text-align: center; font-size: 12px; margin-bottom: 20px; color: #555f6f; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
          th, td { border: 1px solid #dce2f3; padding: 8px; text-align: left; }
          th { background-color: #f0f3ff; font-weight: bold; }
          tr:nth-child(even) { background-color: #f9f9ff; }
        </style>
      </head>
      <body>
        <h2>HomeBites Order History Report</h2>
        <div class="meta">Generated on ${new Date().toLocaleString()} | Total Orders: ${data.length}</div>
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Date/Time</th>
              <th>Items</th>
              <th style="text-align: right;">Total Amount</th>
              <th>Payment</th>
              <th>Rider</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          }
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleCardPrint = (e, order) => {
    e.stopPropagation();
    handlePrintKOT(order);
  };

  const getOrderCookingInstructions = (order) => {
    const list = [];
    if (order && order.items) {
      order.items.forEach(item => {
        const note = item.notes || item.note || item.specialInstructions;
        if (note && note.trim().length > 0) {
          list.push({ itemName: item.name, note: note.trim() });
        }
      });
    }
    if (order && order.note && order.note.trim().length > 0) {
      list.push({ itemName: "General Order Note", note: order.note.trim() });
    }
    return list;
  };

  const generateSecureToken = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let token = "";
    for (let i = 0; i < 16; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  };

  const historyOrders = orders.filter((o) => {
    const matchesSearch = 
      histSearch.trim() === "" ||
      o.id.toLowerCase().includes(histSearch.toLowerCase()) ||
      (o.customer && o.customer.toLowerCase().includes(histSearch.toLowerCase())) ||
      (o.itemsText && o.itemsText.toLowerCase().includes(histSearch.toLowerCase()));
      
    let matchesDate = true;
    const oDateObj = o.createdAt 
      ? (o.createdAt.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt))
      : null;

    if (oDateObj) {
      if (histStartDate) {
        const start = new Date(histStartDate);
        start.setHours(0, 0, 0, 0);
        if (oDateObj < start) matchesDate = false;
      }
      if (histEndDate) {
        const end = new Date(histEndDate);
        end.setHours(23, 59, 59, 999);
        if (oDateObj > end) matchesDate = false;
      }
    } else if (histStartDate || histEndDate) {
      matchesDate = false;
    }
    
    let matchesStatus = true;
    if (histStatus !== "All") {
      matchesStatus = o.status.toLowerCase() === histStatus.toLowerCase();
    }
    
    let matchesPayment = true;
    if (histPayment !== "All") {
      matchesPayment = (o.paymentMethod || "Online").toUpperCase() === histPayment.toUpperCase();
    }
    
    let matchesMode = true;
    if (histMode !== "All") {
      const isTakeaway = o.address === "Counter Pickup" || (o.deliveryAddress && o.deliveryAddress.addressLine === "Counter Pickup") || o.deliveryMode === "Take Away";
      if (histMode === "Take Away" && !isTakeaway) matchesMode = false;
      if (histMode === "Delivery" && isTakeaway) matchesMode = false;
    }
    
    let matchesRider = true;
    if (histRider !== "All") {
      matchesRider = o.assignedPartnerId === histRider;
    }
    
    return matchesSearch && matchesDate && matchesStatus && matchesPayment && matchesMode && matchesRider;
  });

  return (
    <div className="p-6 flex flex-col h-full bg-[#f8fafc] overflow-y-auto">
      {/* Tab Navigation between Live active and History directory */}
      <div className="flex border-b border-slate-200 mb-6 bg-white p-1.5 rounded-xl shadow-xs border max-w-sm shrink-0">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex-grow py-2 px-4 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "active"
              ? "bg-[#10b981] text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">local_pizza</span>
          Active Operations
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-grow py-2 px-4 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "history"
              ? "bg-[#10b981] text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">history</span>
          Order History Archive
        </button>
      </div>

      {activeTab === "active" ? (
        <>
          {/* Header Panel */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Kitchen Operations Dashboard</h2>
              <p className="text-sm text-slate-500 mt-0.5">Manage live orders and monitor kitchen output in real time.</p>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 border rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${
                  showFilters 
                    ? "bg-slate-800 border-slate-800 text-white" 
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">tune</span>
                Filters {showFilters && "Active"}
              </button>
              
              <button 
                onClick={() => setShowSpotOrderModal(true)}
                className="bg-[#10b981] hover:bg-[#059669] text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Place Spot Order
              </button>
            </div>
          </div>

          {/* Advanced Filter Collapse panel */}
          {showFilters && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 animate-fadeIn">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Payment Method</label>
                <select 
                  value={paymentFilter} 
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#10b981]"
                >
                  <option value="All">All Payments</option>
                  <option value="Online">Online Payments</option>
                  <option value="COD">Cash on Delivery (COD)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Service Type</label>
                <select 
                  value={modeFilter} 
                  onChange={(e) => setModeFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#10b981]"
                >
                  <option value="All">All Types</option>
                  <option value="Delivery">Delivery orders</option>
                  <option value="Takeaway">Takeaway (Pickup)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Date</label>
                <input 
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#10b981]"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setPaymentFilter("All");
                    setModeFilter("All");
                    setDateFilter("");
                    setSearchQuery("");
                  }}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline px-2 py-1"
                >
                  Reset Advanced Filters
                </button>
              </div>
            </div>
          )}

          {/* Main Filter / Tab Bar */}
          <div className="sticky top-0 bg-[#f8fafc] z-10 pb-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-4 items-center justify-between shadow-xs">
              <div className="relative w-full md:w-80">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981] focus:bg-white transition-all text-sm text-slate-800 placeholder:text-slate-400"
                  placeholder="Search ID, Customer, Items..."
                  type="text"
                />
              </div>
              
              <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                {["All", "Pending", "Preparing", "Ready", "Out for Delivery", "Delivered", "Cancelled"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      selectedStatus === status
                        ? "bg-[#10b981] text-white shadow-xs"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {status === "Pending" ? "New Orders" : status} ({counts[status] ?? 0})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Orders Grid */}
          {filteredOrders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center">
              <EmptyState
                icon="local_pizza"
                title="No Active Orders"
                description="There are currently no orders under this status or matching filter criteria."
                actionText="Place Spot Order"
                onActionClick={() => setShowSpotOrderModal(true)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredOrders.map((order) => {
                const priority = getOrderPriority(order);
                const isTakeaway = order.address === "Counter Pickup" || (order.deliveryAddress && order.deliveryAddress.addressLine === "Counter Pickup");
                const instructionsList = getOrderCookingInstructions(order);
                
                return (
                  <div
                    key={order.id}
                    onClick={() => {
                      setSelectedOrder(order);
                      setDetailTab("details");
                    }}
                    className="bg-white border border-slate-200 rounded-xl shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden group hover:-translate-y-0.5"
                  >
                    {/* Card Header */}
                    <div className="p-4 pb-3 border-b border-slate-100">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Order ID</span>
                          <h4 className="text-sm font-black text-[#10b981]">#{order.id}</h4>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-wide ${getStatusBadgeClass(order.status)}`}>
                          {order.status}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${priority.color} flex items-center gap-1`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`}></span>
                          {priority.label} {priority.elapsed !== undefined && `(${priority.elapsed}m ago)`}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                          isTakeaway 
                            ? "bg-amber-50 text-amber-700 border-amber-200" 
                            : "bg-indigo-50 text-indigo-700 border-indigo-200"
                        }`}>
                          {isTakeaway ? "🛍️ Takeaway" : "🚚 Delivery"}
                        </span>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 py-3 flex-grow flex flex-col gap-3">
                      {/* Customer Information */}
                      <div>
                        <div className="font-bold text-sm text-slate-800 leading-snug">{order.customer}</div>
                        <div className="text-xs text-slate-500 mt-0.5 leading-none">{order.phone}</div>
                      </div>

                      {/* Items Text */}
                      <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-xs">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase mb-1">Items</span>
                        <p className="text-slate-600 font-semibold line-clamp-2 leading-relaxed">
                          {order.itemsText || (order.items && order.items.map(i => `${i.qty}x ${i.name}`).join(", "))}
                        </p>
                      </div>

                      {/* Cooking notes preview */}
                      {instructionsList.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800 font-medium">
                          <span className="text-[9px] font-bold text-amber-600 block uppercase mb-0.5 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">restaurant_menu</span>
                            Kitchen Note
                          </span>
                          <p className="truncate font-bold">{instructionsList[0].itemName}: {instructionsList[0].note}</p>
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="p-4 pt-3 border-t border-slate-100 bg-slate-50/50">
                      <div className="flex justify-between items-center text-xs text-slate-500 mb-3 font-medium">
                        <span>{order.paymentMethod?.toUpperCase()} • {order.items?.length || 0} Items</span>
                        <span className="font-bold text-slate-800 text-sm">₹{order.total.toFixed(2)}</span>
                      </div>

                      {/* Rider display if delivery */}
                      {!isTakeaway && (
                        <div className="text-[11px] font-medium text-slate-500 mb-3 flex items-center gap-1 bg-slate-100 p-1.5 rounded border border-slate-200">
                          <span className="material-symbols-outlined text-[14px]">motorcycle</span>
                          <span className="truncate">Rider: <span className="font-bold text-slate-700">{order.rider || "Assigning..."}</span></span>
                        </div>
                      )}

                      {/* Quick Action Buttons */}
                      <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleCardPrint(e, order)}
                          className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1"
                          title="Print slip"
                        >
                          <span className="material-symbols-outlined text-[16px]">print</span>
                          Print KOT
                        </button>
                        
                        {order.status === "Pending" && (
                          <button
                            onClick={() => handleUpdateStatus(order.id, "Accepted")}
                            className="bg-green-700 hover:bg-green-800 text-white text-xs py-1.5 rounded-lg font-bold transition-all"
                          >
                            Accept
                          </button>
                        )}
                        {order.status === "Accepted" && (
                          <button
                            onClick={() => handleUpdateStatus(order.id, "Preparing")}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-xs py-1.5 rounded-lg font-bold transition-all"
                          >
                            Prepare
                          </button>
                        )}
                        {order.status === "Preparing" && (
                          <button
                            onClick={() => handleUpdateStatus(order.id, "Ready")}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs py-1.5 rounded-lg font-bold transition-all"
                          >
                            Mark Ready
                          </button>
                        )}
                        {(order.status === "Ready" || order.status === "Out for Delivery" || order.status === "OutForDelivery") && (
                          <button
                            onClick={() => handleUpdateStatus(order.id, "Delivered")}
                            className="bg-[#10b981] hover:bg-[#059669] text-white text-xs py-1.5 rounded-lg font-bold transition-all"
                          >
                            Deliver
                          </button>
                        )}
                        {order.status === "Delivered" && (
                          <button
                            disabled
                            className="bg-slate-200 text-slate-400 text-xs py-1.5 rounded-lg font-bold cursor-not-allowed"
                          >
                            Delivered
                          </button>
                        )}
                        {order.status === "Cancelled" && (
                          <button
                            disabled
                            className="bg-red-50 text-red-400 border border-red-100 text-xs py-1.5 rounded-lg font-bold cursor-not-allowed"
                          >
                            Cancelled
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Order History Tab */
        <div className="flex flex-col gap-6 animate-fade-in pb-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-xl font-black text-slate-800">Order History Archives</h2>
              <p className="text-xs text-slate-500 mt-1">Audit complete operational records and export data sheets.</p>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500">Export:</span>
              <button 
                onClick={() => handleExportCSV(historyOrders)}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px] text-green-700">csv</span> CSV
              </button>
              <button 
                onClick={() => handleExportExcel(historyOrders)}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px] text-emerald-700">table_view</span> Excel
              </button>
              <button 
                onClick={() => handleExportPDF(historyOrders)}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px] text-rose-700">picture_as_pdf</span> PDF Report
              </button>
            </div>
          </div>

          {/* Detailed Filters Grid */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Search Order</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">search</span>
                <input 
                  type="text" 
                  value={histSearch}
                  onChange={(e) => setHistSearch(e.target.value)}
                  placeholder="ID, Customer, Items..."
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#10b981]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Start Date</label>
              <input 
                type="date"
                value={histStartDate}
                onChange={(e) => setHistStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#10b981]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">End Date</label>
              <input 
                type="date"
                value={histEndDate}
                onChange={(e) => setHistEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#10b981]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Order Status</label>
              <select 
                value={histStatus}
                onChange={(e) => setHistStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#10b981] font-medium"
              >
                <option value="All">All Statuses</option>
                <option value="Pending">New / Pending</option>
                <option value="Accepted">Accepted</option>
                <option value="Preparing">Preparing</option>
                <option value="Ready">Ready</option>
                <option value="Out for Delivery">Out for Delivery</option>
                <option value="Delivered">Delivered</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Payment Method</label>
              <select 
                value={histPayment}
                onChange={(e) => setHistPayment(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#10b981] font-medium"
              >
                <option value="All">All Payments</option>
                <option value="COD">Cash on Delivery (COD)</option>
                <option value="Razorpay">Razorpay Online</option>
                <option value="Wallet">Wallet Transfer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Service Mode</label>
              <select 
                value={histMode}
                onChange={(e) => setHistMode(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#10b981] font-medium"
              >
                <option value="All">All Modes</option>
                <option value="Delivery">Rider Delivery</option>
                <option value="Take Away">Take Away (Counter Pickup)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Assigned Rider</label>
              <select 
                value={histRider}
                onChange={(e) => setHistRider(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#10b981] font-medium"
              >
                <option value="All">All Riders</option>
                {deliveryPartners.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button 
                onClick={() => {
                  setHistSearch("");
                  setHistStartDate("");
                  setHistEndDate("");
                  setHistStatus("All");
                  setHistPayment("All");
                  setHistMode("All");
                  setHistRider("All");
                }}
                className="text-xs font-bold text-[#10b981] hover:underline pb-1.5"
              >
                Reset Archive Filters
              </button>
            </div>
          </div>

          {/* History Archives Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#f0f3ff] border-b border-slate-200">
                    <th className="py-3.5 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Order ID</th>
                    <th className="py-3.5 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Customer</th>
                    <th className="py-3.5 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Date & Time</th>
                    <th className="py-3.5 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Items Ordered</th>
                    <th className="py-3.5 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Total Amount</th>
                    <th className="py-3.5 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Payment</th>
                    <th className="py-3.5 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Rider</th>
                    <th className="py-3.5 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="py-3.5 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-100">
                  {historyOrders.map(o => {
                    const isTakeaway = o.address === "Counter Pickup" || (o.deliveryAddress && o.deliveryAddress.addressLine === "Counter Pickup") || o.deliveryMode === "Take Away";
                    const oDate = o.createdAt 
                      ? (o.createdAt.seconds ? new Date(o.createdAt.seconds * 1000).toLocaleString() : new Date(o.createdAt).toLocaleString())
                      : "N/A";
                    return (
                      <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6 font-extrabold text-[#10b981]">#{o.id}</td>
                        <td className="py-4 px-6 font-semibold">
                          {o.customer}
                          {o.phone && <div className="text-[10px] text-slate-400 mt-0.5">{o.phone}</div>}
                        </td>
                        <td className="py-4 px-6 text-slate-500">{oDate}</td>
                        <td className="py-4 px-6 max-w-xs truncate" title={o.itemsText}>{o.itemsText}</td>
                        <td className="py-4 px-6 font-bold text-slate-800">₹{(o.total || 0).toFixed(2)}</td>
                        <td className="py-4 px-6">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            o.paymentMethod === "COD" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                          }`}>
                            {o.paymentMethod || "Online"}
                          </span>
                        </td>
                        <td className="py-4 px-6 font-semibold text-slate-500">
                          {isTakeaway ? "🛍️ Takeaway" : (o.rider || "N/A")}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold ${getStatusBadgeClass(o.status)}`}>
                            {o.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right whitespace-nowrap space-x-2">
                          <button
                            onClick={() => {
                              setSelectedOrder(o);
                              setDetailTab("details");
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => handlePrintKOT(o)}
                            className="px-2.5 py-1 text-[11px] font-bold bg-[#10b981] hover:bg-[#059669] text-white rounded-lg transition-colors shadow-xs"
                          >
                            Print
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {historyOrders.length === 0 && (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400 italic">No archived order records found matching the filter criteria.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {historyOrders.length > 0 && (
              <div className="bg-slate-50 p-4 border-t border-slate-200 text-xs text-slate-500 font-bold">
                Total archived records matching query: {historyOrders.length}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Side Details Drawer */}
      {selectedOrder && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-slate-900/40 z-40 transition-opacity backdrop-blur-xs"
            onClick={() => setSelectedOrder(null)}
          ></div>
          
          {/* Drawer container */}
          <div className="fixed top-0 right-0 h-screen w-full md:w-[480px] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200 transition-transform duration-300">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 flex justify-between items-start bg-slate-50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-black text-slate-800">Order #{selectedOrder.id}</h3>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-wide ${getStatusBadgeClass(selectedOrder.status)}`}>
                    {selectedOrder.status}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <span className="material-symbols-outlined text-[15px]">schedule</span>
                  {selectedOrder.timestamp}
                </div>
              </div>
              
              <button
                className="text-slate-400 hover:bg-slate-100 hover:text-slate-700 p-1.5 rounded-full transition-all"
                onClick={() => setSelectedOrder(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Tab selection in Drawer */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-4">
              <button
                onClick={() => setDetailTab("details")}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  detailTab === "details"
                    ? "border-[#10b981] text-[#10b981]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">info</span>
                Customer Details
              </button>
              <button
                onClick={() => setDetailTab("kot")}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  detailTab === "kot"
                    ? "border-[#10b981] text-[#10b981]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">restaurant_menu</span>
                Kitchen Ticket (KOT)
              </button>
            </div>

            {/* Drawer Body content */}
            <div className="flex-grow overflow-y-auto p-5 bg-slate-50/50">
              {detailTab === "details" ? (
                <div className="flex flex-col gap-5">
                  {/* Cooking Instructions (Highlighted Section) */}
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 shadow-xs">
                    <h4 className="font-bold text-xs text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
                      Cooking Instructions
                    </h4>
                    {(() => {
                      const instructions = getOrderCookingInstructions(selectedOrder);
                      if (instructions.length > 0) {
                        return (
                          <div className="space-y-3 text-sm text-amber-955 font-bold">
                            {instructions.map((inst, idx) => (
                              <div key={idx}>
                                <div className="text-[10px] text-amber-800 uppercase tracking-wider font-bold">{inst.itemName}</div>
                                <div className="pl-2 mt-0.5">• {inst.note}</div>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return <div className="text-xs text-amber-700 italic">No cooking instructions provided.</div>;
                    })()}
                  </div>

                  {/* Customer Information Card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-bold shadow-inner shrink-0">
                        {selectedOrder.customer.split(" ").map(w => w.charAt(0)).join("").toUpperCase()}
                      </div>
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Customer</span>
                        <h4 className="font-bold text-slate-800 leading-tight">{selectedOrder.customer}</h4>
                        <a href={`tel:${selectedOrder.phone}`} className="text-xs text-[#10b981] hover:underline flex items-center gap-1 mt-1 font-bold">
                          <span className="material-symbols-outlined text-[14px]">phone</span>
                          {selectedOrder.phone}
                        </a>
                      </div>
                    </div>
                    <a
                      href={`tel:${selectedOrder.phone}`}
                      className="p-2 bg-slate-50 hover:bg-slate-100 text-[#10b981] rounded-lg transition-colors border border-slate-200/60"
                      title="Call Customer"
                    >
                      <span className="material-symbols-outlined text-[18px]">call</span>
                    </a>
                  </div>

                  {/* Ordered Menu Items Card */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-[#10b981]">shopping_bag</span>
                        Menu Items Ordered
                      </span>
                      <span className="bg-[#10b981]/10 text-[#10b981] text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {selectedOrder.items?.reduce((sum, item) => sum + (item.qty || 1), 0)} Qty
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {selectedOrder.items?.map((item, idx) => (
                        <div key={idx} className="p-4 flex justify-between items-start hover:bg-slate-50/50 transition-colors">
                          <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 shrink-0">
                              {item.qty}x
                            </div>
                            <div>
                              <div className="font-bold text-sm text-slate-800">{item.name}</div>
                              
                              {/* Selected Addons */}
                              {item.selectedAddons && item.selectedAddons.length > 0 && (
                                <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                  Add-ons: {item.selectedAddons.join(", ")}
                                </div>
                              )}
                              
                              {/* Item Level Instruction notes */}
                              {item.notes && (
                                <div className="text-[10px] text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded mt-1.5 w-fit">
                                  Note: "{item.notes}"
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="font-bold text-sm text-slate-800 shrink-0">
                            ₹{((item.price || 0) * (item.qty || 1)).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Financial Details Summary Card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col gap-2.5">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#10b981]">payments</span>
                      Payment Details
                    </span>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Subtotal</span>
                      <span className="font-semibold text-slate-800">₹{(selectedOrder.subtotal || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Taxes & GST (5%)</span>
                      <span className="font-semibold text-slate-800">₹{(selectedOrder.tax || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Delivery Charges</span>
                      <span className="font-semibold text-slate-800">₹{(selectedOrder.deliveryFee || 0).toFixed(2)}</span>
                    </div>
                    
                    {selectedOrder.discountAmount > 0 && (
                      <div className="flex justify-between text-xs text-green-600">
                        <span>Discount Applied ({selectedOrder.couponCode || "Coupon"})</span>
                        <span className="font-semibold">-₹{selectedOrder.discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    
                    <div className="border-t border-dashed border-slate-200 pt-3 mt-1.5 flex justify-between items-center">
                      <div>
                        <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Total Amount</span>
                        <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-2.5 py-0.5 rounded font-bold mt-1 inline-block">
                          {selectedOrder.paymentStatus?.toUpperCase() === "PAID" 
                            ? `PAID VIA ${selectedOrder.paymentMethod?.toUpperCase()}` 
                            : `PENDING - ${selectedOrder.paymentMethod?.toUpperCase()}`}
                        </span>
                      </div>
                      <span className="text-xl text-[#10b981] font-black">₹{(selectedOrder.total || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Delivery Location Address Card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col gap-3">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#10b981]">location_on</span>
                      Delivery Location
                    </span>
                    <div className="text-slate-700 font-semibold leading-relaxed text-xs">
                      {selectedOrder.address || "Counter Pickup"}
                    </div>
                    
                    {selectedOrder.deliveryAddress && selectedOrder.deliveryAddress.latitude && (
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${selectedOrder.deliveryAddress.latitude},${selectedOrder.deliveryAddress.longitude}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 mt-1"
                      >
                        <span className="material-symbols-outlined text-[16px] text-[#10b981]">map</span>
                        View on Google Maps
                      </a>
                    )}
                  </div>

                  {/* Rider Assignment Info */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col gap-3">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#10b981]">motorcycle</span>
                      Rider Assignment Details
                    </span>
                    
                    {selectedOrder.assignedPartnerId ? (
                      <div className="flex flex-col gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-xs">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Assigned Delivery Partner</span>
                            <h4 className="text-sm font-bold text-slate-800 leading-tight mt-0.5">
                              {selectedOrder.assignedPartnerName}
                            </h4>
                            <a href={`tel:${deliveryPartners.find(p => p.id === selectedOrder.assignedPartnerId)?.phone || ""}`} className="text-[11px] text-slate-500 hover:text-[#10b981] hover:underline mt-1 flex items-center gap-1 font-semibold">
                              <span className="material-symbols-outlined text-[13px]">phone</span>
                              {deliveryPartners.find(p => p.id === selectedOrder.assignedPartnerId)?.phone || "N/A"}
                            </a>
                          </div>
                          <button
                            onClick={async () => {
                              if (selectedOrder && selectedOrder.id) {
                                try {
                                  await unassignDeliveryPartner(selectedOrder.id, user);
                                  addToast(`Unassigned rider from Order #${selectedOrder.id}`, "info");
                                } catch (e) {
                                  console.warn("Unassign failed:", e.message);
                                }
                              }
                              setSelectedOrder(prev => ({
                                ...prev,
                                assignedPartnerId: null,
                                assignedPartnerName: null,
                                rider: "Assigning...",
                                assignmentStatus: "Unassigned",
                                assignmentMethod: "Unassigned"
                              }));
                            }}
                            className="text-[10px] text-rose-600 hover:underline font-bold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 hover:bg-rose-100 transition-colors shrink-0"
                          >
                            Reassign
                          </button>
                        </div>
                        <div className="border-t border-slate-200 pt-2 flex flex-col gap-1.5 text-[11px] text-slate-500 font-medium">
                          <div>
                            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Assignment Method</span>
                            <span className="font-semibold text-slate-700">
                              {selectedOrder.assignmentMethod === "SELF_ACCEPTED" || selectedOrder.assignmentMethod === "SELF_ACCEPTED_QR" || selectedOrder.assignmentMethod === "QR Claim"
                                ? `Self Accepted (${selectedOrder.assignmentMethod})`
                                : selectedOrder.assignmentMethod || "Admin Assigned"}
                            </span>
                          </div>
                          {selectedOrder.assignedAt && (
                            <div>
                              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Assigned At</span>
                              <span className="font-semibold text-slate-700">
                                {(() => {
                                  const ts = selectedOrder.assignedAt;
                                  if (typeof ts.toDate === "function") return ts.toDate().toLocaleString();
                                  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
                                  return new Date(ts).toLocaleString();
                                })()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <select
                            value={selectedPartnerIdForAssign || ""}
                            onChange={(e) => setSelectedPartnerIdForAssign(e.target.value)}
                            className="flex-grow bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] font-semibold"
                          >
                            <option value="">-- Select Partner --</option>
                            {deliveryPartners.filter(p => p.isOnline === true).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.currentStatus || "Offline"})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!selectedPartnerIdForAssign}
                            onClick={async () => {
                              const partner = deliveryPartners.find(p => p.id === selectedPartnerIdForAssign);
                              if (partner) {
                                await handleAssignDeliveryPartner(selectedOrder.id, partner.id, partner.name);
                              }
                            }}
                            className="bg-[#10b981] hover:bg-[#059669] disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs px-3.5 py-2 rounded-lg font-bold transition-all shrink-0 border border-slate-200"
                          >
                            Assign
                          </button>
                        </div>

                        {/* Order Assignment QR */}
                        {["Pending", "Accepted", "Preparing", "Ready"].includes(selectedOrder.status) && (
                          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-black text-center block">Order Assignment QR</span>
                            
                            <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-inner">
                              <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                                  JSON.stringify({ 
                                    orderId: selectedOrder.id, 
                                    orderToken: selectedOrder.orderToken || ""
                                  })
                                )}`}
                                alt="Order Assignment QR"
                                className="w-[150px] h-[150px]"
                              />
                            </div>
                            
                            <span className="text-[10px] text-slate-500 font-semibold text-center leading-normal max-w-xs">
                              Scan using the Delivery Partner App to claim this order.
                            </span>
                            
                            <div className="flex gap-2 w-full mt-1">
                              <button
                                onClick={async () => {
                                  const newToken = generateSecureToken();
                                  try {
                                    await updateDoc(doc(db, "orders", selectedOrder.id), { orderToken: newToken });
                                    setSelectedOrder(prev => ({ ...prev, orderToken: newToken }));
                                    addToast("QR Code refreshed successfully", "success");
                                  } catch (err) {
                                    addToast(`Failed to refresh QR: ${err.message}`, "error");
                                  }
                                }}
                                className="flex-grow flex items-center justify-center gap-1 text-[10px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-xs"
                              >
                                <span className="material-symbols-outlined text-[13px]">refresh</span>
                                Refresh
                              </button>
                              <button
                                onClick={() => {
                                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
                                    JSON.stringify({ 
                                      orderId: selectedOrder.id, 
                                      orderToken: selectedOrder.orderToken || ""
                                    })
                                  )}`;
                                  fetch(qrUrl)
                                    .then(res => res.blob())
                                    .then(blob => {
                                      const a = document.createElement("a");
                                      a.href = URL.createObjectURL(blob);
                                      a.download = `QR_${selectedOrder.id}.png`;
                                      document.body.appendChild(a);
                                      a.click();
                                      document.body.removeChild(a);
                                      addToast("QR Code download started", "success");
                                    })
                                    .catch(err => addToast("Failed to download QR", "error"));
                                }}
                                className="flex-grow flex items-center justify-center gap-1 text-[10px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-xs"
                              >
                                <span className="material-symbols-outlined text-[13px]">download</span>
                                Download
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Kitchen Ticket View (KOT Copy) */
                <div id="kot-print-area" className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4 shadow-sm">
                  <div className="text-center pb-3 border-b border-dashed border-slate-300">
                    <h3 className="text-xl font-black text-slate-800 tracking-wider">KITCHEN ORDER TICKET</h3>
                    <p className="text-[10px] text-slate-500 font-bold mt-1">HOMEBITES KITCHEN OPERATIONS</p>
                  </div>
                  
                  <div className="flex justify-between items-center text-xs font-semibold text-slate-600">
                    <div>
                      <div>ORDER: <span className="font-bold text-slate-800">#{selectedOrder.id}</span></div>
                      <div className="mt-0.5">DATE: {selectedOrder.timestamp}</div>
                    </div>
                    <div className="text-right">
                      <span className={`px-2.5 py-1 rounded text-xs font-black uppercase border ${
                        isTakeaway 
                          ? "bg-amber-50 text-amber-700 border-amber-200" 
                          : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}>
                        {isTakeaway ? "TAKEAWAY" : "DELIVERY"}
                      </span>
                    </div>
                  </div>

                  {/* KOT Items List */}
                  <div className="border-t border-b border-slate-200 py-3 my-1">
                    <div className="font-bold text-xs uppercase text-slate-400 tracking-wider mb-2">Items to Prepare</div>
                    <div className="space-y-3">
                      {selectedOrder.items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-start text-sm">
                          <div>
                            <div className="font-black text-slate-800 flex items-center gap-1.5">
                              <span className="bg-slate-800 text-white font-bold w-5 h-5 rounded flex items-center justify-center text-xs">{item.qty}</span>
                              <span>{item.name}</span>
                            </div>
                            {item.selectedAddons && item.selectedAddons.length > 0 && (
                              <div className="text-[11px] text-slate-500 font-bold pl-7 mt-0.5">
                                Add-ons: {item.selectedAddons.join(", ")}
                              </div>
                            )}
                            {item.notes && (
                              <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded font-bold ml-7 mt-1.5 w-fit">
                                NOTE: "{item.notes}"
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Highlighted KOT Cooking Instructions */}
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                    <div className="text-xs font-black text-amber-800 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">restaurant_menu</span>
                      KITCHEN INSTRUCTIONS / NOTES
                    </div>
                    {(() => {
                      const instructions = getOrderCookingInstructions(selectedOrder);
                      if (instructions.length > 0) {
                        return (
                          <div className="text-sm font-bold text-amber-955 space-y-3">
                            {instructions.map((inst, idx) => (
                              <div key={idx}>
                                <div className="text-[10px] text-amber-800 uppercase tracking-wider font-bold">{inst.itemName}</div>
                                <div className="pl-2 mt-0.5">• {inst.note}</div>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return <div className="text-xs text-amber-700 italic">No special instructions provided.</div>;
                    })()}
                  </div>
                  
                  {/* Print Button inside KOT tab */}
                  <div className="no-print pt-4 border-t border-dashed border-slate-200 mt-2">
                    <button
                      onClick={() => handlePrintKOT(selectedOrder)}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white py-2.5 rounded-lg font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[16px]">print</span>
                      Print KOT Slip (Thermal)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-5 border-t border-slate-200 bg-slate-50 flex flex-col gap-2.5">
              <div className="flex gap-2">
                {selectedOrder.status === "Pending" && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, "Accepted")}
                    className="flex-1 bg-green-700 hover:bg-green-800 text-white py-2.5 rounded-xl font-bold text-xs transition-colors shadow-xs"
                  >
                    Accept Order
                  </button>
                )}
                {selectedOrder.status === "Accepted" && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, "Preparing")}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-xl font-bold text-xs transition-colors shadow-xs"
                  >
                    Start Preparing
                  </button>
                )}
                {selectedOrder.status === "Preparing" && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, "Ready")}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold text-xs transition-colors shadow-xs"
                  >
                    Mark Ready
                  </button>
                )}
                {(selectedOrder.status === "Ready" || selectedOrder.status === "Out for Delivery" || selectedOrder.status === "OutForDelivery") && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, "Delivered")}
                    className="flex-1 bg-[#10b981] hover:bg-[#059669] text-white py-2.5 rounded-xl font-bold text-xs transition-colors shadow-xs"
                  >
                    Mark Delivered
                  </button>
                )}

                {selectedOrder.status !== "Delivered" && selectedOrder.status !== "Cancelled" && (
                  <button
                    onClick={() => {
                      handleUpdateStatus(selectedOrder.id, "Cancelled");
                      setSelectedOrder(null);
                    }}
                    className="bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 px-4 py-2.5 rounded-xl font-bold text-xs transition-all"
                  >
                    Cancel / Reject
                  </button>
                )}
              </div>
              
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="w-full text-slate-500 hover:bg-slate-200/50 py-2.5 rounded-xl font-bold text-xs transition-all bg-white border border-slate-200"
              >
                Close View
              </button>
            </div>
          </div>
        </>
      )}

      {/* Verification QR Modal */}
      {activeMenuOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setActiveMenuOrder(null)}></div>
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm relative z-10 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">
                Order Scan details
              </h3>
              <button
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100"
                onClick={() => setActiveMenuOrder(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 flex flex-col items-center text-center gap-4 max-h-[75vh] overflow-y-auto">
              <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-inner">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                    JSON.stringify({
                      orderId: activeMenuOrder.id
                    })
                  )}`}
                  alt="Order QR Code"
                  className="w-44 h-44 object-contain"
                />
              </div>
              
              <div className="w-full space-y-3 text-left">
                <div className="pb-2 border-b border-slate-150 flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold">Order ID</span>
                  <span className="font-black text-[#10b981]">#{activeMenuOrder.id}</span>
                </div>
                <div className="pb-2 border-b border-slate-150 text-xs">
                  <span className="block text-slate-400 font-bold mb-0.5">Customer Name</span>
                  <span className="font-bold text-slate-800">{activeMenuOrder.customer}</span>
                </div>
                <div className="pb-2 border-b border-slate-150 flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold">Customer Phone</span>
                  <span className="font-bold text-slate-800">{activeMenuOrder.phone}</span>
                </div>
                <div className="pb-2 flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold">Verification Code (OTP)</span>
                  <span className="font-bold text-green-700 bg-green-50 px-2.5 py-0.5 rounded border border-green-200">
                    {activeMenuOrder.verificationCode || "1234"}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveMenuOrder(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 bg-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showSpotOrderModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setShowSpotOrderModal(false)}></div>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl relative z-10 flex flex-col overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#10b981]">receipt_long</span>
                <h3 className="font-bold text-slate-800 text-base">
                  Place Spot Food Order (Counter POS Desk)
                </h3>
              </div>
              <button
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100"
                onClick={() => setShowSpotOrderModal(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handlePlaceSpotOrder} className="flex flex-col overflow-hidden max-h-[85vh]">
              <div className="p-6 overflow-y-auto space-y-5 flex-1">
                {/* Customer Details Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Customer Name</label>
                    <input 
                      type="text"
                      value={spotCustomerName}
                      onChange={(e) => setSpotCustomerName(e.target.value)}
                      placeholder="e.g. Walk-in Customer"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#10b981] font-medium"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Customer Phone (Optional)</label>
                    <input 
                      type="text"
                      value={spotCustomerPhone}
                      onChange={(e) => setSpotCustomerPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#10b981] font-medium"
                    />
                  </div>
                </div>

                {/* Search & Menu Item Picker */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Select Gourmet Menu Items</label>
                    <input 
                      type="text"
                      placeholder="Search menu..."
                      value={spotSearchQuery}
                      onChange={(e) => setSpotSearchQuery(e.target.value)}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 text-slate-600 focus:outline-none focus:border-[#10b981] w-48 font-medium"
                    />
                  </div>
                  
                  <div className="border border-slate-100 rounded-xl max-h-48 overflow-y-auto bg-slate-50/50 p-2 divide-y divide-slate-100">
                    {menuItems
                      .filter(item => item.isAvailable !== false && item.name.toLowerCase().includes(spotSearchQuery.toLowerCase()))
                      .map(item => {
                        const qty = spotSelectedItems[item.id] || 0;
                        return (
                          <div key={item.id} className="py-2.5 px-2 flex justify-between items-center text-sm">
                            <div className="flex-1 min-w-0 pr-4">
                              <span className="font-bold text-slate-800 block truncate">{item.name}</span>
                              <span className="text-xs text-[#10b981] font-extrabold">₹{Number(item.price).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (qty > 0) {
                                    setSpotSelectedItems(prev => ({ ...prev, [item.id]: qty - 1 }));
                                  }
                                }}
                                className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center font-bold text-slate-600 active:scale-95 transition-all"
                              >
                                -
                              </button>
                              <span className="w-6 text-center font-bold text-slate-800">{qty}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSpotSelectedItems(prev => ({ ...prev, [item.id]: qty + 1 }));
                                }}
                                className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center font-bold text-slate-600 active:scale-95 transition-all"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    {menuItems.filter(item => item.isAvailable !== false && item.name.toLowerCase().includes(spotSearchQuery.toLowerCase())).length === 0 && (
                      <div className="text-center py-6 text-xs text-slate-400 font-medium">No available items match search</div>
                    )}
                  </div>
                </div>

                {/* Cooking Instructions / Note */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Cooking / Order Instructions</label>
                  <textarea 
                    rows="2"
                    value={spotCookingInstructions}
                    onChange={(e) => setSpotCookingInstructions(e.target.value)}
                    placeholder="e.g. Extra Spicy, less oil, pack separately..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#10b981] font-medium resize-none"
                  />
                </div>

                {/* Totals Preview */}
                <div className="bg-[#10b981]/5 border border-[#10b981]/10 rounded-xl p-4 space-y-2.5">
                  <div className="flex justify-between items-center text-xs text-slate-500 font-bold">
                    <span>Selected Items</span>
                    <span className="text-slate-800">
                      {Object.values(spotSelectedItems).reduce((a, b) => a + b, 0)} item(s)
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500 font-bold">
                    <span>Subtotal</span>
                    <span className="text-slate-800 font-extrabold">
                      ₹{Object.entries(spotSelectedItems).reduce((sum, [itemId, qty]) => {
                        const item = menuItems.find(m => m.id === itemId);
                        return sum + (item ? Number(item.price) * qty : 0);
                      }, 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500 font-bold">
                    <span>GST & Taxes (5%)</span>
                    <span className="text-slate-800">
                      ₹{(Object.entries(spotSelectedItems).reduce((sum, [itemId, qty]) => {
                        const item = menuItems.find(m => m.id === itemId);
                        return sum + (item ? Number(item.price) * qty : 0);
                      }, 0) * 0.05).toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t border-[#10b981]/10 pt-2.5 flex justify-between items-center">
                    <span className="text-sm font-black text-slate-700">Total Payable</span>
                    <span className="text-lg font-black text-[#10b981]">
                      ₹{(Object.entries(spotSelectedItems).reduce((sum, [itemId, qty]) => {
                        const item = menuItems.find(m => m.id === itemId);
                        return sum + (item ? Number(item.price) * qty : 0);
                      }, 0) * 1.05).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-[#f1f5f9] bg-slate-50 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowSpotOrderModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 bg-white active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#10b981] hover:bg-[#059669] rounded-lg active:scale-95 transition-all shadow-sm"
                >
                  Place Spot Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
