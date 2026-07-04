import React from "react";
import { useAuthStore } from "../store/authStore";
import * as LoadingComponents from "../components/LoadingComponents";

export const RBACGuard = ({ children, allowedRoles }) => {
  const { user, loading, isAuthenticated } = useAuthStore();

  // Show loading screen if the store is loading or if authenticated but user info/role is not yet resolved
  if (loading || (isAuthenticated && !user)) {
    return <LoadingComponents.LoadingPage />;
  }

  // If there's no user session, let the ProtectedRoute redirect to /login
  if (!user) {
    return null;
  }

  const userRole = user.role;

  // Prevent accessing if user has no role defined
  if (!userRole) {
    return (
      <div className="flex-grow p-8 bg-[#f9f9ff] flex flex-col justify-center items-center text-center">
        <div className="bg-white border border-[#dce2f3] rounded-xl p-8 max-w-md shadow-sm space-y-5">
          <div className="w-14 h-14 bg-[#ffdad6] text-[#ba1a1a] rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-3xl">gpp_bad</span>
          </div>
          <div className="space-y-1">
            <h3 className="font-headline-md text-headline-md font-semibold text-[#151c27]">Access Denied</h3>
            <p className="font-body-sm text-body-sm text-[#555f6f]">
              Your account does not have a role configured in the database.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Check if role is allowed
  const isAllowed = allowedRoles.includes(userRole);

  if (!isAllowed) {
    return (
      <div className="flex-grow p-8 bg-[#f9f9ff] flex flex-col justify-center items-center text-center">
        <div className="bg-white border border-[#dce2f3] rounded-xl p-8 max-w-md shadow-sm space-y-5">
          <div className="w-14 h-14 bg-[#ffdad6] text-[#ba1a1a] rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-3xl">gpp_bad</span>
          </div>
          <div className="space-y-1">
            <h3 className="font-headline-md text-headline-md font-semibold text-[#151c27]">Access Denied</h3>
            <p className="font-body-sm text-body-sm text-[#555f6f]">
              You do not have permission to access this page. This resource is restricted to {allowedRoles.join(", ")} roles.
            </p>
          </div>
          <div className="font-label-sm text-label-sm text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded inline-block">
            Your role: {userRole}
          </div>
        </div>
      </div>
    );
  }

  return children;
};

export default RBACGuard;

