import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { ENDPOINTS } from "../api";

function AdminDashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const userRole = localStorage.getItem("userRole");

  const [activeTab, setActiveTab] = useState("user-tracking"); // "user-tracking" | "announcements" | "register-user" | "create-admin"
  
  // Announcement Form
  const [announcementText, setAnnouncementText] = useState("");
  const [announceMessage, setAnnounceMessage] = useState("");
  const [announceLoading, setAnnounceLoading] = useState(false);

  // Register User Form
  const [userForm, setUserForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [userMsg, setUserMsg] = useState("");
  const [userLoading, setUserLoading] = useState(false);

  // Create Admin Form
  const [adminForm, setAdminForm] = useState({ name: "", email: "", role: "admin", password: "" });
  const [adminMsg, setAdminMsg] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  // Stats
  const [announcements, setAnnouncements] = useState([]);
  const [activeMeetings, setActiveMeetings] = useState([]);

  // Analytics State
  const [userAnalytics, setUserAnalytics] = useState(null);

  useEffect(() => {
    if (!token || (userRole !== "admin" && userRole !== "superAdmin")) {
      navigate("/dashboard");
      return;
    }
    fetchData();
    fetchUserAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, userRole, navigate]);

  const fetchUserAnalytics = async () => {
    try {
      const res = await fetch(ENDPOINTS.ADMIN_USER_ANALYTICS, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setUserAnalytics(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchData = async () => {
    try {
      const annRes = await fetch(ENDPOINTS.ANNOUNCEMENT_ALL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const annData = await annRes.json();
      if (annRes.ok && annData.notifications) setAnnouncements(annData.notifications.reverse());

      const meetRes = await fetch(ENDPOINTS.MEETING_ACTIVE, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const meetData = await meetRes.json();
      if (meetRes.ok && meetData.meetings) setActiveMeetings(meetData.meetings);
    } catch (err) {
      console.error(err);
    }
  };

  // Publish Announcement
  const handlePublishAnnouncement = async (e) => {
    e.preventDefault();
    setAnnounceMessage("");
    setAnnounceLoading(true);

    try {
      const res = await fetch(ENDPOINTS.ANNOUNCEMENT_PUBLISH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ information: announcementText })
      });

      const data = await res.json();
      if (res.ok) {
        setAnnounceMessage("Announcement published successfully!");
        setAnnouncementText("");
        fetchData();
      } else {
        setAnnounceMessage(data.error || "Failed to publish");
      }
    } catch (err) {
      setAnnounceMessage("Error connecting to server");
    } finally {
      setAnnounceLoading(false);
    }
  };

  // Register User via Admin
  const handleRegisterUser = async (e) => {
    e.preventDefault();
    setUserMsg("");
    setUserLoading(true);

    try {
      const res = await fetch(ENDPOINTS.ADMIN_REGISTER_USER, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userForm)
      });
      const data = await res.json();
      if (res.ok) {
        setUserMsg("User registered successfully!");
        setUserForm({ name: "", email: "", phone: "", password: "" });
      } else {
        setUserMsg(data.error || "Registration failed");
      }
    } catch (err) {
      setUserMsg("Error connecting to server");
    } finally {
      setUserLoading(false);
    }
  };

  // Create Admin
  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setAdminMsg("");
    setAdminLoading(true);

    try {
      const res = await fetch(ENDPOINTS.ADMIN_CREATE_ADMIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminForm)
      });
      const data = await res.json();
      if (res.ok) {
        setAdminMsg("Admin created successfully!");
        setAdminForm({ name: "", email: "", role: "admin", password: "" });
      } else {
        setAdminMsg(data.error || "Failed to create admin");
      }
    } catch (err) {
      setAdminMsg("Error connecting to server");
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(168,85,247,0.2),rgba(255,255,255,0))]">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-black text-white">Admin Control Center</h1>
              <span className="px-3 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded-full text-xs font-bold uppercase">
                {userRole}
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-1">Global management dashboard for NexusMeet</p>
          </div>
        </div>

        {/* Stats Summary Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="glass-card rounded-2xl p-6 flex items-center justify-between border-l-4 border-purple-500">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Meetings</p>
              <h3 className="text-3xl font-extrabold text-white mt-1">{activeMeetings.length}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xl">
              🎥
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 flex items-center justify-between border-l-4 border-indigo-500">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Announcements</p>
              <h3 className="text-3xl font-extrabold text-white mt-1">{announcements.length}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xl">
              📢
            </div>
          </div>
        </div>

        {/* Main Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Action Tabs & Form Column */}
          <div className="lg:col-span-2 glass-panel rounded-2xl p-6">
            <div className="flex bg-slate-900 p-1.5 rounded-xl border border-slate-800 mb-6">
              <button
                onClick={() => setActiveTab("user-tracking")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "user-tracking" ? "bg-[#1a73e8] text-white" : "text-[#9aa0a6] hover:text-white"
                }`}
              >
                📊 User Tracking & Stats
              </button>
              <button
                onClick={() => setActiveTab("announcements")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "announcements" ? "bg-[#1a73e8] text-white" : "text-[#9aa0a6] hover:text-white"
                }`}
              >
                Publish Announcement
              </button>
              <button
                onClick={() => setActiveTab("register-user")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "register-user" ? "bg-[#1a73e8] text-white" : "text-[#9aa0a6] hover:text-white"
                }`}
              >
                Register User
              </button>
              <button
                onClick={() => setActiveTab("create-admin")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "create-admin" ? "bg-[#1a73e8] text-white" : "text-[#9aa0a6] hover:text-white"
                }`}
              >
                Create Admin
              </button>
            </div>

            {/* TAB 0: User Tracking & Stats */}
            {activeTab === "user-tracking" && (
              <div>
                <h3 className="text-lg font-bold text-white mb-1">User Tracking & Activity Log</h3>
                <p className="text-xs text-[#9aa0a6] mb-4">Track total registered users, meetings hosted, and participation</p>

                {userAnalytics ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3 bg-[#202124] p-3 rounded-xl border border-[#3c4043] text-center text-xs">
                      <div>
                        <span className="text-[#9aa0a6]">Total Users</span>
                        <p className="text-lg font-bold text-white mt-0.5">{userAnalytics.totalUsers}</p>
                      </div>
                      <div>
                        <span className="text-[#9aa0a6]">Total Meetings</span>
                        <p className="text-lg font-bold text-[#8ab4f8] mt-0.5">{userAnalytics.totalMeetingsInSystem}</p>
                      </div>
                      <div>
                        <span className="text-[#9aa0a6]">Active Meetings</span>
                        <p className="text-lg font-bold text-emerald-400 mt-0.5">{userAnalytics.activeMeetingsCount}</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-[#3c4043] rounded-xl max-h-[300px]">
                      <table className="w-full text-left text-xs text-[#e8eaed]">
                        <thead className="bg-[#202124] border-b border-[#3c4043] text-[#9aa0a6] uppercase text-[10px]">
                          <tr>
                            <th className="p-3">User Name</th>
                            <th className="p-3">Email Address</th>
                            <th className="p-3 text-center">Hosted Meetings</th>
                            <th className="p-3 text-center">Active Rooms</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#3c4043]">
                          {userAnalytics.users.map((u) => (
                            <tr key={u.id} className="hover:bg-[#303134]">
                              <td className="p-3 font-semibold text-white">{u.name}</td>
                              <td className="p-3 text-[#9aa0a6]">{u.email}</td>
                              <td className="p-3 text-center font-mono font-bold text-[#8ab4f8]">{u.totalMeetingsHosted}</td>
                              <td className="p-3 text-center font-mono text-emerald-400">{u.activeMeetingsHosted}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-[#9aa0a6]">Loading user analytics...</div>
                )}
              </div>
            )}

            {/* TAB 1: Announcement */}
            {activeTab === "announcements" && (
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Publish Global Announcement</h3>
                <p className="text-xs text-slate-400 mb-4">Broadcast important updates to all users</p>

                {announceMessage && (
                  <div className="mb-4 p-3 rounded-lg bg-slate-800 text-purple-300 text-xs border border-purple-500/30">
                    {announceMessage}
                  </div>
                )}

                <form onSubmit={handlePublishAnnouncement} className="space-y-4">
                  <textarea
                    required
                    rows={4}
                    placeholder="Type broadcast message here..."
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    className="w-full p-4 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    disabled={announceLoading}
                    className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm transition-all"
                  >
                    {announceLoading ? "Publishing..." : "Broadcast Announcement"}
                  </button>
                </form>
              </div>
            )}

            {/* TAB 2: Register User */}
            {activeTab === "register-user" && (
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Register New User</h3>
                <p className="text-xs text-slate-400 mb-4">Directly provision user account</p>

                {userMsg && (
                  <div className="mb-4 p-3 rounded-lg bg-slate-800 text-purple-300 text-xs border border-purple-500/30">
                    {userMsg}
                  </div>
                )}

                <form onSubmit={handleRegisterUser} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Full Name"
                      required
                      value={userForm.name}
                      onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm"
                    />
                    <input
                      type="email"
                      placeholder="Email Address"
                      required
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="tel"
                      placeholder="Phone Number"
                      required
                      value={userForm.phone}
                      onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm"
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      required
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={userLoading}
                    className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm transition-all"
                  >
                    {userLoading ? "Registering..." : "Register User"}
                  </button>
                </form>
              </div>
            )}

            {/* TAB 3: Create Admin */}
            {activeTab === "create-admin" && (
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Create Admin Account</h3>
                <p className="text-xs text-slate-400 mb-4">Grant administrative privileges</p>

                {adminMsg && (
                  <div className="mb-4 p-3 rounded-lg bg-slate-800 text-purple-300 text-xs border border-purple-500/30">
                    {adminMsg}
                  </div>
                )}

                <form onSubmit={handleCreateAdmin} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Admin Name"
                      required
                      value={adminForm.name}
                      onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm"
                    />
                    <input
                      type="email"
                      placeholder="Admin Email"
                      required
                      value={adminForm.email}
                      onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <select
                      value={adminForm.role}
                      onChange={(e) => setAdminForm({ ...adminForm, role: e.target.value })}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm"
                    >
                      <option value="admin">Admin</option>
                      <option value="superAdmin">Super Admin</option>
                    </select>
                    <input
                      type="password"
                      placeholder="Password"
                      required
                      value={adminForm.password}
                      onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={adminLoading}
                    className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm transition-all"
                  >
                    {adminLoading ? "Creating..." : "Create Admin"}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Announcements Feed Preview */}
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Announcements History</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {announcements.map((a) => (
                <div key={a._id} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <p className="text-xs text-purple-300 font-semibold">{a.sender_email}</p>
                  <p className="text-sm text-slate-200 mt-1">{a.information}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default AdminDashboard;
