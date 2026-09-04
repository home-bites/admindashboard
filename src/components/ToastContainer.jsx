import React from "react";
import { useUiStore } from "../store/uiStore";

export const ToastContainer = () => {
  const { toasts, removeToast } = useUiStore();

  if (toasts.length === 0) return null;

  const getToastStyles = (type) => {
    switch (type) {
      case "success":
        return {
          bg: "bg-[#ecfdf5] border-[#10b981]/30 text-[#065f46]",
          icon: "check_circle",
          iconColor: "text-[#10b981]"
        };
      case "error":
        return {
          bg: "bg-[#ffdad6] border-[#ba1a1a]/30 text-[#93000a]",
          icon: "error",
          iconColor: "text-[#ba1a1a]"
        };
      case "warning":
        return {
          bg: "bg-[#fff8e1] border-[#ffb59d]/30 text-[#5f1900]",
          icon: "warning",
          iconColor: "text-[#10b981]"
        };
      case "info":
      default:
        return {
          bg: "bg-[#e7eefe] border-[#outline-variant]/30 text-[#121c2a]",
          icon: "info",
          iconColor: "text-[#primary]"
        };
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full">
      {toasts.map((toast) => {
        const styles = getToastStyles(toast.type);
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg animate-[fadeIn_0.2s_ease-out] ${styles.bg}`}
          >
            <span className={`material-symbols-outlined shrink-0 ${styles.iconColor}`} style={{ fontSize: "20px" }}>
              {styles.icon}
            </span>
            <div className="flex-1 font-body-sm text-body-sm leading-normal">
              {toast.title && <div className="font-bold text-xs mb-0.5">{toast.title}</div>}
              <div>
                {typeof toast.message === "string"
                  ? toast.message
                  : (toast.message?.message || toast.message?.title || String(toast.message || ""))}
              </div>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-on-surface-variant hover:text-on-surface shrink-0"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                close
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
};
export default ToastContainer;
