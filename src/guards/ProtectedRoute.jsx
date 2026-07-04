import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  const { setLastVisitedPage } = useUiStore();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      setLastVisitedPage(location.pathname + location.search);
    }
  }, [isAuthenticated, location, setLastVisitedPage]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};
export default ProtectedRoute;
