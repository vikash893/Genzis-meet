import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import LoginModal from "./LoginModal";
import RegisterModal from "./RegisterModal";

function Navbar({ onThemeChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("token");
  const userEmail = localStorage.getItem("userEmail") || "User";
  const userRole = localStorage.getItem("userRole") || "user";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    localStorage.setItem("theme", theme);
    if (onThemeChange) onThemeChange(theme);
  }, [theme, onThemeChange]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

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

  const isLight = theme === "light";

  return (
    <nav
      aria-label="Main navigation"
      className={`site-nav px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-40 transition-colors duration-300 border-b ${
        isLight
          ? "bg-white border-slate-200 text-slate-900 shadow-sm"
          : "bg-[#16213e] border-[#0f3460]/50 text-slate-100"
      }`}
    >
      {/* Brand Logo */}
      <div 
        onClick={() => { navigate(token ? "/dashboard" : "/"); setMobileMenuOpen(false); }}
        className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group shrink-0"
      >
        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-md transition-colors duration-200 ${
          isLight ? "bg-[#533483] text-white" : "bg-white text-black group-hover:bg-slate-200"
        }`}>
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className={`font-bold text-lg sm:text-xl tracking-tight font-sans ${isLight ? "text-slate-900" : "text-white"}`}>
              genzis<span className={isLight ? "text-[#533483]" : "text-[#8ab4f8]"}>-meet</span>
            </span>
            <span className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold tracking-wide uppercase rounded-full border ${
              isLight ? "bg-[#533483]/10 text-[#533483] border-[#533483]/20" : "bg-white/10 text-white border-white/20"
            }`}>
              Pro
            </span>
          </div>
          <p className={`text-[10px] sm:text-[11px] font-medium hidden sm:block ${isLight ? "text-slate-500" : "text-slate-400"}`}>Video calling for everyone</p>
        </div>
      </div>

      {/* Right Actions & Theme Toggle */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 ${
            isLight
              ? "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
              : "bg-[#0f3460] border-[#533483]/30 text-slate-200 hover:bg-[#533483]/50"
          }`}
          title={isLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
        >
          {isLight ? (
            <>
              <span className="text-base">🌙</span>
              <span className="hidden sm:inline">Dark</span>
            </>
          ) : (
            <>
              <span className="text-base">☀️</span>
              <span className="hidden sm:inline">Light</span>
            </>
          )}
        </button>

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
            <div className="flex items-center gap-2 sm:gap-3 sm:pl-2 sm:border-l sm:border-slate-700">
              <div 
                onClick={() => navigate("/dashboard")}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-md cursor-pointer ${
                  isLight ? "bg-[#533483] text-white" : "bg-white text-black"
                }`}
              >
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block text-left cursor-pointer" onClick={() => navigate("/dashboard")}>
                <p className={`text-xs font-semibold max-w-[120px] truncate ${isLight ? "text-slate-900" : "text-slate-200"}`}>{userEmail}</p>
                <p className={`text-[10px] uppercase tracking-wider ${isLight ? "text-slate-500" : "text-slate-400"}`}>{userRole}</p>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                title="Sign Out"
                className={`p-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                  isLight ? "hover:bg-slate-100 text-slate-600 hover:text-red-600" : "hover:bg-[#0f3460] text-slate-400 hover:text-red-400"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLoginModal(true)}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all active:scale-95 ${
                isLight ? "hover:bg-slate-100 text-slate-800" : "hover:bg-[#0f3460] text-white"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setShowRegisterModal(true)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 ${
                isLight ? "bg-[#533483] text-white hover:bg-[#533483]/90" : "bg-white text-black hover:bg-slate-200"
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Mobile Toggle (when logged in or out) */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white"
          aria-label="Toggle navigation menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className={`absolute top-full left-0 right-0 p-4 border-b md:hidden shadow-2xl flex flex-col gap-2 z-50 ${
          isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#16213e] border-[#0f3460]"
        }`}>
          <Link to="/" onClick={() => setMobileMenuOpen(false)} className="py-2 px-3 text-sm font-semibold rounded-lg hover:bg-white/5">Home</Link>
          {token && (
            <>
              <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)} className="py-2 px-3 text-sm font-semibold rounded-lg hover:bg-white/5">Dashboard</Link>
              <button onClick={() => { setMobileMenuOpen(false); handleLogout(); }} className="py-2 px-3 text-left text-sm font-semibold text-red-400 hover:bg-red-500/10 rounded-lg">Sign out</button>
            </>
          )}
        </div>
      )}

      {showLoginModal && (
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onOpenRegister={openRegisterModal}
        />
      )}

      {showRegisterModal && (
        <RegisterModal
          isOpen={showRegisterModal}
          onClose={() => setShowRegisterModal(false)}
          onOpenLogin={() => { setShowRegisterModal(false); setShowLoginModal(true); }}
        />
      )}
    </nav>
  );
}

export default Navbar;
