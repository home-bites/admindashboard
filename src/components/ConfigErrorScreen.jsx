import React from "react";
import logoImg from "../assets/logo.jpg";

export const ConfigErrorScreen = () => {
  return (
    <div className="min-h-screen bg-[#f9f9ff] text-[#151c27] flex flex-col items-center justify-center p-6 select-none font-body-md">
      <div className="bg-white border border-[#cbd5e1] rounded-2xl p-8 max-w-lg w-full shadow-lg text-center space-y-6 relative overflow-hidden">
        {/* Top accent line */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-[#10b981]"></div>

        {/* Branding */}
        <div className="flex flex-col items-center gap-2">
          <img
            src={logoImg}
            alt="HomeBites Logo"
            className="w-16 h-16 rounded-full object-cover border border-[#cbd5e1] shadow"
          />
          <h1 className="font-headline-lg text-headline-lg font-bold text-[#10b981] leading-none">HomeBites</h1>
          <span className="text-[10px] text-[#555f6f] tracking-wider uppercase font-semibold">Kitchen Admin Panel</span>
        </div>

        {/* Error Details */}
        <div className="space-y-3">
          <div className="w-16 h-16 bg-[#ffdad6] text-[#ba1a1a] rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-4xl">cloud_off</span>
          </div>
          <h3 className="font-headline-md text-headline-md font-semibold text-[#151c27]">Firebase Configuration Missing</h3>
          <p className="font-body-sm text-body-sm text-[#555f6f]">
            The application cannot connect to the server because Firebase environment configuration is missing, and offline mock mode is disabled.
          </p>
        </div>

        {/* How to Resolve */}
        <div className="bg-[#f0f3ff] p-4 rounded-xl border border-[#dce2f3]/50 text-left space-y-3">
          <h4 className="font-label-sm text-label-sm text-[#151c27] uppercase tracking-wider font-bold">To fix this issue:</h4>
          <ul className="text-xs text-[#555f6f] list-disc list-inside space-y-1.5 leading-relaxed">
            <li>
              Define your Firebase credentials in your <code className="bg-white px-1.5 py-0.5 rounded border border-[#d3daea] font-mono text-[11px]">.env</code> file.
            </li>
            <li>
              Or, explicitly enable local mock data execution for preview purposes by setting:
              <pre className="bg-white p-2 rounded border border-[#d3daea] font-mono text-[10px] text-[#10b981] mt-1 overflow-x-auto">
                VITE_ENABLE_MOCK_DATA=true
              </pre>
            </li>
          </ul>
        </div>

        <div className="pt-2">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white font-label-md text-label-md rounded-lg shadow transition-all hover:shadow-md active:scale-95 duration-100 flex items-center justify-center gap-2 mx-auto"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigErrorScreen;
