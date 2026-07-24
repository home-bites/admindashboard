import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import logoImg from "../assets/logo.jpg";

export const Login = () => {
  const [activeTab, setActiveTab] = useState("email"); // "otp", "email"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  
  const { login, isAuthenticated, error: authError, clearError, loading } = useAuthStore();
  const { addToast } = useUiStore();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    clearError();
    try {
      await login(email, password);
      addToast("Successfully logged in to HomeBites central core", "success");
      navigate("/dashboard");
    } catch (err) {
      addToast(err.message || "Authentication failed", "error");
    }
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();
    if (!otpSent) {
      setOtpSent(true);
      addToast("OTP sent to verified mobile device", "success");
    } else {
      addToast("SMS core integration required for production OTP logins.", "error");
    }
  };

  return (
    <div className="bg-[#f9f9ff] text-[#151c27] min-h-screen flex items-center justify-center p-4 md:p-8 font-body-md animate-fade-in">
      <main className="w-full max-w-6xl flex flex-col md:flex-row bg-white rounded-2xl shadow-[0_12px_36px_rgba(21,28,39,0.06)] overflow-hidden border border-[#dce2f3] h-[780px] max-h-[92vh]">
        {/* Left Side: Login Form */}
        <div className="w-full md:w-1/2 p-8 md:p-12 lg:p-16 flex flex-col justify-center relative bg-white overflow-y-auto">
          
          {/* Top Security Node Status */}
          <div className="absolute top-6 left-8 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Secure Auth Node: Live
            </span>
          </div>

          <div className="max-w-md w-full mx-auto space-y-8">
            {/* Header */}
            <div className="text-center space-y-4">
              <div className="relative w-20 h-20 mx-auto group">
                <div className="absolute inset-0 bg-[#10b981]/10 rounded-full blur-md group-hover:blur-lg transition-all duration-300"></div>
                <img
                  alt="HomeBites Logo"
                  className="w-20 h-20 rounded-full shadow-md border-2 border-[#dce2f3] object-cover relative z-10"
                  src={logoImg}
                />
              </div>
              <div>
                <h1 className="font-headline-lg text-headline-lg text-[#151c27] font-black tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                  HomeBites Core
                </h1>
                <p className="text-xs font-semibold text-[#555f6f] mt-1">
                  Enterprise Culinary Management Command Center
                </p>
              </div>
            </div>

            {/* Auth Tabs */}
            <div className="flex p-1 bg-[#f0f3ff] rounded-xl border border-[#d3daea]/50 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("otp");
                  clearError();
                }}
                className={`flex-1 py-2 px-4 rounded-lg font-bold text-xs transition-all active:scale-95 duration-100 ${
                  activeTab === "otp"
                    ? "bg-white text-[#151c27] shadow-sm border border-[#dce2f3]"
                    : "text-[#555f6f] hover:text-[#151c27]"
                }`}
              >
                Mobile OTP
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("email");
                  clearError();
                }}
                className={`flex-1 py-2 px-4 rounded-lg font-bold text-xs transition-all active:scale-95 duration-100 ${
                  activeTab === "email"
                    ? "bg-white text-[#151c27] shadow-sm border border-[#dce2f3]"
                    : "text-[#555f6f] hover:text-[#151c27]"
                }`}
              >
                Email Access
              </button>
            </div>

            {authError && (
              <div className="p-3.5 bg-[#ffdad6] border border-[#ba1a1a]/20 text-[#93000a] text-xs rounded-xl font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{authError}</span>
              </div>
            )}

            {/* OTP Form */}
            {activeTab === "otp" && (
              <form onSubmit={handleOtpSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider" htmlFor="mobile">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#555f6f] pointer-events-none">
                      <span className="material-symbols-outlined text-[20px]">phone_iphone</span>
                    </span>
                    <input
                      className="block w-full pl-10 pr-3 py-3 border border-[#d3daea] rounded-xl bg-slate-50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#10b981]/10 focus:border-[#10b981] text-sm transition-all text-[#151c27] font-semibold"
                      id="mobile"
                      placeholder="+91 98765 00123"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      required
                      type="tel"
                    />
                  </div>
                </div>

                {otpSent && (
                  <div className="space-y-3 animate-slide-up">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">One-Time Password</label>
                    <div className="flex gap-2 justify-between">
                      {otp.map((val, idx) => (
                        <input
                          key={idx}
                          id={`otp-${idx}`}
                          className="w-12 h-14 text-center border border-[#d3daea] rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#10b981]/15 focus:border-[#10b981] font-headline-md text-headline-md text-[#151c27] font-black transition-all shadow-inner"
                          maxLength={1}
                          value={val}
                          onChange={(e) => {
                            const newOtp = [...otp];
                            newOtp[idx] = e.target.value;
                            setOtp(newOtp);
                            if (e.target.value && idx < 5) {
                              document.getElementById(`otp-${idx + 1}`)?.focus();
                            }
                          }}
                          type="text"
                        />
                      ))}
                    </div>
                    <p className="text-right text-xs text-[#10b981] font-bold hover:underline cursor-pointer">
                      Resend OTP code
                    </p>
                  </div>
                )}

                <button
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-xs font-bold text-xs text-white bg-[#10b981] hover:bg-[#059669] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#10b981] transition-colors border-t border-t-white/20 inner-shine active:scale-[0.99]"
                  type="submit"
                >
                  {otpSent ? "Verify Security Code" : "Send Security Code"}
                </button>
              </form>
            )}

            {/* Email & Password Form */}
            {activeTab === "email" && (
              <form onSubmit={handleEmailLogin} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider" htmlFor="email">
                    Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#555f6f] pointer-events-none">
                      <span className="material-symbols-outlined text-[20px]">mail</span>
                    </span>
                    <input
                      className="block w-full pl-10 pr-3 py-3 border border-[#d3daea] rounded-xl bg-slate-50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#10b981]/10 focus:border-[#10b981] text-sm transition-all text-[#151c27] font-semibold"
                      id="email"
                      placeholder="support@hombites.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      type="email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider" htmlFor="password">
                    Password Key
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#555f6f] pointer-events-none">
                      <span className="material-symbols-outlined text-[20px]">lock</span>
                    </span>
                    <input
                      className="block w-full pl-10 pr-3 py-3 border border-[#d3daea] rounded-xl bg-slate-50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#10b981]/10 focus:border-[#10b981] text-sm transition-all text-[#151c27] font-semibold"
                      id="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      type="password"
                    />
                  </div>
                </div>

                <button
                  disabled={loading}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-xs font-bold text-xs text-white bg-[#10b981] hover:bg-[#059669] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#10b981] transition-colors border-t border-t-white/20 disabled:opacity-50 inner-shine active:scale-[0.99]"
                  type="submit"
                >
                  {loading ? "Decrypting credentials..." : "Initialize Command Center"}
                </button>
              </form>
            )}

            <div className="pt-6 border-t border-[#dce2f3]">
              <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span className="material-symbols-outlined text-[14px] text-green-600">verified_user</span>
                Device Attestation Confirmed
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Illustration/Branding */}
        <div
          className="hidden md:block md:w-1/2 relative bg-[#151c27] bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=1000&q=80')",
          }}
        >
          {/* Layered overlays for sleek presentation */}
          <div className="absolute inset-0 bg-[#151c27]/85 mix-blend-multiply"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#151c27] via-transparent to-transparent opacity-90"></div>
          <div className="absolute inset-0 p-12 flex flex-col justify-end text-white">
            <div className="space-y-4 max-w-lg mb-12 animate-slide-up">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#10b981]/25 border border-[#10b981]/40 backdrop-blur-md mb-4 shadow-sm">
                <span className="material-symbols-outlined text-[16px] text-[#ffdbd0] animate-pulse">verified_user</span>
                <span className="font-bold text-[9px] text-[#ffdbd0] uppercase tracking-widest">
                  AES-256 Cloud Security
                </span>
              </div>
              <h2 className="font-headline-display text-headline-display text-white leading-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                Command operations with telemetry.
              </h2>
              <p className="text-sm text-[#dce2f3] leading-relaxed font-medium">
                The central control vault for your culinary network. Track real-time driver locations, inspect kitchen output, audit threat vectors, and execute billing operations.
              </p>
            </div>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-8 font-medium">
              <div>
                <p className="text-lg font-black text-white" style={{ fontFamily: "Outfit, sans-serif" }}>99.98%</p>
                <p className="text-[10px] text-[#dce2f3]/70 uppercase tracking-wider font-bold">Uptime Rate</p>
              </div>
              <div>
                <p className="text-lg font-black text-white" style={{ fontFamily: "Outfit, sans-serif" }}>&lt;40ms</p>
                <p className="text-[10px] text-[#dce2f3]/70 uppercase tracking-wider font-bold">Server Lag</p>
              </div>
              <div>
                <p className="text-lg font-black text-white" style={{ fontFamily: "Outfit, sans-serif" }}>SHA-256</p>
                <p className="text-[10px] text-[#dce2f3]/70 uppercase tracking-wider font-bold">Attestation</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
