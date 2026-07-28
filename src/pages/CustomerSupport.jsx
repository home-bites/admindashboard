import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { SupportTicketService } from "../services";
import { notificationRepository } from "../repositories";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";

const mapFirestoreTicketToUi = (ticket) => {
  const customerName = ticket.customerName || (ticket.userId ? `User #${ticket.userId.substring(0, 6)}` : 'Customer');
  const customerInitials = customerName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  let timeStr = "Just now";
  if (ticket.createdAt) {
    if (ticket.createdAt.toDate) {
      timeStr = ticket.createdAt.toDate().toLocaleDateString();
    } else if (ticket.createdAt.seconds) {
      timeStr = new Date(ticket.createdAt.seconds * 1000).toLocaleDateString();
    } else {
      timeStr = new Date(ticket.createdAt).toLocaleDateString();
    }
  }

  const messages = [];
  if (ticket.message || ticket.description) {
    let initialTime = "";
    if (ticket.createdAt) {
      if (ticket.createdAt.toDate) {
        initialTime = ticket.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (ticket.createdAt.seconds) {
        initialTime = new Date(ticket.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        initialTime = new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        msgTime = r.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (r.createdAt.seconds) {
        msgTime = new Date(r.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        msgTime = new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }
    messages.push({
      sender: r.senderName || (r.senderRole === 'Customer' ? 'Customer' : 'Admin'),
      role: r.senderRole?.toLowerCase() || 'customer',
      text: r.message,
      time: msgTime
    });
  });

  return {
    ...ticket,
    id: ticket.id,
    title: ticket.subject || ticket.title || "No Subject",
    description: ticket.message || ticket.description || "No Message",
    status: ticket.status || 'Open',
    priority: ticket.priority || 'Medium',
    time: timeStr,
    customerName,
    customerInitials,
    customerMeta: `User: ${ticket.userId || 'Unknown'}`,
    orderId: ticket.orderId || 'None',
    assignedTo: ticket.assignedTo || '',
    messages
  };
};

export const CustomerSupport = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const [viewMode, setViewMode] = useState("board"); // 'board' or 'list'
  const [tickets, setTickets] = useState([]);
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
      customerInitials: "SJ",
      customerMeta: "Customer since Mar 2023 • 12 Orders",
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
      customerInitials: "MR",
      customerMeta: "Customer since Jan 2024 • 4 Orders",
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
      customerInitials: "KT",
      customerMeta: "Customer since Jun 2023 • 31 Orders",
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
      customerInitials: "EW",
      customerMeta: "Customer since Nov 2023 • 8 Orders",
      orderId: "ORD-9750",
      assignedTo: "Admin B",
      messages: [
        { sender: "Emma W.", role: "customer", text: "Rider dropped the package at Block C instead of Block B.", time: "Yesterday" }
      ],
      resolution: "Refunded"
    }
  ];

  const fetchTicketsList = async () => {
    try {
      const data = await SupportTicketService.getSupportTickets();
      if (data && data.length > 0) {
        const mapped = data.map(mapFirestoreTicketToUi);
        setTickets(mapped);
        return mapped;
      } else {
        setTickets(defaultTickets);
        return defaultTickets;
      }
    } catch (err) {
      console.error("Error fetching tickets:", err);
      setTickets(defaultTickets);
      return defaultTickets;
    }
  };

  useEffect(() => {
    const initFetch = async () => {
      await fetchTicketsList();
      setLoading(false);
    };
    initFetch();
  }, []);

  const handleTicketClick = (ticket) => {
    setSelectedTicket(ticket);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedTicket(null);
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
                    <span className="font-label-sm text-label-sm text-[#10b981] px-2 py-0.5 bg-[#ffdbd0] rounded">#{t.id}</span>
                    <span className="font-body-sm text-[11px] text-[#555f6f]">{t.time}</span>
                  </div>
                  <h4 className="font-label-md text-body-sm text-[#151c27] mb-1 font-semibold group-hover:text-[#10b981] transition-colors">{t.title}</h4>
                  <p className="font-body-sm text-[12px] text-[#555f6f] line-clamp-2 mb-3">{t.description}</p>
                  <div className="flex justify-between items-center border-t border-[#dce2f3]/50 pt-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#d6e0f3] flex items-center justify-center text-[10px] font-bold text-[#596373]">{t.customerInitials}</div>
                      <span className="font-body-sm text-[12px] text-[#151c27]">{t.customerName}</span>
                    </div>
                    {t.priority === "High" && (
                      <span className="material-symbols-outlined text-[16px] text-[#ba1a1a]" title="High Priority">priority_high</span>
                    )}
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
                    <span className="font-label-sm text-label-sm text-[#10b981] px-2 py-0.5 bg-[#ffdbd0] rounded">#{t.id}</span>
                    <span className="font-body-sm text-[11px] text-[#555f6f]">{t.time}</span>
                  </div>
                  <h4 className="font-label-md text-body-sm text-[#151c27] mb-1 font-semibold group-hover:text-[#10b981] transition-colors">{t.title}</h4>
                  <p className="font-body-sm text-[12px] text-[#555f6f] line-clamp-2 mb-3">{t.description}</p>
                  <div className="flex justify-between items-center border-t border-[#dce2f3]/50 pt-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#d6e0f3] flex items-center justify-center text-[10px] font-bold text-[#596373]">{t.customerInitials}</div>
                      <span className="font-body-sm text-[12px] text-[#151c27]">{t.customerName}</span>
                    </div>
                    {t.assignedTo && (
                      <div className="w-6 h-6 rounded-full bg-[#10b981] flex items-center justify-center text-[10px] font-bold text-white border border-white" title={`Assigned to ${t.assignedTo}`}>
                        {t.assignedTo.charAt(0)}
                      </div>
                    )}
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
                    <span className="font-label-sm text-label-sm text-[#555f6f] px-2 py-0.5 bg-[#dce2f3] rounded line-through">#{t.id}</span>
                    <span className="font-body-sm text-[11px] text-[#555f6f]">{t.time}</span>
                  </div>
                  <h4 className="font-label-md text-body-sm text-[#555f6f] mb-1 font-semibold line-through">{t.title}</h4>
                  <div className="flex justify-between items-center border-t border-[#dce2f3]/50 pt-3 mt-3">
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
                <th className="py-3.5 px-6 font-label-md text-label-md text-[#555f6f]">Customer</th>
                <th className="py-3.5 px-6 font-label-md text-label-md text-[#555f6f]">Assigned To</th>
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
                  <td className="py-4 px-6 font-semibold text-[#10b981]">#{t.id}</td>
                  <td className="py-4 px-6 font-semibold">{t.title}</td>
                  <td className="py-4 px-6">{t.customerName}</td>
                  <td className="py-4 px-6">{t.assignedTo || "Unassigned"}</td>
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
        className={`fixed inset-y-0 right-0 w-[450px] bg-white border-l border-[#dce2f3] shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selectedTicket && (
          <>
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-[#dce2f3] flex justify-between items-start bg-white">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-label-sm text-label-sm text-[#10b981] px-2 py-0.5 bg-[#ffdbd0] rounded">
                    #{selectedTicket.id}
                  </span>
                  <span
                    className={`px-2 py-0.5 font-label-sm text-[10px] rounded-full uppercase tracking-wider ${
                      selectedTicket.priority === "High"
                        ? "bg-[#ffdad6] text-[#93000a]"
                        : "bg-[#e7eefe] text-[#121c2a]"
                    }`}
                  >
                    {selectedTicket.priority} Priority
                  </span>
                </div>
                <h2 className="font-headline-md text-[20px] font-semibold text-[#151c27]">{selectedTicket.title}</h2>
              </div>
              <button
                className="w-8 h-8 rounded-full hover:bg-[#f0f3ff] flex items-center justify-center text-[#555f6f] transition-colors"
                onClick={handleCloseDrawer}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Customer Context Bar */}
            <div className="px-6 py-3 border-b border-[#dce2f3] bg-[#f0f3ff] flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#d6e0f3] flex items-center justify-center font-bold text-[#596373]">
                  {selectedTicket.customerInitials}
                </div>
                <div>
                  <h3 className="font-label-md text-label-md text-[#151c27] font-semibold">{selectedTicket.customerName}</h3>
                  <p className="font-body-sm text-[12px] text-[#555f6f]">{selectedTicket.customerMeta}</p>
                </div>
              </div>
              <div className="text-[#10b981] font-semibold text-xs border border-[#10b981]/20 px-3 py-1 rounded bg-white">
                Order #{selectedTicket.orderId}
              </div>
            </div>

            {/* Conversation History */}
            <div className="flex-grow overflow-y-auto p-6 bg-white flex flex-col gap-6">
              <div className="flex justify-center">
                <span className="bg-[#f0f3ff] px-3 py-1 rounded-full font-body-sm text-[11px] text-[#555f6f]">
                  Ticket opened via App • {selectedTicket.time}
                </span>
              </div>

              {selectedTicket.messages?.map((msg, index) => (
                <div
                  key={index}
                  className={`flex gap-3 max-w-[85%] ${msg.role === "admin" ? "ml-auto flex-row-reverse" : ""}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-1 ${
                      msg.role === "admin"
                        ? "bg-[#ffdbd0] text-[#10b981]"
                        : msg.role === "bot"
                        ? "bg-[#f0f3ff] text-[#10b981]"
                        : "bg-[#d6e0f3] text-[#596373]"
                    }`}
                  >
                    {msg.role === "bot" ? (
                      <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                    ) : (
                      msg.sender.split(" ").map((n) => n[0]).join("")
                    )}
                  </div>
                  <div className={`flex flex-col gap-1 ${msg.role === "admin" ? "items-end" : ""}`}>
                    <div className="flex items-baseline gap-2">
                      <span className="font-label-md text-sm text-[#151c27] font-semibold">{msg.sender}</span>
                      <span className="font-body-sm text-[11px] text-[#555f6f]">{msg.time}</span>
                    </div>
                    <div
                      className={`p-3 rounded-2xl text-body-sm text-[#151c27] border ${
                        msg.role === "admin"
                          ? "bg-[#ffdbd0]/30 border-[#ffdbd0] rounded-tr-sm"
                          : "bg-[#f0f3ff] border-[#dce2f3]/30 rounded-tl-sm"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Area */}
            {selectedTicket.status !== "Resolved" ? (
              <div className="border-t border-[#dce2f3] bg-[#f9f9ff] p-4">
                {/* Quick Actions */}
                <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                  <button
                    onClick={() => handleQuickAction("refund")}
                    className="whitespace-nowrap px-3 py-1.5 bg-white border border-[#dce2f3] rounded-full font-label-sm text-[11px] text-[#151c27] hover:border-[#10b981] hover:text-[#10b981] transition-colors flex items-center gap-1 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[14px]">payments</span> Partial Refund (₹375.00)
                  </button>
                  <button
                    onClick={() => handleQuickAction("redeliver")}
                    className="whitespace-nowrap px-3 py-1.5 bg-white border border-[#dce2f3] rounded-full font-label-sm text-[11px] text-[#151c27] hover:border-[#10b981] hover:text-[#10b981] transition-colors flex items-center gap-1 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[14px]">local_shipping</span> Redeliver Item
                  </button>
                  <button
                    onClick={() => handleQuickAction("credit")}
                    className="whitespace-nowrap px-3 py-1.5 bg-white border border-[#dce2f3] rounded-full font-label-sm text-[11px] text-[#151c27] hover:border-[#10b981] hover:text-[#10b981] transition-all shadow-sm"
                  >
                    Apologize & Credit
                  </button>
                </div>

                {/* Reply Input */}
                <div className="relative">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="w-full bg-white border border-[#dce2f3] rounded-lg p-3 text-body-sm focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-shadow resize-none pr-24"
                    placeholder={`Type your reply to ${selectedTicket.customerName}...`}
                    rows="3"
                  />
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <button
                      onClick={handleSendReply}
                      className="bg-[#10b981] text-white px-4 py-1.5 rounded-md font-label-md text-label-md hover:bg-[#059669] transition-colors shadow-sm flex items-center gap-1"
                    >
                      Send <span className="material-symbols-outlined text-[16px]">send</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-t border-[#dce2f3] bg-[#ecfdf5] p-4 text-center text-[#006c49] font-label-md text-label-md flex justify-center items-center gap-2">
                <span className="material-symbols-outlined">check_circle</span>
                Ticket is Resolved ({selectedTicket.resolution})
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
