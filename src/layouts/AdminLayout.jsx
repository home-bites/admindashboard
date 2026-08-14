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
      <div
        className={`flex-1 flex flex-col h-screen overflow-hidden transition-all duration-300 ${
          sidebarCollapsed ? "pl-20" : "pl-64"
        }`}
      >
        {/* Top Navbar */}
        <TopNavBar />

        {/* Page Content */}
        <main className="flex-1 mt-16 overflow-y-auto bg-[#f9f9ff] dark:bg-slate-950 p-6">
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

