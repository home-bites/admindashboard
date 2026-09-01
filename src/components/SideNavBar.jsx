import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useOrderStore } from "../store/orderStore";
import { stageOf, STAGE } from "../lib/orderStages";
import logoImg from "../assets/logo.jpg";

/**
 * Primary navigation.
 *
 * ── Why this is a rewrite and not a restyle ──────────────────────────────
 *
 * The previous pass changed the active icon's colour and added tooltips, and
 * left the structure alone. The structure was the problem: a flat scroll of
 * up to twenty-nine links in seven groups, every one an identical pill, with
 * no way to tell an operational screen from a settings page and nothing on
 * screen indicating that anything needed attention. It read as a template
 * because it *was* one — a list rendered uniformly regardless of meaning.
 *
 * What changed here:
 *
 *  1. **Grouping now reflects how the business is run**, not how the codebase
 *     is filed. Operations first, because that is where an operator lives
 *     during service; System last, because it is visited monthly.
 *
 *  2. **The nav carries live operational state.** Orders shows a count
 *     of work actually waiting — new plus preparing plus ready. A navigation
 *     bar that cannot tell you there are eleven unstarted orders is
 *     decoration. It reads the shared order store, so it costs no extra query.
 *
 *  3. **The active row is a row, not a floating card.** A tinted band with a
 *     left accent rail, flush to the edge. Every item previously sat in its
 *     own rounded pill with a drop shadow, which is what made the list look
 *     like a column of competing buttons.
 *
 *  4. **Groups collapse.** With this many destinations, letting an operator
 *     fold away Marketing and Subscriptions is the difference between a list
 *     you scan and a list you scroll. Choices persist per browser.
 *
 *  5. **Mobile is a real drawer** with a scrim, rather than a fixed rail
 *     sitting on top of the content.
 *
 * Every `to` below corresponds to a route in App.jsx. Verified against the
 * route table; the sidebar must never offer a destination the router will
 * bounce back to the dashboard.
 */

/** Groups, in the order an operator needs them. */
const NAV_GROUPS = [
  {
    id: "operations",
    title: "Operations",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: "space_dashboard" },
      { to: "/orders", label: "Orders", icon: "receipt_long", badge: "activeOrders" },
      { to: "/live-command", label: "Live Radar", icon: "radar" },
      { to: "/delivery-tracking", label: "Delivery Tracking", icon: "share_location" },
      { to: "/delivery-partners", label: "Delivery Partners", icon: "two_wheeler" },
    ],
  },
  {
    id: "catalog",
    title: "Catalog",
    items: [
      { to: "/menu", label: "Menu", icon: "restaurant_menu" },
      { to: "/categories", label: "Categories", icon: "category" },
      { to: "/diet-foods", label: "Diet Foods", icon: "nutrition" },
      { to: "/diet-categories", label: "Diet Categories", icon: "eco" },
    ],
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    items: [
      { to: "/subscriptions", label: "Subscriptions", icon: "event_repeat" },
      { to: "/meal-plans", label: "Meal Plans", icon: "calendar_month" },
      { to: "/nutrition", label: "Nutrition", icon: "monitor_heart" },
    ],
  },
  {
    id: "customers",
    title: "Customers",
    items: [
      { to: "/customers", label: "Customers", icon: "group" },
      { to: "/wallet", label: "Wallet", icon: "account_balance_wallet" },
      { to: "/reviews", label: "Reviews", icon: "reviews" },
      { to: "/support", label: "Support", icon: "support_agent" },
    ],
  },
  {
    id: "marketing",
    title: "Marketing",
    items: [
      { to: "/banners", label: "Banners", icon: "view_carousel" },
      { to: "/coupons", label: "Coupons", icon: "confirmation_number" },
      { to: "/deals", label: "Deals", icon: "sell" },
      { to: "/diet-offers-banners", label: "Diet Offers", icon: "local_offer" },
      { to: "/promo-cards", label: "Promo Cards", icon: "style" },
      { to: "/media-library", label: "Media Library", icon: "perm_media" },
    ],
  },
  {
    id: "insights",
    title: "Insights",
    items: [
      { to: "/analytics", label: "Analytics", icon: "monitoring" },
      { to: "/reports", label: "Reports", icon: "summarize" },
    ],
  },
  {
    id: "system",
    title: "System",
    items: [
      { to: "/service-areas", label: "Service Areas", icon: "pin_drop" },
      { to: "/settings", label: "Settings", icon: "settings" },
      { to: "/security", label: "Security", icon: "shield" },
      { to: "/security-settings", label: "Security Settings", icon: "admin_panel_settings" },
    ],
  },
];

const COLLAPSED_KEY = "hombites.nav.collapsedGroups";

