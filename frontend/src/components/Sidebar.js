import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

const links = [
  { path: "/dashboard", label: "Overview", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { path: "/dashboard/meetings", label: "Meetings", icon: "M15 10l4.5-2.2v8.4L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
  { path: "/dashboard/history", label: "History", icon: "M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { path: "/dashboard/recordings", label: "Recordings", icon: "M15 10l4.5-2.2v8.4L15 14M5 6h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" },
  { path: "/dashboard/announcements", label: "Announcements", icon: "M4 11a8 8 0 0116 0v5H4v-5zM9 20h6M12 3v2" },
  { path: "/dashboard/settings", label: "Settings", icon: "M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 00-1.9-.3l-.4.2a1.7 1.7 0 00-1 1.5v.1h-2.4V20a1.7 1.7 0 00-1-1.5l-.4-.2a1.7 1.7 0 00-1.9.3l-.1.1-1.7-1.7.1-.1a1.7 1.7 0 00.3-1.9l-.2-.4a1.7 1.7 0 00-1.5-1H7v-2.4h.1a1.7 1.7 0 001.5-1l.2-.4a1.7 1.7 0 00-.3-1.9l-.1-.1 1.7-1.7.1.1a1.7 1.7 0 001.9.3l.4-.2a1.7 1.7 0 001-1.5V4h2.4v.1a1.7 1.7 0 001 1.5l.4.2a1.7 1.7 0 001.9-.3l.1-.1 1.7 1.7-.1.1a1.7 1.7 0 00-.3 1.9l.2.4a1.7 1.7 0 001.5 1h.1v2.4h-.1a1.7 1.7 0 00-1.5 1l-.2.4z" }
];

function Sidebar({ onThemeChange, theme: controlledTheme }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [open, setOpen] = useState(false);
  const userEmail = localStorage.getItem("userEmail") || "User";
  const userRole = localStorage.getItem("userRole") || "user";
  const activeTheme = controlledTheme || theme;
  const isLight = activeTheme === "light";

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(activeTheme);
    localStorage.setItem("theme", activeTheme);
    onThemeChange?.(activeTheme);
  }, [activeTheme, onThemeChange]);

  const toggleTheme = () => {
    const nextTheme = activeTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    onThemeChange?.(nextTheme);
  };
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userRole");
    navigate("/");
  };

  const panelClass = isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#121b35] border-[#0f3460]/70 text-slate-100";
  const linkClass = (path) => location.pathname === path
    ? (isLight ? "bg-[#533483]/10 text-[#533483]" : "bg-[#8ab4f8]/10 text-[#8ab4f8]")
    : (isLight ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900" : "text-slate-400 hover:bg-[#0f3460]/50 hover:text-white");

  return (
    <>
      <div className={`fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b px-4 lg:hidden ${panelClass}`}>
        <button onClick={() => setOpen(true)} aria-label="Open dashboard navigation" className="rounded-lg p-2 hover:bg-slate-500/10">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <Link to="/dashboard" className="font-bold tracking-tight">genzis<span className={isLight ? "text-[#533483]" : "text-[#8ab4f8]"}>-meet</span></Link>
        <button onClick={toggleTheme} aria-label="Toggle theme" className="rounded-lg p-2 text-lg hover:bg-slate-500/10">{isLight ? "☾" : "☀"}</button>
      </div>

      {open && <button aria-label="Close dashboard navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden" />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 max-h-screen h-[100dvh] flex-col justify-between border-r px-3.5 py-4 transition-transform duration-200 overflow-y-auto no-scrollbar lg:translate-x-0 ${panelClass} ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div>
          <div className="flex items-center justify-between px-2.5">
            <Link to="/dashboard" onClick={() => setOpen(false)} className="text-xl font-bold tracking-tight">genzis<span className={isLight ? "text-[#533483]" : "text-[#8ab4f8]"}>-meet</span></Link>
            <button onClick={() => setOpen(false)} aria-label="Close dashboard navigation" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-500/10 lg:hidden">×</button>
          </div>
          <p className={`px-2.5 pt-0.5 text-[9px] uppercase tracking-[0.2em] font-semibold ${isLight ? "text-slate-400" : "text-slate-500"}`}>Workspace</p>

          <nav className="mt-4 space-y-0.5" aria-label="Dashboard navigation">
            {links.map((link) => (
              <Link key={link.path} to={link.path} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${linkClass(link.path)}`}>
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={link.icon} /></svg>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className={`mt-4 border-t pt-3 ${isLight ? "border-slate-200" : "border-[#0f3460]"}`}>
          <div className="mb-2.5 flex items-center gap-2.5 px-2">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isLight ? "bg-[#533483] text-white" : "bg-white text-black"}`}>{userEmail.charAt(0).toUpperCase()}</div>
            <div className="min-w-0"><p className="truncate text-xs font-semibold">{userEmail}</p><p className={`text-[9px] uppercase tracking-wider ${isLight ? "text-slate-500" : "text-slate-400"}`}>{userRole}</p></div>
          </div>
          <button onClick={toggleTheme} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold ${isLight ? "text-slate-600 hover:bg-slate-100" : "text-slate-400 hover:bg-[#0f3460]/50 hover:text-white"}`}><span className="w-4 text-center">{isLight ? "☾" : "☀"}</span>{isLight ? "Dark mode" : "Light mode"}</button>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10"><span className="w-4 text-center">↪</span>Sign out</button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
