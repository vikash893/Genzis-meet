import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import LoginModal from "./LoginModal";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("token");
  const userEmail = localStorage.getItem("userEmail") || "User";
  const userRole = localStorage.getItem("userRole") || "user";
  const [showLoginModal, setShowLoginModal] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userRole");
    navigate("/login");
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav aria-label="Main navigation" className="site-nav bg-[#202124] border-b border-[#3c4043] px-6 py-3 flex items-center justify-between sticky top-0 z-40 text-[#e8eaed]">
      {/* Brand Logo - Google Meet Pure Black & White Style */}
      <div 
        onClick={() => navigate(token ? "/dashboard" : "/")}
        className="flex items-center gap-3 cursor-pointer group"
      >
        <div className="w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center shadow-md group-hover:bg-slate-200 transition-colors duration-200">
          <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-xl tracking-tight text-white font-sans">
              genzis<span className="text-slate-400">-meet</span>
            </span>
            <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-white/10 text-white rounded-full border border-white/20">
              Pro
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Video calling for everyone</p>
        </div>
      </div>

      {/* Center Links (Monochrome Google Style) */}
      <div className="nav-links hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
        <Link to="/" className={`hover:text-white transition-colors ${isActive("/") ? "text-white font-semibold underline underline-offset-8 decoration-white" : ""}`}>
          Home
        </Link>
        <a href="/#features" className="hover:text-white transition-colors">Features</a>
        <a href="/#how-it-works" className="hover:text-white transition-colors">How it works</a>
        <a href="/#security" className="hover:text-white transition-colors">Security</a>
        {token && (
          <Link to="/dashboard" className={`hover:text-white transition-colors ${isActive("/dashboard") ? "text-white font-semibold underline underline-offset-8 decoration-white" : ""}`}>
            Dashboard
          </Link>
        )}
      </div>

      {/* Navigation & Profile Controls */}
      <div className="flex items-center gap-4">
        {token ? (
          <>
            {userRole === "admin" || userRole === "superAdmin" ? (
              <button
                onClick={() => navigate("/genzies-admin/dashboard")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  isActive("/genzies-admin/dashboard")
                    ? "bg-purple-600/30 text-purple-300 border border-purple-500/40"
                    : "text-purple-400 hover:bg-purple-950/40"
                }`}
              >
                Admin Panel
              </button>
            ) : null}

            {/* User Profile Pill */}
            <div className="flex items-center gap-3 pl-2 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-slate-200 max-w-[120px] truncate">{userEmail}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">{userRole}</p>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                title="Sign Out"
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowLoginModal(true)}
              className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </button>
          </div>
        )}
      </div>
      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </nav>
  );
}

export default Navbar;
