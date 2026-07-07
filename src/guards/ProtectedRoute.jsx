import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import { auth } from "../firebase/firebaseConfig";

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  const { setLastVisitedPage } = useUiStore();
  const location = useLocation();
  const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";

  useEffect(() => {
    if (isAuthenticated && (isMock || auth.currentUser)) {
      setLastVisitedPage(location.pathname + location.search);
    }
  }, [isAuthenticated, isMock, location, setLastVisitedPage]);

  if (!isAuthenticated || (!isMock && !auth.currentUser)) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};
export default ProtectedRoute;
