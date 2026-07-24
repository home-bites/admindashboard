import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import { auth } from "../firebase/firebaseConfig";

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore();
  const { setLastVisitedPage } = useUiStore();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated && user) {
      setLastVisitedPage(location.pathname + location.search);
    }
  }, [isAuthenticated, user, location, setLastVisitedPage]);

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};
export default ProtectedRoute;
