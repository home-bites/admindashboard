import React from "react";

// Spinner component
export const Spinner = ({ className = "w-5 h-5" }) => (
  <svg className={`animate-spin text-current ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// Full Page loading component
export const LoadingPage = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#f9f9ff] text-[#555f6f] gap-4">
      <div className="flex flex-col items-center gap-3">
        {/* Animated logo silhouette */}
        <div className="w-16 h-16 rounded-full bg-[#10b981] flex items-center justify-center animate-bounce shadow">
          <span className="material-symbols-outlined text-white text-3xl">restaurant</span>
        </div>
        <p className="font-label-md text-label-md tracking-wider text-[#10b981] animate-pulse">HOMEBITES</p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Spinner className="w-4 h-4 text-[#10b981]" />
        <span>Loading Admin Panel...</span>
      </div>
    </div>
  );
};

// Loading card skeleton
export const LoadingCard = () => {
  return (
    <div className="bg-white border border-[#dce2f3] rounded-lg p-5 flex flex-col gap-4 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-4 bg-slate-200 rounded w-24"></div>
        <div className="h-8 bg-slate-200 rounded-lg w-8"></div>
      </div>
      <div className="h-8 bg-slate-200 rounded w-32"></div>
      <div className="h-4 bg-slate-200 rounded w-20"></div>
    </div>
  );
};

// Loading table skeleton
export const LoadingTable = ({ rows = 5 }) => {
  return (
    <div className="w-full space-y-4 animate-pulse">
      <div className="h-10 bg-slate-200 rounded-lg w-full"></div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="flex gap-4 items-center py-3 px-4 border-b border-[#f0f3ff]">
            <div className="h-5 bg-slate-100 rounded w-1/4"></div>
            <div className="h-5 bg-slate-100 rounded w-1/4"></div>
            <div className="h-5 bg-slate-100 rounded w-1/4"></div>
            <div className="h-5 bg-slate-100 rounded w-1/8"></div>
            <div className="h-5 bg-slate-100 rounded w-1/8 ml-auto"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Loading button wrapper
export const LoadingButton = ({ loading, children, className = "", onClick, type = "button", ...props }) => {
  return (
    <button
      type={type}
      disabled={loading}
      onClick={onClick}
      className={`relative flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {loading && <Spinner className="w-4 h-4" />}
      <span>{children}</span>
    </button>
  );
};