export const SideNavBar = () => {
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const { user, logout } = useAuthStore();
  const { orders } = useOrderStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);

  /* Folded groups, remembered per browser. Wrapped because storage throws in
     private mode and when site data is blocked — a nav that fails to render
     because it could not read a preference would be a poor trade. */
  const [folded, setFolded] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]"));
    } catch {
      return new Set();
    }
  });

  const toggleGroup = (id) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch { /* not worth failing navigation over */ }
      return next;
    });
  };

  /* Navigating closes the mobile drawer. Without this, tapping a link on a
     phone leaves the overlay covering the page you just asked for. */
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  /* Work actually waiting on someone. Delivered and cancelled orders are not
     work; neither is an order already with a rider. Derived from the store
     the Orders page already holds, so this adds no query. */
  const badges = useMemo(() => {
    const waiting = (orders || []).filter((o) => {
      const st = stageOf(o);
      return st === STAGE.ORDERS || st === STAGE.PREPARING || st === STAGE.READY;
    }).length;
    return { activeOrders: waiting };
  }, [orders]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const railWidth = sidebarCollapsed ? "w-[72px]" : "w-[248px]";

  const nav = (
    <nav
      aria-label="Primary"
      className={`flex h-full flex-col border-r border-slate-800/60 bg-[#0B1220] ${railWidth} transition-[width] duration-200`}
    >
      {/* ── Brand ─────────────────────────────────────────────────────── */}
      <div className={`flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-800/60 ${sidebarCollapsed ? "justify-center px-0" : "px-4"}`}>
        <img src={logoImg} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-emerald-500/30" />
        {!sidebarCollapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-none tracking-tight text-white"
               style={{ fontFamily: "Outfit, sans-serif" }}>
              HomBites
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              {/* Live indicator. Tied to the order stream actually delivering
                  data, so it means something rather than being a decorative
                  green dot that is always on. */}
              <span className={`h-1.5 w-1.5 rounded-full ${orders?.length ? "bg-emerald-400" : "bg-slate-600"}`} />
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {orders?.length ? "Live" : "Connecting"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Groups ────────────────────────────────────────────────────── */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => {
          const isFolded = folded.has(group.id) && !sidebarCollapsed;
          return (
            <div key={group.id} className="mb-1">
              {!sidebarCollapsed ? (
                <button
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={!isFolded}
                  className="flex w-full items-center justify-between px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 outline-none transition-colors hover:text-slate-300 focus-visible:ring-1 focus-visible:ring-emerald-500"
                >
                  {group.title}
                  <span className={`material-symbols-outlined text-[14px] transition-transform ${isFolded ? "-rotate-90" : ""}`}>
                    expand_more
                  </span>
                </button>
              ) : (
                <div className="mx-4 my-2 border-t border-slate-800/70" aria-hidden="true" />
              )}

              {!isFolded && (
                <ul>
                  {group.items.map((item) => {
                    const count = item.badge ? badges[item.badge] : 0;
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          title={sidebarCollapsed ? item.label : undefined}
                          aria-label={sidebarCollapsed ? item.label : undefined}
                          className={({ isActive }) =>
                            [
                              "group relative flex items-center gap-3 text-[13px] outline-none transition-colors",
                              // Flush band, not a floating pill.
                              sidebarCollapsed ? "justify-center py-2.5" : "py-2 pl-4 pr-3",
                              isActive
                                ? "bg-emerald-500/[0.12] font-semibold text-white"
                                : "font-medium text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
                              "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emerald-400",
                            ].join(" ")
                          }
                        >
                          {({ isActive }) => (
                            <>
                              {isActive && (
                                <span aria-hidden="true"
                                      className="absolute left-0 top-0 h-full w-[3px] bg-emerald-400" />
                              )}
                              <span
                                className="material-symbols-outlined shrink-0 transition-colors"
                                style={{
                                  fontSize: "20px",
                                  color: isActive ? "#34d399" : undefined,
                                  fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                                }}
                              >
                                {item.icon}
                              </span>

                              {!sidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}

                              {/* Live count. In collapsed mode it becomes a dot
                                  on the icon — a number is unreadable at 72px
                                  but its presence still needs to register. */}
                              {count > 0 && (
                                sidebarCollapsed ? (
                                  <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#0B1220]" />
                                ) : (
                                  <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-emerald-300">
                                    {count}
                                  </span>
                                )
                              )}
                            </>
                          )}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Session ───────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-800/60 p-2">
        {!sidebarCollapsed ? (
          <div className="mb-1 flex items-center gap-2 px-2 py-1.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-[11px] font-bold text-emerald-400"
                 aria-hidden="true">
              {(user?.displayName || user?.email || "A").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-white">
                {user?.displayName || "Admin"}
              </p>
              <p className="truncate text-[10px] font-medium text-slate-500">
                {user?.role || "Staff"}
              </p>
            </div>
            <button onClick={handleLogout} title="Sign out" aria-label="Sign out"
                    className="shrink-0 rounded-lg p-1.5 text-slate-500 outline-none transition-colors hover:bg-rose-500/10 hover:text-rose-400 focus-visible:ring-1 focus-visible:ring-rose-400">
              <span className="material-symbols-outlined text-[17px]">logout</span>
            </button>
          </div>
        ) : (
          <button onClick={handleLogout} title="Sign out" aria-label="Sign out"
                  className="mb-1 flex w-full items-center justify-center rounded-lg p-2 text-slate-500 outline-none transition-colors hover:bg-rose-500/10 hover:text-rose-400 focus-visible:ring-1 focus-visible:ring-rose-400">
            <span className="material-symbols-outlined text-[17px]">logout</span>
          </button>
        )}

        <button
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          className="flex w-full items-center justify-center rounded-lg p-2 text-slate-500 outline-none transition-colors hover:bg-white/5 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-emerald-400"
        >
          <span className="material-symbols-outlined text-[18px]">
            {sidebarCollapsed ? "chevron_right" : "chevron_left"}
          </span>
        </button>
      </div>
    </nav>
  );

  return (
    <>
      {/* Desktop rail. Hidden below lg, where the drawer takes over — the old
          fixed rail stayed on screen at every width and sat over the content
          on a phone. */}
      <div className="fixed left-0 top-0 z-50 hidden h-screen lg:block">{nav}</div>

      {/* Mobile trigger */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        className="fixed left-3 top-3 z-40 rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 lg:hidden"
      >
        <span className="material-symbols-outlined text-[20px]">menu</span>
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button aria-label="Close navigation" tabIndex={-1}
                  onClick={() => setMobileOpen(false)}
                  className="absolute inset-0 cursor-default bg-slate-900/50" />
          <div className="relative h-full w-[248px]">{nav}</div>
        </div>
      )}
    </>
  );
};

export default SideNavBar;
