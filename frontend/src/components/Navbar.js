import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import LoginModal from "./LoginModal";
import RegisterModal from "./RegisterModal";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("token");
  const userEmail = localStorage.getItem("userEmail") || "User";
  const userRole = localStorage.getItem("userRole") || "user";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userRole");
    navigate("/login");
  };

  const openRegisterModal = () => {
    setShowLoginModal(false);
    setShowRegisterModal(true);
  };

  return (
    <nav aria-label="Main navigation" className="site-nav bg-[#202124] border-b border-[#3c4043] px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-40 text-[#e8eaed]">
      {/* Brand Logo - Google Meet Pure Black & White Style */}
      <div 
        onClick={() => { navigate(token ? "/dashboard" : "/"); setMobileMenuOpen(false); }}
        className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group shrink-0"
      >
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white text-black flex items-center justify-center shadow-md group-hover:bg-slate-200 transition-colors duration-200">
          <svg className="w-5 h-5 sm:w-6 sm:h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="font-bold text-lg sm:text-xl tracking-tight text-white font-sans">
              genzis<span className="text-slate-400">-meet</span>
            </span>
            <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold tracking-wide uppercase bg-white/10 text-white rounded-full border border-white/20">
              Pro
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium hidden sm:block">Video calling for everyone</p>
        </div>
      </div>

      {/* Center Links (Desktop Monochrome) */}
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

      {/* Navigation Controls (Desktop + Mobile Toggle) */}
      <div className="flex items-center gap-2 sm:gap-4">
        {token ? (
          <>
            {userRole === "admin" || userRole === "superAdmin" ? (
              <button
                onClick={() => navigate("/genzies-admin/dashboard")}
                className={`hidden sm:block px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  isActive("/genzies-admin/dashboard")
                    ? "bg-purple-600/30 text-purple-300 border border-purple-500/40"
                    : "text-purple-400 hover:bg-purple-950/40"
                }`}
              >
                Admin Panel
              </button>
            ) : null}

            {/* User Profile Pill */}
            <div className="flex items-center gap-2 sm:gap-3 sm:pl-2 sm:border-l sm:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs shadow-md">
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-semibold text-slate-200 max-w-[120px] truncate">{userEmail}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">{userRole}</p>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                title="Sign Out"
                className="p-1.5 sm:p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className="hidden sm:flex items-center gap-3">
            <button
              onClick={() => setShowLoginModal(true)}
              className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={openRegisterModal}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-black hover:bg-slate-200 transition-colors"
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Mobile Hamburger Toggle Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg bg-[#303134] text-white hover:bg-[#3c4043] transition-colors"
          aria-label="Toggle Navigation Menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-[#202124] border-b border-[#3c4043] p-4 flex flex-col gap-3 text-sm shadow-xl z-50">
          <Link to="/" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-white hover:bg-[#303134]">
            Home
          </Link>
          <a href="/#features" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-slate-300 hover:bg-[#303134]">
            Features
          </a>
          <a href="/#how-it-works" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-slate-300 hover:bg-[#303134]">
            How it works
          </a>
          <a href="/#security" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-slate-300 hover:bg-[#303134]">
            Security
          </a>
          {token && (
            <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-white font-semibold bg-[#303134]">
              Dashboard
            </Link>
          )}
          {token && (userRole === "admin" || userRole === "superAdmin") && (
            <Link to="/genzies-admin/dashboard" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-purple-300 font-semibold bg-purple-900/30 border border-purple-500/30">
              Admin Panel
            </Link>
          )}
          {!token && (
            <div className="flex flex-col gap-2 pt-2 border-t border-[#3c4043]">
              <button
                onClick={() => { setMobileMenuOpen(false); setShowLoginModal(true); }}
                className="w-full py-2.5 rounded-lg border border-[#3c4043] text-white font-medium hover:bg-[#303134]"
              >
                Sign In
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); openRegisterModal(); }}
                className="w-full py-2.5 rounded-lg bg-white text-black font-semibold hover:bg-slate-200"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      )}

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
      {showRegisterModal && (
        <RegisterModal
          onClose={() => setShowRegisterModal(false)}
          onRegistered={() => {
            setShowRegisterModal(false);
            setShowLoginModal(true);
          }}
        />
      )}
    </nav>
  );
}

export default Navbar;
