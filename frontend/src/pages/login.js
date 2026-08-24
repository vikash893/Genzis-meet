import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { ENDPOINTS } from "../api";

function Login({ defaultTab }) {
  const navigate = useNavigate();
  const activeTab = defaultTab || "user"; // "user" | "admin"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint =
      activeTab === "user"
        ? ENDPOINTS.USER_LOGIN
        : ENDPOINTS.ADMIN_LOGIN;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Login failed");
        return;
      }

      // Save credentials & role
      localStorage.setItem("token", data.token);
      localStorage.setItem("userEmail", email);
      localStorage.setItem("userRole", activeTab === "admin" ? "admin" : "user");

      if (activeTab === "admin") {
        navigate("/genzies-admin/dashboard");
      } else {
        navigate("/dashboard");
      }

    } catch (err) {
      setError("Unable to connect to backend server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#202124] text-[#e8eaed] font-sans">
      <Navbar />

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#2d2f31] border border-[#3c4043] rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          {/* Top accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#8ab4f8]"></div>

          {/* Show Tab Bar only on /genzies-admin endpoint */}
          {defaultTab === "admin" && (
            <div className="flex bg-[#202124] p-1.5 rounded-xl border border-[#3c4043] mb-8">
              <button
                type="button"
                className="flex-1 py-2.5 text-xs font-semibold rounded-lg bg-[#1a73e8] text-white shadow-md cursor-default"
              >
                🔒 genzies-admin Security Portal
              </button>
            </div>
          )}

          <div className="text-center mb-8">
            <h2 className="text-2xl font-normal text-white tracking-tight">
              {activeTab === "user" ? "Sign in to genzis-meet" : "Admin Sign In"}
            </h2>
            <p className="text-[#9aa0a6] text-xs mt-2">
              {activeTab === "user"
                ? "Access your video meeting dashboard"
                : "Manage system configurations and users"}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3">
              <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-[#bdc1c6] uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#202124] border border-[#3c4043] text-white placeholder-[#5f6368] focus:outline-none focus:border-[#8ab4f8] transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#bdc1c6] uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#202124] border border-[#3c4043] text-white placeholder-[#5f6368] focus:outline-none focus:border-[#8ab4f8] transition-all text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 px-4 text-white font-medium rounded-xl shadow-md transition-all duration-200 text-sm flex items-center justify-center gap-2 ${
                activeTab === "admin"
                  ? "bg-purple-600 hover:bg-purple-500"
                  : "bg-[#1a73e8] hover:bg-[#1557b0]"
              }`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Signing In...</span>
                </>
              ) : (
                `Sign In as ${activeTab === "admin" ? "Admin" : "User"}`
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}

export default Login;