import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Layout
import AdminLayout from "./layouts/AdminLayout";

// Guards
import ProtectedRoute from "./guards/ProtectedRoute";
import RBACGuard from "./guards/RBACGuard";

// Pages
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import MenuItems from "./pages/MenuItems";
import Categories from "./pages/Categories";
import Banners from "./pages/Banners";
import Coupons from "./pages/Coupons";
import Deals from "./pages/Deals";
import DeliveryPartners from "./pages/DeliveryPartners";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import CustomerSupport from "./pages/CustomerSupport";
import Wallet from "./pages/Wallet";
import Settings from "./pages/Settings";
import ServiceAreas from "./pages/ServiceAreas";
import Reviews from "./pages/Reviews";
import Customers from "./pages/Customers";
import SecurityDashboard from "./pages/SecurityDashboard";
import SecuritySettings from "./pages/SecuritySettings";
import DietFoods from "./pages/DietFoods";
import MealPlans from "./pages/MealPlans";
import NutritionDashboard from "./pages/NutritionDashboard";
import DietCategories from "./pages/DietCategories";
import Subscriptions from "./pages/Subscriptions";
import LiveCommandCenter from "./pages/LiveCommandCenter";
import DietOffersBanners from "./pages/DietOffersBanners";
import { MediaLibrary } from "./pages/MediaLibrary";
// Built but never imported, so never routed and unreachable from anywhere.
import KitchenDashboard from "./pages/KitchenDashboard";
import DeliveryDashboard from "./pages/DeliveryDashboard";
import { useAuthStore } from "./store/authStore";

import { isFirebaseConfigured, auth } from "./firebase/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { secureCore } from "./security/secureCore";
import { useEffect, useState } from "react";
import ConfigErrorScreen from "./components/ConfigErrorScreen";

