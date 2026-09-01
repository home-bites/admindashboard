import React from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";

export const TopNavBar = ({ searchPlaceholder = "Search anything... (Press Ctrl + K)" }) => {
  const { sidebarCollapsed, toggleSearch, theme, setTheme } = useUiStore();
  const { user } = useAuthStore();

  const isDark = theme === "dark";

  return (
    <header
      /*
       * Anchored to both edges rather than sized with a width calculation.
       *
       * It was `w-[calc(100%-5rem)]` collapsed and `w-[calc(100%-16rem)]`
       * expanded — 80px and 256px, against a rail that was actually 68px and
       * 256px, and is now 72px and 248px. Every one of those numbers had to
       * be kept in step by hand across three files, and two of them were
       * already wrong, which is what left a sliver of page visible under the
       * header edge.
       *
       * `left-0 right-0` with a breakpoint-scoped left offset cannot drift:
       * the header simply starts where the rail ends, and on small screens,
       * where the rail is a drawer rather than a fixed column, it spans the
       * full width with room left for the menu button.
       */
      className={`fixed top-0 right-0 left-0 z-40 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 pl-16 pr-4 backdrop-blur-md transition-[padding,left] duration-200 dark:border-slate-800/80 dark:bg-slate-900/90 sm:pr-6 lg:pl-6 ${
        sidebarCollapsed ? "lg:left-[72px]" : "lg:left-[248px]"
      }`}
    >
      {/* Quick Command & Search Trigger */}
      <div 
        onClick={toggleSearch}
        className="flex-grow max-w-md relative flex items-center cursor-pointer group"
      >
        <span className="material-symbols-outlined absolute left-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors" style={{ fontSize: "20px" }}>
          search
        </span>
        <div className="w-full bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl pl-10 pr-12 py-2 text-sm text-slate-500 dark:text-slate-400 font-medium transition-all flex items-center justify-between shadow-xs">
          <span className="truncate">{searchPlaceholder}</span>
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded shadow-2xs font-semibold">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Realtime Indicators, Theme Toggle & Profile */}
      <div className="flex items-center gap-3">
        
        {/* Realtime Sync Status Indicator */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span>Realtime Live</span>
        </div>

        {/* Dark/Light Theme Toggle */}
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          title={`Switch to ${isDark ? "Light" : "Dark"} Mode`}
        >
          <span className="material-symbols-outlined text-[20px]">
            {isDark ? "light_mode" : "dark_mode"}
          </span>
        </button>

        {/* Global Search Shortcut Button */}
        <button
          onClick={toggleSearch}
          className="p-2 rounded-xl text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          title="Open Command Search"
        >
          <span className="material-symbols-outlined text-[20px]">terminal</span>
        </button>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>

        {/* User Profile Info */}
        <div className="flex items-center gap-3 py-1 px-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shadow-xs">
            {user?.displayName ? user.displayName.charAt(0) : "A"}
          </div>
          <div className="hidden md:flex flex-col items-start text-left">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
              {user?.displayName || "Admin User"}
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold tracking-wide uppercase">
              {user?.role || "Super Admin"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopNavBar;

