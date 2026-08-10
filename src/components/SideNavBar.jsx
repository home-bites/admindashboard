import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import logoImg from "../assets/logo.jpg";

export const SideNavBar = () => {
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // Every `to` here must correspond to a real <Route> in App.jsx.
  //
  // Eighteen of these previously pointed at routes that did not exist. Because
  // App.jsx ends with a catch-all `<Route path="*" element={<Navigate to="/dashboard" />} />`,
  // clicking them did not 404 — it silently bounced back to the Dashboard,
  // which is why the pages appeared to be "not coming" with nothing in the
  // console. Ten built-and-routed pages were meanwhile unreachable because
  // nothing linked to them.
  //
  // The nine /settings/* entries are gone: Settings.jsx already holds every
  // section, so they were nine dead links to one page.
  const navSections = [
    {
      title: "Dashboard",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
        { to: "/analytics", label: "Analytics", icon: "analytics" },
        { to: "/reports", label: "Reports", icon: "summarize" },
      ]
    },
    {
      title: "Kitchen",
      items: [
        { to: "/live-command", label: "Live Radar", icon: "radar" },
        { to: "/kitchen", label: "Kitchen Queue", icon: "kitchen" },
        { to: "/delivery-tracking", label: "Delivery Tracking", icon: "share_location" },
      ]
    },
    {
      title: "Operations",
      items: [
        { to: "/orders", label: "Orders", icon: "receipt_long" },
        { to: "/customers", label: "Customers", icon: "group" },
        { to: "/delivery-partners", label: "Delivery Partners", icon: "local_shipping" },
        { to: "/wallet", label: "Wallet", icon: "account_balance_wallet" },
      ]
    },
    {
      title: "Subscriptions",
      items: [
        { to: "/subscriptions", label: "Subscriptions", icon: "event_repeat" },
        { to: "/meal-plans", label: "Meal Plans", icon: "restaurant" },
        { to: "/daily-menu", label: "Daily Menu", icon: "menu_book" },
        { to: "/nutrition", label: "Nutrition", icon: "monitor_heart" },
      ]
    },
    {
      title: "Menu",
      items: [
        { to: "/categories", label: "Regular Categories", icon: "category" },
        { to: "/menu", label: "Regular Foods", icon: "restaurant_menu" },
        { to: "/diet-categories", label: "Diet Categories", icon: "energy_savings_leaf" },
        { to: "/diet-foods", label: "Diet Foods", icon: "nutrition" },
      ]
    },
    {
      title: "Marketing",
      items: [
        { to: "/coupons", label: "Coupons", icon: "confirmation_number" },
        { to: "/deals", label: "Deals", icon: "sell" },
        { to: "/diet-offers-banners", label: "Diet Offers", icon: "local_offer" },
        { to: "/banners", label: "Banners", icon: "view_carousel" },
        { to: "/media-library", label: "Media Library", icon: "perm_media" },
      ]
    },
    {
      title: "Users",
      items: [
        { to: "/reviews", label: "Reviews", icon: "rate_review" },
        { to: "/support", label: "Support Tickets", icon: "support_agent" },
      ]
    },
    {
      title: "Settings",
      items: [
        { to: "/settings", label: "Settings", icon: "settings" },
        { to: "/service-areas", label: "Service Areas", icon: "pin_drop" },
        { to: "/security", label: "Security", icon: "security" },
        { to: "/security-settings", label: "Security Settings", icon: "admin_panel_settings" },
      ]
    }
  ];

  return (
    <nav
      className={`fixed left-0 top-0 h-screen bg-[#0f172a] border-r border-slate-800/80 shadow-[4px_0_24px_rgba(0,0,0,0.15)] flex flex-col transition-all duration-300 z-50 ${
        sidebarCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800/60 h-16 shrink-0 overflow-hidden bg-slate-900/40">
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-3">
            <img
              src={logoImg}
              alt="HomeBites Logo"
              className="w-8 h-8 rounded-full object-cover border border-slate-700"
            />
            <div>
              <h1 className="font-bold text-base text-white leading-none tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>HomeBites</h1>
              <span className="text-[9px] text-[#10b981] font-bold tracking-wider uppercase mt-1 block">Enterprise Command</span>
            </div>
          </div>
        ) : (
          <div className="mx-auto">
            <img
              src={logoImg}
              alt="HomeBites Icon"
              className="w-8 h-8 rounded-full object-cover border border-slate-700"
            />
          </div>
        )}
      </div>

      {/* Grouped Navigation Menu */}
      <div className="flex-grow overflow-y-auto py-3 px-3 space-y-4 scrollbar-thin">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            {!sidebarCollapsed && (
              <h3 className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                {section.title}
              </h3>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-150 group font-medium ${
                    isActive
                      ? "text-white bg-[#10b981]/20 font-bold border-l-4 border-[#10b981] shadow-[0_4px_12px_rgba(16,185,129,0.1)]"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  }`
                }
              >
                <span 
                  className="material-symbols-outlined shrink-0 text-slate-400 group-hover:text-white transition-colors" 
                  style={{ fontSize: "18px" }}
                >
                  {item.icon}
                </span>
                {!sidebarCollapsed && (
                  <span className="text-[12.5px] tracking-wide truncate">{item.label}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      {/* User Session and Collapse footer */}
      <div className="p-3 border-t border-slate-800/60 bg-slate-900/40 shrink-0">
        {!sidebarCollapsed && (
          <div className="flex items-center justify-between px-2 py-1.5 mb-2 rounded-xl bg-slate-800/40 border border-slate-800 shadow-2xs">
            <div className="truncate pr-2">
              <p className="text-xs font-bold text-white truncate">{user?.displayName || "Admin User"}</p>
              <p className="text-[9px] font-bold text-[#10b981] truncate tracking-wide uppercase">{user?.role || "Core Staff"}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Sign Out"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
            </button>
          </div>
        )}

        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-transparent hover:border-slate-800"
          title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <span className="material-symbols-outlined text-[18px]">
            {sidebarCollapsed ? "chevron_right" : "chevron_left"}
          </span>
        </button>
      </div>
    </nav>
  );
};

export default SideNavBar;
