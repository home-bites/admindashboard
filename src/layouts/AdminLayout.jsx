import React from "react";
import { Outlet } from "react-router-dom";
import { useUiStore } from "../store/uiStore";
import { SideNavBar } from "../components/SideNavBar";
import { TopNavBar } from "../components/TopNavBar";
import { ToastContainer } from "../components/ToastContainer";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { GlobalSearchModal } from "../components/GlobalSearchModal";
import { useOrderNotification } from "../hooks/useOrderNotification";

export const AdminLayout = () => {
  const { sidebarCollapsed } = useUiStore();
  
  // Attach the global order listener
  useOrderNotification();

  return (
    <div className="min-h-screen bg-[#f9f9ff] dark:bg-slate-950 text-[#151c27] dark:text-slate-100 flex transition-colors duration-200">
      {/* Sidebar Navigation */}
      <SideNavBar />

      {/* Main Content Area */}
      {/*
        Content offset.

        Two things must hold. The padding has to match SideNavBar's rail width
        exactly (w-[72px] / w-[248px]) or a dead gutter opens beside the nav.
        And it must only apply from `lg` up: below that breakpoint the rail is
        hidden and navigation is a drawer, so reserving 248px of padding on a
        phone pushed the entire page off the right edge — which is where the
        horizontal overflow on small screens came from.

        `min-w-0` lets the column shrink below its content width, without which
        a wide table inside forces the whole layout to scroll sideways instead
        of scrolling within its own container.
      */}
      <div
        className={`flex h-screen min-w-0 flex-1 flex-col overflow-hidden transition-[padding] duration-200 ${
          sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-[248px]"
        }`}
      >
        {/* Top Navbar */}
        <TopNavBar />

        {/* Page Content */}
        {/* Tighter padding on small screens, and min-w-0 again so wide
            children scroll inside themselves rather than widening the page. */}
        <main className="mt-16 min-w-0 flex-1 overflow-y-auto bg-[#f9f9ff] p-4 dark:bg-slate-950 sm:p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Global Modals & Toasts */}
      <GlobalSearchModal />
      <ToastContainer />
    </div>
  );
};
export default AdminLayout;