// Create TanStack Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const App = () => {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthReady(true);
      if (firebaseUser) {
        secureCore.authGuard.monitorSession(firebaseUser.uid);
      } else {
        secureCore.authGuard.stopMonitoring();
        const { isAuthenticated } = useAuthStore.getState();
        if (isAuthenticated) {
          useAuthStore.setState({ user: null, isAuthenticated: false });
        }
      }
    });
    return () => unsub();
  }, []);

  const isMockDataEnabled = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
  const showConfigError = !isFirebaseConfigured && !isMockDataEnabled;

  if (showConfigError) {
    return <ConfigErrorScreen />;
  }

  if (!authReady && !isMockDataEnabled) {
    return (
      <div className="min-h-screen bg-[#f9f9ff] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#10b981] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[#555f6f] text-sm font-semibold">Initializing session...</span>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />

          {/* Protected Admin Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            {/* Redirect root to dashboard */}
            <Route index element={<Navigate to="/dashboard" replace />} />

            {/* Dashboard (All roles) */}
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="live-command" element={<LiveCommandCenter />} />

            {/* Diet & Health Suite (Super Admin & Admin roles) */}
            <Route
              path="diet-foods"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <DietFoods />
                </RBACGuard>
              }
            />
            <Route
              path="meal-plans"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <MealPlans />
                </RBACGuard>
              }
            />
            <Route
              path="nutrition"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <NutritionDashboard />
                </RBACGuard>
              }
            />
            <Route
              path="diet-categories"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <DietCategories />
                </RBACGuard>
              }
            />
            <Route
              path="subscriptions"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <Subscriptions />
                </RBACGuard>
              }
            />
            <Route
              path="diet-offers-banners"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <DietOffersBanners />
                </RBACGuard>
              }
            />

            {/* Kitchen & dispatch. KitchenDashboard and DeliveryDashboard
                existed as components but were never imported or routed — the
                sidebar linked to /subscriptions/kitchen-queue and
                /delivery-tracking, neither of which was declared. */}
            <Route path="kitchen" element={<KitchenDashboard />} />
            <Route path="delivery-tracking" element={<DeliveryDashboard />} />

            {/* The Daily Menu route is gone. Subscription dishes are edited on
                the meal plan itself (Meal Plans page), so there is no per-date
                menu to publish and no daily step that, if skipped, left every
                subscriber with nothing to choose. */}

            {/* Orders management (All roles) */}
            <Route path="orders" element={<Orders />} />

            {/* Menu Management (Super Admin & Admin roles) */}
            <Route
              path="menu"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <MenuItems />
                </RBACGuard>
              }
            />

            {/* Categories (Super Admin & Admin roles) */}
            <Route
              path="categories"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <Categories />
                </RBACGuard>
              }
            />

            {/* Promo Banners & Media Library (Super Admin & Admin roles) */}
            <Route
              path="banners"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <Banners />
                </RBACGuard>
              }
            />
            <Route
              path="media-library"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <MediaLibrary />
                </RBACGuard>
              }
            />

            {/* Coupons & Deals (Super Admin & Admin roles) */}
            <Route
              path="coupons"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <Coupons />
                </RBACGuard>
              }
            />
            <Route
              path="deals"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <Deals />
                </RBACGuard>
              }
            />

            {/* Delivery Partners management (Super Admin & Admin roles) */}
            <Route
              path="delivery-partners"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <DeliveryPartners />
                </RBACGuard>
              }
            />

            {/* Financial & Operational Analytics (Super Admin & Admin roles) */}
            <Route
              path="analytics"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <Analytics />
                </RBACGuard>
              }
            />

            {/* Exportable Reports (Super Admin only) */}
            <Route
              path="reports"
              element={
                <RBACGuard allowedRoles={["Super Admin"]}>
                  <Reports />
                </RBACGuard>
              }
            />

            {/* Customer Support Queue (All roles) */}
            <Route path="support" element={<CustomerSupport />} />

            {/* Customers Directory (All roles) */}
            <Route path="customers" element={<Customers />} />

            {/* Customer Reviews (Super Admin & Admin roles) */}
            <Route
              path="reviews"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <Reviews />
                </RBACGuard>
              }
            />

            {/* Digital Wallet & Ledger (Super Admin & Admin roles) */}
            <Route
              path="wallet"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <Wallet />
                </RBACGuard>
              }
            />

            {/* Operational & Financial settings (Super Admin only) */}
            <Route
              path="settings"
              element={
                <RBACGuard allowedRoles={["Super Admin"]}>
                  <Settings />
                </RBACGuard>
              }
            />

            {/* Delivery coverage zones (Super Admin & Admin roles).
                Drives the customer app's "isn't available here yet" gate and is
                re-checked in onOrderCreatedValidateArea, so it needs a real
                editor rather than hand-edits in the Firebase console. */}
            <Route
              path="service-areas"
              element={
                <RBACGuard allowedRoles={["Super Admin", "Admin"]}>
                  <ServiceAreas />
                </RBACGuard>
              }
            />

            {/* Enterprise Security Hardening (Super Admin only) */}
            <Route
              path="security"
              element={
                <RBACGuard allowedRoles={["Super Admin"]}>
                  <SecurityDashboard />
                </RBACGuard>
              }
            />
            <Route
              path="security-settings"
              element={
                <RBACGuard allowedRoles={["Super Admin"]}>
                  <SecuritySettings />
                </RBACGuard>
              }
            />
          </Route>

          {/*
            A silent redirect here is what hid eighteen broken sidebar links:
            every one of them bounced to the Dashboard with no error, in the
            console or on screen, so the pages simply appeared not to load.
            An explicit 404 makes the next mistyped route obvious immediately.
          */}
          <Route
            path="*"
            element={
              <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 p-8 text-center">
                <p className="text-5xl font-semibold text-slate-300">404</p>
                <h1 className="text-lg font-semibold text-slate-800">Page not found</h1>
                <p className="text-sm text-slate-500 max-w-md">
                  <code className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-700">
                    {window.location.pathname}
                  </code>{" "}
                  has no route. If you reached this from the sidebar, the link and
                  the router disagree.
                </p>
                <a
                  href="/dashboard"
                  className="mt-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium"
                >
                  Back to Dashboard
                </a>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
