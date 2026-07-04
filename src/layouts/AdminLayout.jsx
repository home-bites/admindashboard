import React from "react";
import { Outlet } from "react-router-dom";
import { useUiStore } from "../store/uiStore";
import { SideNavBar } from "../components/SideNavBar";
import { TopNavBar } from "../components/TopNavBar";
import { ToastContainer } from "../components/ToastContainer";
import { ErrorBoundary } from "../components/ErrorBoundary";

export const AdminLayout = () => {
  const { sidebarCollapsed } = useUiStore();

  return (
    <div className="min-h-screen bg-[#f9f9ff] text-[#151c27] flex">
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
        <main className="flex-1 mt-16 overflow-y-auto bg-[#f9f9ff]">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Global Toasts */}
      <ToastContainer />
    </div>
  );
};
export default AdminLayout;
