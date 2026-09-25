import React, { useState, useEffect, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { SupportTicketService } from "../services";
import { notificationRepository } from "../repositories";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";

export const CANNED_REPLIES = [
  {
    category: "Payment & Wallet",
    icon: "account_balance_wallet",
    items: [
      {
        label: "Razorpay / Bank Delay",
        text: "If your issue is not resolved kindly share the transaction screenshot and present wallet screenshot, along with your name to 8184877798 whatsapp. Due to razorpay server down, some of the payments are not credited timely.",
      },
      {
        label: "Wallet Credited",
        text: "We have verified your payment and credited the amount to your HomeBites wallet. Please check your wallet balance in the app.",
      },
      {
        label: "Refund Initiated",
        text: "We have processed a refund for this transaction. It will reflect in your source bank account / wallet within 2-4 business days.",
      },
      {
        label: "Payment Verification In Progress",
        text: "We are currently checking the transaction with our payment gateway team. We will update you shortly.",
      }
    ],
  },
  {
    category: "Delivery & Delay",
    icon: "local_shipping",
    items: [
      {
        label: "Rain / Weather Delay",
        text: "Sorry for the inconvenience you faced! Delivery is slightly delayed due to severe rain / bad weather. Our delivery partner is carefully on the way.",
      },
      {
        label: "Out for Delivery",
        text: "Your order is out for delivery! The rider has collected your meal and is on the way. You can track live location in the app.",
      },
      {
        label: "Kitchen Fresh Preparation",
        text: "Your order is being freshly prepared by the kitchen chef. We are expediting it and will dispatch it immediately once packed.",
      },
      {
        label: "On-Time Assurance Apology",
        text: "Sorry for the inconvenience you faced, next time onwards we will ensure to give you order on time.",
      }
    ],
  },
  {
    category: "Order Inquiries",
    icon: "receipt_long",
    items: [
      {
        label: "Request Order ID",
        text: "Please send your Order ID so our support team can check the order status immediately.",
      },
      {
        label: "Track in App",
        text: "You can track your order live directly from the Order Tracking tab in your HomeBites app.",
      },
      {
        label: "Missing Item Redelivery",
        text: "We apologize for the missing item. We have initiated a redelivery and our kitchen is preparing it freshly.",
      },
      {
        label: "Partial Refund for Item",
        text: "We sincerely apologize. We have credited your wallet for the missing/affected item.",
      }
    ],
  },
  {
    category: "Closure & Assistance",
    icon: "verified",
    items: [
      {
        label: "Issue Resolved",
        text: "Your issue has been resolved. Please let us know if you need any further assistance. Thank you for choosing HomeBites!",
      },
      {
        label: "WhatsApp Support Escalation",
        text: "For instant support, you can also connect with our direct operations desk on WhatsApp at 8184877798.",
      }
    ],
  },
];

const isPlaceholderName = (name) => {
  if (!name || typeof name !== "string") return true;
  const lower = name.trim().toLowerCase();
  return (
    lower === "" ||
    lower === "gourmet customer" ||
    lower === "gourmet" ||
    lower === "customer" ||
    lower === "user" ||
    lower === "guest" ||
    lower === "guest user" ||
    lower === "unknown" ||
    lower === "n/a" ||
    lower.startsWith("customer #") ||
    lower.startsWith("user #")
  );
};

const mapFirestoreTicketToUi = (ticket, usersMap = {}) => {
  const user = ticket.userId ? usersMap[ticket.userId] : null;

  // 1. Resolve Name without placeholders
  let resolvedName = ticket.customerName || ticket.userName || user?.displayName || user?.fullName || user?.name || user?.userName;
  if (!resolvedName || isPlaceholderName(resolvedName)) {
    if (user?.email && user.email.includes("@")) {
      const prefix = user.email.split("@")[0].replace(/[._0-9]/g, " ").trim();
      if (prefix.length > 2) {
        resolvedName = prefix
          .split(" ")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ");
      }
    }
  }

  // 2. Resolve Mobile Number
  let resolvedPhone =
    ticket.customerPhone ||
    ticket.userPhone ||
    ticket.phoneNumber ||
    user?.phoneNumber ||
    user?.phone ||
    user?.mobileNumber ||
    "";
  const rawDigits = String(resolvedPhone || "").replace(/\D/g, "");
  const formattedPhone =
    rawDigits.length >= 10
      ? `+91 ${rawDigits.slice(-10, -5)} ${rawDigits.slice(-5)}`
      : resolvedPhone;

  if (!resolvedName || isPlaceholderName(resolvedName)) {
    if (rawDigits.length >= 4) {
      resolvedName = `Customer (${rawDigits.slice(-4)})`;
    } else if (ticket.userId) {
      resolvedName = `Customer #${ticket.userId.substring(0, 6)}`;
    } else {
      resolvedName = "HomeBites Customer";
    }
  }

  const customerName = resolvedName;
  const customerInitials =
    customerName.startsWith("Customer (") || customerName.startsWith("Customer #") || customerName === "HomeBites Customer"
      ? "C"
      : customerName
          .split(" ")
          .filter(Boolean)
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .substring(0, 2);

  let timeStr = "Just now";
  if (ticket.createdAt) {
    if (ticket.createdAt.toDate) {
      timeStr = ticket.createdAt.toDate().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } else if (ticket.createdAt.seconds) {
      timeStr = new Date(ticket.createdAt.seconds * 1000).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } else {
      timeStr = new Date(ticket.createdAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }
  }

  const messages = [];
  if (ticket.message || ticket.description) {
    let initialTime = "";
    if (ticket.createdAt) {
      if (ticket.createdAt.toDate) {
        initialTime = ticket.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else if (ticket.createdAt.seconds) {
        initialTime = new Date(ticket.createdAt.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else {
        initialTime = new Date(ticket.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
    }
    messages.push({
      sender: customerName,
      role: "customer",
      text: ticket.message || ticket.description,
      time: initialTime
    });
  }

  (ticket.replies || []).forEach(r => {
    let msgTime = "";
    if (r.createdAt) {
      if (r.createdAt.toDate) {
        msgTime = r.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else if (r.createdAt.seconds) {
        msgTime = new Date(r.createdAt.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else {
        msgTime = new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
    }
    messages.push({
      sender: r.senderName || (r.senderRole === "Customer" ? customerName : "Support Agent"),
      role: r.senderRole?.toLowerCase() || (r.senderName === "System Alert" ? "system" : "customer"),
      text: r.message,
      time: msgTime
    });
  });

  const customerMeta = formattedPhone
    ? formattedPhone
    : (ticket.orderId ? `Order #${ticket.orderId}` : `App Customer`);

  return {
    ...ticket,
    id: ticket.id,
    title: ticket.subject || ticket.title || "Support Request",
    description: ticket.message || ticket.description || "No Message",
    status: ticket.status || "Open",
    priority: ticket.priority || "Medium",
    time: timeStr,
    customerName,
    customerPhone: resolvedPhone,
    formattedPhone,
    rawDigits,
    customerInitials,
    customerMeta,
    orderId: ticket.orderId && ticket.orderId !== "None" ? ticket.orderId : null,
    assignedTo: ticket.assignedTo || "",
    messages
  };
};

export const CustomerSupport = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const [viewMode, setViewMode] = useState("board"); // 'board' or 'list'
  const [rawTickets, setRawTickets] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);

  // Mock initial tickets matching the Stitch structure if DB call returns empty
  const defaultTickets = [
    {
      id: "HB-8842",
      title: "Missing item in delivery",
      description: "Customer reported that the Garlic Naan was missing from order #9921. Needs immediate refund or redelivery.",
      status: "Open",
      priority: "High",
      time: "10m ago",
      customerName: "Sarah Jenkins",
      customerPhone: "+91 98765 43210",
      formattedPhone: "+91 98765 43210",
      rawDigits: "9876543210",
      customerInitials: "SJ",
      customerMeta: "Phone: +91 98765 43210",
      orderId: "ORD-9921",
      assignedTo: "",
      messages: [
        { sender: "Sarah Jenkins", role: "customer", text: "Hi, I just received my order (#9921) but the two Garlic Naans are missing. The rest of the food is here but we kind of needed the bread.", time: "14:33" },
        { sender: "Auto-Reply", role: "bot", text: "We apologize for the inconvenience, Sarah. A support agent has been notified and will assist you shortly.", time: "14:33" }
      ]
    },
    {
      id: "HB-8841",
      title: "Cold Food Complaint",
      description: "Delivery took over an hour and the Butter Chicken arrived completely cold.",
      status: "Open",
      priority: "Medium",
      time: "45m ago",
      customerName: "Mike R.",
      customerPhone: "+91 98765 43211",
      formattedPhone: "+91 98765 43211",
      rawDigits: "9876543211",
      customerInitials: "MR",
      customerMeta: "Phone: +91 98765 43211",
      orderId: "ORD-9915",
      assignedTo: "",
      messages: [
        { sender: "Mike R.", role: "customer", text: "Delivery took over an hour and the Butter Chicken arrived completely cold.", time: "13:55" }
      ]
    },
    {
      id: "HB-8839",
      title: "Payment failed but deducted",
      description: "Checking with payment gateway logs for transaction tx_48291.",
      status: "In Progress",
      priority: "High",
      time: "2h ago",
      customerName: "Kevin T.",
      customerPhone: "+91 98765 43212",
      formattedPhone: "+91 98765 43212",
      rawDigits: "9876543212",
      customerInitials: "KT",
      customerMeta: "Phone: +91 98765 43212",
      orderId: "ORD-9882",
      assignedTo: "Admin A",
      messages: [
        { sender: "Kevin T.", role: "customer", text: "My card was charged Rs 450 but the app says payment failed. Please check.", time: "12:15" },
        { sender: "Admin A", role: "admin", text: "We are checking with the payment gateway. Please wait.", time: "12:30" }
      ]
    },
    {
      id: "HB-8830",
      title: "Wrong delivery address",
      description: "Delivered to wrong apartment block. Resolved with refund.",
      status: "Resolved",
      priority: "Low",
      time: "Yesterday",
      customerName: "Emma W.",
      customerPhone: "+91 98765 43213",
      formattedPhone: "+91 98765 43213",
      rawDigits: "9876543213",
      customerInitials: "EW",
      customerMeta: "Phone: +91 98765 43213",
      orderId: "ORD-9750",
      assignedTo: "Admin B",
      messages: [
        { sender: "Emma W.", role: "customer", text: "Rider dropped the package at Block C instead of Block B.", time: "Yesterday" }
      ],
      resolution: "Refunded"
    }
  ];

  const [activeCannedTab, setActiveCannedTab] = useState("all");
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const chatEndRef = useRef(null);

  // Subscribe to real-time users collection for live customer names and phone numbers
  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const map = {};
        snapshot.forEach((doc) => {
          map[doc.id] = { id: doc.id, ...doc.data() };
        });
        setUsersMap(map);
      },
      (err) => {
        console.warn("Users listener error in CustomerSupport:", err);
      }
    );
    return () => unsubUsers();
  }, []);

  // Compute live mapped tickets with resolved names and phone numbers
  const tickets = React.useMemo(() => {
    if (!rawTickets || rawTickets.length === 0) return defaultTickets;
    return rawTickets.map((t) => mapFirestoreTicketToUi(t, usersMap));
  }, [rawTickets, usersMap]);

  // Keep open ticket in drawer synchronized with real-time updates
  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find((t) => t.id === selectedTicket.id);
      if (updated) setSelectedTicket(updated);
    }
  }, [tickets]);

  useEffect(() => {
    if (drawerOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [drawerOpen, selectedTicket?.messages?.length]);

  const fetchTicketsList = async () => {
    try {
      const data = await SupportTicketService.getSupportTickets();
      if (data && data.length > 0) {
        setRawTickets(data);
        return data.map((t) => mapFirestoreTicketToUi(t, usersMap));
      } else {
        setRawTickets(defaultTickets);
        return defaultTickets;
      }
    } catch (err) {
      console.error("Error fetching tickets:", err);
      setRawTickets(defaultTickets);
      return defaultTickets;
    }
  };

  useEffect(() => {
    // Real-time Firestore onSnapshot listener for instant updates
    const colRef = collection(db, "supportTickets");
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const items = [];
          snapshot.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() });
          });
          // Sort newest tickets first
          items.sort((a, b) => {
            const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
            const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
          });
          setRawTickets(items);
          setLoading(false);
        } else {
          setRawTickets(defaultTickets);
          setLoading(false);
        }
      },
      (err) => {
        console.warn("Support tickets real-time listener error, falling back to fetch:", err);
        fetchTicketsList().finally(() => setLoading(false));
      }
    );

    return () => unsubscribe();
  }, []);

  const handleTicketClick = (ticket) => {
    setSelectedTicket(ticket);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedTicket(null);
  };

  const handleResolveTicket = async (ticketToResolve = selectedTicket, customReason = "Resolved by Admin") => {
    if (!ticketToResolve) return;
    const ticketId = ticketToResolve.id;
    const newReply = {
      senderId: user?.uid || "admin",
      senderName: user?.displayName || "Admin User",
      senderRole: "Admin",
      message: `Ticket marked as Resolved: ${customReason}.`,
      createdAt: new Date().toISOString()
    };

    try {
      const currentReplies = ticketToResolve.replies || [];
      const updatedReplies = [...currentReplies, newReply];

      await SupportTicketService.updateSupportTicket(ticketId, {
        status: "Resolved",
        resolution: customReason,
        resolvedAt: new Date().toISOString(),
        replies: updatedReplies,
        updatedAt: new Date().toISOString()
      }, user);

      // Create notification in customer's feed
      if (ticketToResolve.userId) {
        await notificationRepository.create({
          userId: ticketToResolve.userId,
          type: "support",
          title: "Ticket Resolved",
          message: `Your ticket #${ticketId.substring(0, 8)} has been marked as Resolved: ${customReason}. Thank you for reaching out to HomeBites support!`,
          isRead: false,
          referenceId: ticketId
        });
      }

      addToast(`Ticket #${ticketId.substring(0, 8)} has been marked as Resolved.`, "success");
      setSelectedTicket((prev) => (prev && prev.id === ticketId ? { ...prev, status: "Resolved", resolution: customReason } : prev));
    } catch (err) {
      console.error("Error resolving ticket:", err);
      addToast("Failed to resolve ticket: " + (err.message || ""), "error");
    }
  };

  const handleReopenTicket = async (ticketToReopen = selectedTicket) => {
    if (!ticketToReopen) return;
    const ticketId = ticketToReopen.id;
    const newReply = {
      senderId: user?.uid || "admin",
      senderName: user?.displayName || "Admin User",
      senderRole: "Admin",
      message: "Ticket reopened by Admin for further follow-up.",
      createdAt: new Date().toISOString()
    };

    try {
      const currentReplies = ticketToReopen.replies || [];
      const updatedReplies = [...currentReplies, newReply];

      await SupportTicketService.updateSupportTicket(ticketId, {
        status: "In Progress",
        resolution: null,
        replies: updatedReplies,
        updatedAt: new Date().toISOString()
      }, user);

      addToast(`Ticket #${ticketId.substring(0, 8)} reopened for assistance.`, "info");
      setSelectedTicket((prev) => (prev && prev.id === ticketId ? { ...prev, status: "In Progress", resolution: null } : prev));
    } catch (err) {
      console.error("Error reopening ticket:", err);
      addToast("Failed to reopen ticket: " + (err.message || ""), "error");
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;

    const newReply = {
      senderId: user?.uid || "admin",
      senderName: user?.displayName || "Admin User",
      senderRole: "Admin",
      message: replyText.trim(),
      createdAt: new Date().toISOString()
    };

    try {
      const freshTickets = await fetchTicketsList();
      const updatedSelected = freshTickets.find(t => t.id === selectedTicket.id);
      if (!updatedSelected) throw new Error("Ticket not found");

      const currentReplies = updatedSelected.replies || [];
      const updatedReplies = [...currentReplies, newReply];
      const newStatus = updatedSelected.status === "Open" ? "In Progress" : updatedSelected.status;

      await SupportTicketService.updateSupportTicket(selectedTicket.id, {
        replies: updatedReplies,
        status: newStatus,
        updatedAt: new Date().toISOString()
      }, user);

      // Create notification in customer's feed
      if (selectedTicket.userId) {
        await notificationRepository.create({
          userId: selectedTicket.userId,
          type: "support",
          title: "Support Reply Received",
          message: "An agent has responded to your ticket.",
          isRead: false,
          referenceId: selectedTicket.id
        });
      }

      const finalTickets = await fetchTicketsList();
      const finalSelected = finalTickets.find(t => t.id === selectedTicket.id);
      setSelectedTicket(finalSelected || null);
      
      setReplyText("");
      addToast("Reply sent successfully", "success");
    } catch (err) {
      console.error("Error sending reply:", err);
      addToast("Failed to send reply", "error");
    }
  };

  const handleQuickAction = async (actionType, details) => {
    let resolutionText = "";
    if (actionType === "refund") {
      resolutionText = "Refunded";
      addToast(`Processed partial refund of ₹375.00 for order #${selectedTicket.orderId}`, "success");
    } else if (actionType === "redeliver") {
      resolutionText = "Redelivery Scheduled";
      addToast(`Scheduled redelivery for missing items`, "success");
    } else if (actionType === "credit") {
      resolutionText = "Credited";
      addToast(`Apologized & credited customer account with ₹100.00`, "success");
    }

    const newReply = {
      senderId: "system",
      senderName: "System Alert",
      senderRole: "Support",
      message: `Action: ${resolutionText} initiated by ${user?.displayName || "Admin"}.`,
      createdAt: new Date().toISOString()
    };

    try {
      const freshTickets = await fetchTicketsList();
      const updatedSelected = freshTickets.find(t => t.id === selectedTicket.id);
      if (!updatedSelected) throw new Error("Ticket not found");

      const currentReplies = updatedSelected.replies || [];
      const updatedReplies = [...currentReplies, newReply];

      await SupportTicketService.updateSupportTicket(selectedTicket.id, {
        status: "Resolved",
        resolution: resolutionText,
        replies: updatedReplies,
        updatedAt: new Date().toISOString()
      }, user);

      // Create notification in customer's feed
      if (selectedTicket.userId) {
        await notificationRepository.create({
          userId: selectedTicket.userId,
          type: "support",
          title: "Ticket Resolved",
          message: `Your ticket has been marked as Resolved: ${resolutionText}`,
          isRead: false,
          referenceId: selectedTicket.id
        });
      }

      const finalTickets = await fetchTicketsList();
      const finalSelected = finalTickets.find(t => t.id === selectedTicket.id);
      setSelectedTicket(finalSelected || null);

      addToast(`Ticket #${selectedTicket.id} marked as Resolved`, "info");
    } catch (err) {
      console.error("Error updating ticket resolution:", err);
      addToast("Failed to update ticket", "error");
    }
  };

  if (loading) {
    return <LoadingComponents.LoadingPage />;
  }

  const openTickets = tickets.filter((t) => t.status === "Open");
  const inProgressTickets = tickets.filter((t) => t.status === "In Progress");
  const resolvedTickets = tickets.filter((t) => t.status === "Resolved");

  return (
    <div className="p-8 min-h-screen flex flex-col relative bg-[#f9f9ff]">
      {/* Header Section */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-[#151c27]">Support Queue</h2>
          <p className="font-body-md text-body-md text-[#555f6f] mt-1">Manage and resolve customer issues.</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-white rounded-lg border border-[#dce2f3] p-1 shadow-sm">
            <button
              onClick={() => setViewMode("board")}
              className={`px-4 py-1.5 rounded font-label-md text-label-md flex items-center gap-2 transition-all ${
                viewMode === "board"
                  ? "bg-[#e7eefe] text-[#151c27] shadow-sm"
                  : "text-[#555f6f] hover:bg-[#f9f9ff]"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">view_kanban</span>
              Board
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-4 py-1.5 rounded font-label-md text-label-md flex items-center gap-2 transition-all ${
                viewMode === "list"
                  ? "bg-[#e7eefe] text-[#151c27] shadow-sm"
                  : "text-[#555f6f] hover:bg-[#f9f9ff]"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">list</span>
              List
            </button>
          </div>
        </div>
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          title="No Tickets Found"
          description="Hooray! There are no customer support tickets pending."
          icon="contact_support"
        />
      ) : viewMode === "board" ? (
        /* Kanban Board */
        <div className="flex-grow flex gap-6 overflow-x-auto pb-4 items-start">
          {/* Column: Open */}
          <div className="flex-none w-80 flex flex-col bg-[#f0f3ff] rounded-xl p-4 border border-[#dce2f3]/30 min-h-[500px]">
            <div className="flex justify-between items-center mb-4 px-2">
              <h3 className="font-label-md text-label-md text-[#151c27] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#ba1a1a]"></span>
                Open
                <span className="bg-[#e7eefe] text-[#555f6f] px-2 py-0.5 rounded-full text-[10px]">{openTickets.length}</span>
              </h3>
            </div>
            <div className="flex flex-col gap-3">
              {openTickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleTicketClick(t)}
                  className="bg-white rounded-lg p-4 border border-[#dce2f3] shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-label-sm text-label-sm text-[#10b981] px-2 py-0.5 bg-[#ffdbd0] rounded font-mono">#{t.id}</span>
                    <span className="font-body-sm text-[11px] text-[#555f6f]">{t.time}</span>
                  </div>
                  <h4 className="font-label-md text-body-sm text-[#151c27] mb-1 font-semibold group-hover:text-[#10b981] transition-colors">{t.title}</h4>
                  <p className="font-body-sm text-[12px] text-[#555f6f] line-clamp-2 mb-3">{t.description}</p>
                  
                  {/* Customer Identity & Contact */}
                  <div className="flex flex-col gap-1.5 border-t border-[#dce2f3]/50 pt-2.5">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-[#d6e0f3] flex items-center justify-center text-[10px] font-bold text-[#596373] shrink-0">
                          {t.customerInitials}
                        </div>
                        <span className="font-body-sm text-[12px] font-semibold text-[#151c27] truncate">
                          {t.customerName}
                        </span>
                      </div>
                      {t.priority === "High" && (
                        <span className="material-symbols-outlined text-[16px] text-[#ba1a1a]" title="High Priority">priority_high</span>
                      )}
                    </div>
                    {t.customerPhone ? (
                      <div className="flex items-center justify-between text-[11px] text-[#555f6f] bg-slate-50 px-2 py-1 rounded border border-slate-100">
                        <span className="flex items-center gap-1 font-mono text-slate-700">
                          <span className="material-symbols-outlined text-[13px] text-emerald-600">call</span>
                          {t.formattedPhone || t.customerPhone}
                        </span>
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`tel:${t.rawDigits || t.customerPhone}`}
                            className="text-emerald-700 hover:text-emerald-800 p-0.5 transition"
                            title="Call customer"
                          >
                            <span className="material-symbols-outlined text-[14px]">call</span>
                          </a>
                          {t.rawDigits && (
                            <a
                              href={`https://wa.me/91${t.rawDigits.slice(-10)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:text-emerald-700 p-0.5 transition"
                              title="WhatsApp customer"
                            >
                              <span className="material-symbols-outlined text-[14px]">chat</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column: In Progress */}
          <div className="flex-none w-80 flex flex-col bg-[#f0f3ff] rounded-xl p-4 border border-[#dce2f3]/30 min-h-[500px]">
            <div className="flex justify-between items-center mb-4 px-2">
              <h3 className="font-label-md text-label-md text-[#151c27] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
                In Progress
                <span className="bg-[#e7eefe] text-[#555f6f] px-2 py-0.5 rounded-full text-[10px]">{inProgressTickets.length}</span>
              </h3>
            </div>
            <div className="flex flex-col gap-3">
              {inProgressTickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleTicketClick(t)}
                  className="bg-white rounded-lg p-4 border border-[#dce2f3] shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-label-sm text-label-sm text-[#10b981] px-2 py-0.5 bg-[#ffdbd0] rounded font-mono">#{t.id}</span>
                    <span className="font-body-sm text-[11px] text-[#555f6f]">{t.time}</span>
                  </div>
                  <h4 className="font-label-md text-body-sm text-[#151c27] mb-1 font-semibold group-hover:text-[#10b981] transition-colors">{t.title}</h4>
                  <p className="font-body-sm text-[12px] text-[#555f6f] line-clamp-2 mb-3">{t.description}</p>
                  
                  {/* Customer Identity & Contact */}
                  <div className="flex flex-col gap-1.5 border-t border-[#dce2f3]/50 pt-2.5">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-[#d6e0f3] flex items-center justify-center text-[10px] font-bold text-[#596373] shrink-0">
                          {t.customerInitials}
                        </div>
                        <span className="font-body-sm text-[12px] font-semibold text-[#151c27] truncate">
                          {t.customerName}
                        </span>
                      </div>
                      {t.assignedTo && (
                        <div className="w-6 h-6 rounded-full bg-[#10b981] flex items-center justify-center text-[10px] font-bold text-white border border-white" title={`Assigned to ${t.assignedTo}`}>
                          {t.assignedTo.charAt(0)}
                        </div>
                      )}
                    </div>
                    {t.customerPhone ? (
                      <div className="flex items-center justify-between text-[11px] text-[#555f6f] bg-slate-50 px-2 py-1 rounded border border-slate-100">
                        <span className="flex items-center gap-1 font-mono text-slate-700">
                          <span className="material-symbols-outlined text-[13px] text-emerald-600">call</span>
                          {t.formattedPhone || t.customerPhone}
                        </span>
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`tel:${t.rawDigits || t.customerPhone}`}
                            className="text-emerald-700 hover:text-emerald-800 p-0.5 transition"
                            title="Call customer"
                          >
                            <span className="material-symbols-outlined text-[14px]">call</span>
                          </a>
                          {t.rawDigits && (
                            <a
                              href={`https://wa.me/91${t.rawDigits.slice(-10)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:text-emerald-700 p-0.5 transition"
                              title="WhatsApp customer"
                            >
                              <span className="material-symbols-outlined text-[14px]">chat</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column: Resolved */}
          <div className="flex-none w-80 flex flex-col bg-[#f0f3ff] rounded-xl p-4 border border-[#dce2f3]/30 min-h-[500px] opacity-75">
            <div className="flex justify-between items-center mb-4 px-2">
              <h3 className="font-label-md text-label-md text-[#151c27] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#006c49]"></span>
                Resolved
                <span className="bg-[#e7eefe] text-[#555f6f] px-2 py-0.5 rounded-full text-[10px]">{resolvedTickets.length}</span>
              </h3>
            </div>
            <div className="flex flex-col gap-3">
              {resolvedTickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleTicketClick(t)}
                  className="bg-white rounded-lg p-4 border border-[#dce2f3] shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-label-sm text-label-sm text-[#555f6f] px-2 py-0.5 bg-[#dce2f3] rounded line-through font-mono">#{t.id}</span>
                    <span className="font-body-sm text-[11px] text-[#555f6f]">{t.time}</span>
                  </div>
                  <h4 className="font-label-md text-body-sm text-[#555f6f] mb-1 font-semibold line-through">{t.title}</h4>
                  <div className="flex justify-between items-center border-t border-[#dce2f3]/50 pt-2 mt-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-[#d6e0f3] flex items-center justify-center text-[9px] font-bold text-[#596373]">
                        {t.customerInitials}
                      </div>
                      <span className="text-[11px] text-[#555f6f] truncate">{t.customerName}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[#006c49]">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      <span className="font-label-sm text-[10px] font-semibold">{t.resolution || "Resolved"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* List View */
        <div className="bg-white border border-[#dce2f3] rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f0f3ff] border-b border-[#dce2f3]">
                <th className="py-3.5 px-6 font-label-md text-label-md text-[#555f6f]">Ticket ID</th>
                <th className="py-3.5 px-6 font-label-md text-label-md text-[#555f6f]">Subject</th>
                <th className="py-3.5 px-6 font-label-md text-label-md text-[#555f6f]">Customer Name</th>
                <th className="py-3.5 px-6 font-label-md text-label-md text-[#555f6f]">Mobile Number</th>
                <th className="py-3.5 px-6 font-label-md text-label-md text-[#555f6f]">Order</th>
                <th className="py-3.5 px-6 font-label-md text-label-md text-[#555f6f]">Priority</th>
                <th className="py-3.5 px-6 font-label-md text-label-md text-[#555f6f]">Status</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm text-[#151c27]">
              {tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => handleTicketClick(t)}
                  className="border-b border-[#dce2f3] hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="py-4 px-6 font-mono font-semibold text-[#10b981]">#{t.id}</td>
                  <td className="py-4 px-6 font-semibold max-w-[200px] truncate" title={t.title}>{t.title}</td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 shrink-0">
                        {t.customerInitials}
                      </div>
                      <span className="font-semibold text-slate-900">{t.customerName}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    {t.customerPhone ? (
                      <div className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="font-mono text-xs text-slate-700">{t.formattedPhone || t.customerPhone}</span>
                        <a
                          href={`tel:${t.rawDigits || t.customerPhone}`}
                          className="w-6 h-6 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center transition"
                          title="Call customer"
                        >
                          <span className="material-symbols-outlined text-[13px]">call</span>
                        </a>
                        {t.rawDigits && (
                          <a
                            href={`https://wa.me/91${t.rawDigits.slice(-10)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-6 h-6 rounded bg-green-50 hover:bg-green-100 text-green-700 flex items-center justify-center transition"
                            title="WhatsApp customer"
                          >
                            <span className="material-symbols-outlined text-[13px]">chat</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    {t.orderId ? (
                      <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        #{t.orderId}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        t.priority === "High"
                          ? "bg-[#ffdad6] text-[#93000a]"
                          : t.priority === "Medium"
                          ? "bg-[#fff8e1] text-[#5f1900]"
                          : "bg-[#e7eefe] text-[#121c2a]"
                      }`}
                    >
                      {t.priority}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span
                      className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                        t.status === "Open"
                          ? "bg-[#ffdad6] text-[#93000a]"
                          : t.status === "In Progress"
                          ? "bg-[#fff8e1] text-[#5f1900]"
                          : "bg-[#ecfdf5] text-[#006c49]"
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ticket Drawer Panel */}
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[580px] md:w-[620px] bg-slate-50 border-l border-slate-200/80 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selectedTicket && (
          <>
            {/* Drawer Header */}
            <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/70">
                    #{selectedTicket.id?.substring(0, 8)}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider flex items-center gap-1 ${
                      selectedTicket.priority === "High"
                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                        : selectedTicket.priority === "Medium"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-blue-50 text-blue-700 border border-blue-200"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        selectedTicket.priority === "High"
                          ? "bg-rose-500"
                          : selectedTicket.priority === "Medium"
                          ? "bg-amber-500"
                          : "bg-blue-500"
                      }`}
                    />
                    {selectedTicket.priority} Priority
                  </span>
                  <span
                    className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                      selectedTicket.status === "Open"
                        ? "bg-rose-100 text-rose-800"
                        : selectedTicket.status === "In Progress"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {selectedTicket.status}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate" title={selectedTicket.title}>
                  {selectedTicket.title}
                </h2>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {selectedTicket.status !== "Resolved" ? (
                  <button
                    onClick={() => handleResolveTicket(selectedTicket)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-sm transition"
                    title="Mark ticket as Resolved and close"
                  >
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    <span>Resolved</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleReopenTicket(selectedTicket)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs shadow-sm transition"
                    title="Reopen ticket for further assistance"
                  >
                    <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                    <span>Reopen</span>
                  </button>
                )}
                <button
                  className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
                  onClick={handleCloseDrawer}
                  title="Close Drawer"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>
            </div>

            {/* Customer Context Bar */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                  {selectedTicket.customerInitials || "C"}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-2">
                    <span>{selectedTicket.customerName}</span>
                  </div>
                  <div className="text-[12px] text-slate-600 flex items-center gap-2 mt-0.5">
                    {selectedTicket.customerPhone ? (
                      <span className="font-mono font-medium flex items-center gap-1 text-slate-700">
                        <span className="material-symbols-outlined text-[13px] text-emerald-600">call</span>
                        {selectedTicket.formattedPhone || selectedTicket.customerPhone}
                      </span>
                    ) : (
                      <span className="text-slate-400">No mobile recorded</span>
                    )}
                    {selectedTicket.time && <span className="text-slate-400">• {selectedTicket.time}</span>}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedTicket.customerPhone && (
                  <>
                    <a
                      href={`tel:${selectedTicket.rawDigits || selectedTicket.customerPhone}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition shadow-2xs"
                      title="Call customer directly"
                    >
                      <span className="material-symbols-outlined text-[15px]">call</span>
                      <span className="hidden sm:inline">Call</span>
                    </a>
                    {selectedTicket.rawDigits && (
                      <a
                        href={`https://wa.me/91${selectedTicket.rawDigits.slice(-10)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-xs font-semibold transition shadow-2xs"
                        title="Chat on WhatsApp"
                      >
                        <span className="material-symbols-outlined text-[15px]">chat</span>
                        <span className="hidden sm:inline">WhatsApp</span>
                      </a>
                    )}
                  </>
                )}
                {selectedTicket.orderId && selectedTicket.orderId !== "None" && (
                  <div className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-800 font-bold rounded-lg shadow-2xs text-[11px]">
                    <span className="material-symbols-outlined text-[14px] text-emerald-600">receipt_long</span>
                    Order #{selectedTicket.orderId}
                  </div>
                )}
              </div>
            </div>

            {/* Conversation History */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-slate-50/70 space-y-4">
              <div className="flex justify-center">
                <span className="bg-slate-200/60 text-slate-600 px-3 py-1 rounded-full text-[11px] font-medium shadow-2xs">
                  Ticket opened • {selectedTicket.time}
                </span>
              </div>

              {selectedTicket.messages?.map((msg, index) => {
                const isAdmin = msg.role === "admin";
                const isBot = msg.role === "bot";
                const isSystem = msg.role === "system" || msg.sender === "System Alert";

                if (isSystem) {
                  return (
                    <div key={index} className="flex justify-center my-2">
                      <div className="px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-[11px] font-medium flex items-center gap-1.5 shadow-2xs">
                        <span className="material-symbols-outlined text-[15px] text-emerald-600">verified</span>
                        <span>{msg.text}</span>
                        {msg.time && <span className="text-emerald-500 text-[10px]">• {msg.time}</span>}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={index}
                    className={`flex items-end gap-2.5 max-w-[85%] ${isAdmin ? "ml-auto flex-row-reverse" : ""}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold shadow-2xs ${
                        isAdmin
                          ? "bg-emerald-600 text-white"
                          : isBot
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-white text-slate-700 border border-slate-200"
                      }`}
                    >
                      {isBot ? (
                        <span className="material-symbols-outlined text-[14px]">smart_toy</span>
                      ) : isAdmin ? (
                        <span className="material-symbols-outlined text-[14px]">support_agent</span>
                      ) : (
                        msg.sender.split(" ").map((n) => n[0]).join("").substring(0, 2)
                      )}
                    </div>

                    <div className={`flex flex-col gap-1 ${isAdmin ? "items-end" : "items-start"}`}>
                      <div className="flex items-center gap-1.5 px-1">
                        <span className="text-[11px] font-semibold text-slate-700">
                          {isAdmin ? "Admin Support" : msg.sender}
                        </span>
                        {msg.time && (
                          <span className="text-[10px] text-slate-400">{msg.time}</span>
                        )}
                      </div>
                      <div
                        className={`p-3.5 rounded-2xl text-sm leading-relaxed shadow-xs ${
                          isAdmin
                            ? "bg-emerald-600 text-white rounded-br-xs"
                            : "bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Action Area */}
            {selectedTicket.status !== "Resolved" ? (
              <div className="border-t border-slate-200 bg-white p-3 sm:p-4 space-y-3 shadow-lg relative">
                {/* Compact Action Strip */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <button
                      type="button"
                      onClick={() => setShowTemplatesModal(!showTemplatesModal)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs border ${
                        showTemplatesModal
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200"
                      }`}
                      title="Open Pre-designed Canned Replies"
                    >
                      <span className="material-symbols-outlined text-[16px] text-amber-500">bolt</span>
                      <span>Quick Replies</span>
                      <span className="px-1.5 py-0.2 bg-emerald-200/60 text-emerald-900 text-[10px] rounded-full font-black">
                        14
                      </span>
                    </button>
                    <button
                      onClick={() => handleQuickAction("refund")}
                      className="whitespace-nowrap px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition flex items-center gap-1"
                      title="Issue Partial Refund for Order"
                    >
                      <span className="material-symbols-outlined text-[14px] text-emerald-600">payments</span>
                      <span>Refund ₹375</span>
                    </button>
                    <button
                      onClick={() => handleQuickAction("redeliver")}
                      className="whitespace-nowrap px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition flex items-center gap-1"
                      title="Schedule Redelivery"
                    >
                      <span className="material-symbols-outlined text-[14px] text-blue-600">local_shipping</span>
                      <span>Redeliver</span>
                    </button>
                    <button
                      onClick={() => handleQuickAction("credit")}
                      className="whitespace-nowrap px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition flex items-center gap-1"
                      title="Credit Customer Wallet ₹100"
                    >
                      <span className="material-symbols-outlined text-[14px] text-amber-600">wallet</span>
                      <span>Credit ₹100</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleResolveTicket(selectedTicket)}
                    className="whitespace-nowrap px-3 py-1.5 bg-emerald-50 hover:bg-emerald-600 hover:text-white border border-emerald-300 text-emerald-800 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs ml-auto"
                    title="Mark ticket resolved and notify customer"
                  >
                    <span className="material-symbols-outlined text-[15px]">check_circle</span>
                    <span>Mark Resolved</span>
                  </button>
                </div>

                {/* Quick Horizontal Single-Row Popular Chips (takes only ~28px) */}
                <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex-shrink-0 flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">auto_awesome</span> Quick:
                  </span>
                  {[
                    { label: "💳 Razorpay delay", text: "If your issue is not resolved kindly share the transaction screenshot and present wallet screenshot, along with your name to 8184877798 whatsapp. Due to razorpay server down, some of the payments are not credited timely." },
                    { label: "✅ Wallet credited", text: "We have verified your payment and credited the amount to your HomeBites wallet. Please check your wallet balance in the app." },
                    { label: "🌧️ Rain delay", text: "Sorry for the inconvenience you faced! Delivery is slightly delayed due to severe rain / bad weather. Our delivery partner is carefully on the way." },
                    { label: "🛵 Out for delivery", text: "Your order is out for delivery! The rider has collected your meal and is on the way. You can track live location in the app." },
                    { label: "📋 Request Order ID", text: "Please send your Order ID so our support team can check the order status immediately." },
                    { label: "✨ Issue resolved", text: "Your issue has been resolved. Please let us know if you need any further assistance. Thank you for choosing HomeBites!" }
                  ].map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setReplyText(chip.text)}
                      className="whitespace-nowrap px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-800 rounded-full text-[11px] font-medium transition flex-shrink-0"
                      title={chip.text}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* Quick Replies Expanded Popover / Panel */}
                {showTemplatesModal && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 shadow-md animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                        <span className="material-symbols-outlined text-amber-500 text-[16px]">quickreply</span>
                        <span>Pre-designed Canned Templates</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="flex gap-1">
                          {[
                            { id: "all", label: "All" },
                            { id: "Payment & Wallet", label: "Payment" },
                            { id: "Delivery & Delay", label: "Delivery" },
                            { id: "Order Inquiries", label: "Orders" },
                            { id: "Closure & Assistance", label: "Closure" },
                          ].map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setActiveCannedTab(tab.id)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                                activeCannedTab === tab.id
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowTemplatesModal(false)}
                          className="w-6 h-6 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 transition ml-2"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {CANNED_REPLIES.filter(
                        (cat) => activeCannedTab === "all" || cat.category === activeCannedTab
                      )
                        .flatMap((cat) => cat.items)
                        .map((item, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setReplyText(item.text);
                              setShowTemplatesModal(false);
                            }}
                            className="text-left p-2 bg-white hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-300 rounded-xl transition group shadow-2xs flex flex-col gap-0.5"
                          >
                            <div className="text-[11px] font-bold text-slate-800 group-hover:text-emerald-800 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              {item.label}
                            </div>
                            <div className="text-[10px] text-slate-500 line-clamp-1">
                              {item.text}
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {/* Modern Chat Input Box */}
                <div className="bg-slate-50 border border-slate-200 focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/15 rounded-2xl p-2.5 transition">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    className="w-full bg-transparent text-sm focus:outline-none resize-none text-slate-900 placeholder-slate-400"
                    placeholder={`Type your reply to ${selectedTicket.customerName}... (Ctrl+Enter to send)`}
                    rows="2"
                  />
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 mt-1">
                    <span className="text-[10px] text-slate-400">
                      Press <kbd className="px-1 py-0.5 bg-slate-200 rounded text-[9px] font-mono font-bold">Ctrl+Enter</kbd> to send
                    </span>
                    <button
                      onClick={handleSendReply}
                      disabled={!replyText.trim()}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs transition flex items-center gap-1.5 shadow-sm active:scale-95"
                    >
                      <span>Send</span>
                      <span className="material-symbols-outlined text-[15px]">send</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-t border-slate-200 bg-emerald-50/80 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-emerald-900">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <span className="material-symbols-outlined text-emerald-600">check_circle</span>
                  <span>Ticket is Resolved ({selectedTicket.resolution || "Resolved"})</span>
                </div>
                <button
                  onClick={() => handleReopenTicket(selectedTicket)}
                  className="px-3.5 py-1.5 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-xl text-xs font-bold transition shadow-2xs flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[15px]">restart_alt</span>
                  Reopen Ticket
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-[#151c27]/25 backdrop-blur-sm z-40"
          onClick={handleCloseDrawer}
        />
      )}
    </div>
  );
};

export default CustomerSupport;
