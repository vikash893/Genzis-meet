import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { ENDPOINTS } from "../api";

function Dashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const userEmail = localStorage.getItem("userEmail") || "User";

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // New meeting creation data
  const [createdMeeting, setCreatedMeeting] = useState(null);
  const [creating, setCreating] = useState(false);

  // Join meeting state
  const [joinId, setJoinId] = useState("");
  const [joinPasscode, setJoinPasscode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  // Announcements & Active Meetings
  const [announcements, setAnnouncements] = useState([]);
  const [activeMeetings, setActiveMeetings] = useState([]);
  const [meetingHistory, setMeetingHistory] = useState([]);
  const [copiedField, setCopiedField] = useState("");
  const [meetingAccessMode, setMeetingAccessMode] = useState("open");
  const [invitedEmails, setInvitedEmails] = useState("");
  const [accessError, setAccessError] = useState("");
  const [savingAccess, setSavingAccess] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [fetchingUsers, setFetchingUsers] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    fetchAnnouncements();
    fetchActiveMeetings();
    fetchMeetingHistory();
    fetchRegisteredUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, navigate]);

  const fetchRegisteredUsers = async () => {
    setFetchingUsers(true);
    try {
      const res = await fetch(ENDPOINTS.USER_ALL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.users) {
        setRegisteredUsers(data.users);
      }
    } catch (err) {
      console.error("Fetch registered users error:", err);
    } finally {
      setFetchingUsers(false);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch(ENDPOINTS.ANNOUNCEMENT_ALL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.notifications) {
        setAnnouncements(data.notifications.reverse());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchActiveMeetings = async () => {
    try {
      const res = await fetch(ENDPOINTS.MEETING_ACTIVE, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.meetings) {
        setActiveMeetings(data.meetings);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMeetingHistory = async () => {
    try {
      const res = await fetch(ENDPOINTS.MEETING_HISTORY, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setMeetingHistory(data.meetings || []);
    } catch (err) {
      console.error(err);
    }
  };

  const startCreatedMeeting = async () => {
    setAccessError("");
    const allowedEmails = invitedEmails.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (meetingAccessMode === "selected" && allowedEmails.length === 0) {
      setAccessError("Add at least one user email.");
      return;
    }

    setSavingAccess(true);
    try {
      const response = await fetch(ENDPOINTS.MEETING_ACCESS(createdMeeting.meetingId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accessMode: meetingAccessMode, allowedEmails, title: createdMeeting.title })
      });
      const data = await response.json();
      if (!response.ok) {
        setAccessError(data.message || "Unable to update meeting access");
        return;
      }
      setShowCreateModal(false);
      navigate(`/meeting/live/${createdMeeting.meetingId}?passcode=${encodeURIComponent(createdMeeting.passcode)}`, { state: { email: userEmail, passcode: createdMeeting.passcode } });
    } catch (err) {
      setAccessError("Unable to update meeting access");
    } finally {
      setSavingAccess(false);
    }
  };

  const cancelCreatedMeeting = async () => {
    if (!createdMeeting) return;

    try {
      await fetch(ENDPOINTS.MEETING_CANCEL(createdMeeting.meetingId), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error("Meeting cancellation error:", err);
    } finally {
      setShowCreateModal(false);
      setCreatedMeeting(null);
      fetchActiveMeetings();
      fetchMeetingHistory();
    }
  };

  const downloadAttendance = async (meetingId) => {
    const response = await fetch(ENDPOINTS.MEETING_HISTORY_CSV(meetingId), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `meeting-${meetingId}-attendance.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadRecording = async (meetingId) => {
    const response = await fetch(ENDPOINTS.MEETING_RECORDING(meetingId), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `meeting-${meetingId}.webm`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateMeeting = async () => {
    setCreating(true);
    try {
      const res = await fetch(ENDPOINTS.MEETING_CREATE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: meetingTitle.trim() || "Untitled meeting" })
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedMeeting(data);
        setMeetingTitle("");
        setShowCreateModal(true);
        fetchActiveMeetings();
      } else {
        alert(data.message || "Failed to create meeting");
      }
    } catch (err) {
      alert("Error connecting to server");
    } finally {
      setCreating(false);
    }
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    setJoinError("");
    setJoining(true);

    try {
      const res = await fetch(ENDPOINTS.MEETING_JOIN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          meetingId: joinId.toUpperCase().trim(),
          passcode: joinPasscode.trim()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setJoinError(data.message || "Unable to join meeting");
        return;
      }

      navigate(`/meeting/live/${data.meetingId}?passcode=${encodeURIComponent(joinPasscode.trim())}`, {
        state: { email: data.useremail, passcode: joinPasscode.trim() }
      });

    } catch (err) {
      setJoinError("Failed to connect to server");
    } finally {
      setJoining(false);
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(""), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#202124] text-[#e8eaed] font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {/* Welcome Header */}
        <div className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-normal text-white tracking-tight">
              Welcome, <span className="font-semibold text-[#8ab4f8]">{userEmail.split('@')[0]}</span> 👋
            </h1>
            <p className="text-[#9aa0a6] text-sm mt-1">Ready for your next video call on genzis-meet?</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowJoinModal(true)}
              className="px-5 py-3 rounded-lg bg-[#303134] hover:bg-[#3c4043] text-white font-medium border border-[#3c4043] transition-all text-sm flex items-center gap-2"
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              <span>Join via ID</span>
            </button>

            <button
              onClick={handleCreateMeeting}
              disabled={creating}
              className="px-6 py-3 rounded-lg bg-white hover:bg-slate-200 text-black font-semibold shadow-md transition-all text-sm flex items-center gap-2"
            >
              {creating ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
              ) : (
                <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              )}
              <span>New Meeting</span>
            </button>
          </div>
        </div>

        {/* Quick Action Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Card 1 */}
          <div 
            onClick={handleCreateMeeting}
            className="bg-[#2d2f31] border border-[#3c4043] hover:border-[#8ab4f8]/50 rounded-2xl p-6 cursor-pointer group transition-all duration-300 relative overflow-hidden"
          >
            <div className="w-12 h-12 rounded-xl bg-[#1a73e8]/20 text-[#8ab4f8] flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-[#1a73e8] group-hover:text-white transition-all duration-300">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white mb-1">Instant Meeting</h3>
            <p className="text-[#9aa0a6] text-xs leading-relaxed">Create a room instantly with unique passcode & invite link.</p>
          </div>

          {/* Card 2 */}
          <div 
            onClick={() => setShowJoinModal(true)}
            className="bg-[#2d2f31] border border-[#3c4043] hover:border-[#8ab4f8]/50 rounded-2xl p-6 cursor-pointer group transition-all duration-300 relative overflow-hidden"
          >
            <div className="w-12 h-12 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-purple-600 group-hover:text-white transition-all duration-300">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white mb-1">Join Meeting</h3>
            <p className="text-[#9aa0a6] text-xs leading-relaxed">Enter an existing meeting ID and passcode to jump right in.</p>
          </div>

          {/* Card 3 */}
          <div className="bg-[#2d2f31] border border-[#3c4043] rounded-2xl p-6 relative overflow-hidden">
            <div className="w-12 h-12 rounded-xl bg-teal-600/20 text-teal-400 flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white mb-1">Secure Peer-to-Peer</h3>
            <p className="text-[#9aa0a6] text-xs leading-relaxed">WebRTC end-to-end media encryption with STUN connectivity.</p>
          </div>
        </div>

        {/* Two Column Layout: Announcements & Active Sessions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Announcements Panel */}
          <div className="bg-[#2d2f31] border border-[#3c4043] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#3c4043]">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[#8ab4f8] animate-ping"></div>
                <h2 className="text-xl font-normal text-white">System Announcements</h2>
              </div>
              <span className="text-xs text-[#8ab4f8] font-semibold bg-[#8ab4f8]/10 px-2.5 py-1 rounded-full border border-[#8ab4f8]/20">
                {announcements.length} Updates
              </span>
            </div>

            <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
              {announcements.length === 0 ? (
                <div className="text-center py-10 text-[#9aa0a6] text-sm">
                  No announcements at this time.
                </div>
              ) : (
                announcements.map((item) => (
                  <div key={item._id} className="p-4 rounded-xl bg-[#202124] border border-[#3c4043] transition-all">
                    <div className="flex items-center justify-between text-xs text-[#9aa0a6] mb-2">
                      <span className="font-medium text-[#8ab4f8]">{item.sender_email}</span>
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-slate-200 font-medium leading-relaxed">{item.information}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Meetings Monitor */}
          <div className="bg-[#2d2f31] border border-[#3c4043] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#3c4043]">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
                <h2 className="text-xl font-normal text-white">Live Meeting Rooms</h2>
              </div>
              <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                {activeMeetings.length} Active
              </span>
            </div>

            <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
              {activeMeetings.length === 0 ? (
                <div className="text-center py-10 text-[#9aa0a6] text-sm">
                  No active meetings right now. Create one to get started!
                </div>
              ) : (
                activeMeetings.map((m) => (
                  <div key={m._id} className="p-4 rounded-xl bg-[#202124] border border-[#3c4043] flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#8ab4f8]">{m.meetingId}</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full uppercase font-bold">
                          Active
                        </span>
                      </div>
                      <p className="text-xs text-[#9aa0a6] mt-1">Host: {m.hostemail}</p>
                    </div>

                    <button
                      onClick={() => {
                        setJoinId(m.meetingId);
                        setJoinPasscode(m.passcode);
                        setShowJoinModal(true);
                      }}
                      className="px-3.5 py-2 text-xs font-semibold text-[#8ab4f8] bg-[#8ab4f8]/10 hover:bg-[#8ab4f8]/20 border border-[#8ab4f8]/30 rounded-lg transition-colors"
                    >
                      Join Room
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* HOST MEETING HISTORY */}
        <section className="mt-8 bg-[#2d2f31] border border-[#3c4043] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#3c4043]">
            <div>
              <h2 className="text-xl font-normal text-white">Meeting History</h2>
              <p className="text-xs text-[#9aa0a6] mt-1">Attendance records for meetings hosted by you</p>
            </div>
            <span className="text-xs text-[#8ab4f8] font-semibold">{meetingHistory.length} Meetings</span>
          </div>
          {meetingHistory.length === 0 ? (
            <p className="text-center py-8 text-[#9aa0a6] text-sm">No hosted meetings yet.</p>
          ) : (
            <div className="space-y-3">
              {meetingHistory.map((meeting) => (
                <div key={meeting._id} className="p-4 rounded-xl bg-[#202124] border border-[#3c4043] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-[#8ab4f8]">{meeting.meetingId}</span>
                      <span className="text-xs text-[#9aa0a6]">{new Date(meeting.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-[#9aa0a6] mt-1">{meeting.attendance.length} attendance records</p>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-[#8ab4f8]">View attendance</summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="text-[#9aa0a6]">
                            <tr><th className="pr-4 py-1">User</th><th className="pr-4 py-1">Joined</th><th className="py-1">Left</th></tr>
                          </thead>
                          <tbody className="text-slate-300">
                            {meeting.attendance.map((record) => (
                              <tr key={record._id}>
                                <td className="pr-4 py-1">{record.email}</td>
                                <td className="pr-4 py-1">{new Date(record.joinedAt).toLocaleString()}</td>
                                <td className="py-1">{record.leftAt ? new Date(record.leftAt).toLocaleString() : "Still connected"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>
                  <button
                    onClick={() => downloadAttendance(meeting.meetingId)}
                    className="px-3.5 py-2 text-xs font-semibold text-[#8ab4f8] bg-[#8ab4f8]/10 hover:bg-[#8ab4f8]/20 border border-[#8ab4f8]/30 rounded-lg transition-colors"
                  >
                    Download CSV
                  </button>
                  {meeting.recording && (
                    <button
                      onClick={() => downloadRecording(meeting.meetingId)}
                      className="px-3.5 py-2 text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors"
                    >
                      Download Video
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* CREATE MEETING MODAL */}
      {showCreateModal && createdMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#2d2f31] border border-[#3c4043] rounded-2xl p-8 relative shadow-2xl">
            <button
              onClick={cancelCreatedMeeting}
              className="absolute top-4 right-4 text-[#9aa0a6] hover:text-white"
            >
              ✕
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-3 text-xl">
                ✓
              </div>
              <h3 className="text-2xl font-normal text-white">Meeting Ready!</h3>
              <p className="text-xs text-[#9aa0a6] mt-1">Share these details with your participants</p>
            </div>

            <input
              type="text"
              value={createdMeeting.title || ""}
              onChange={(event) => setCreatedMeeting({ ...createdMeeting, title: event.target.value })}
              placeholder="Meeting title"
              maxLength={120}
              className="w-full mb-4 px-4 py-3 rounded-xl bg-[#202124] border border-[#3c4043] text-white text-sm"
            />

            <div className="space-y-4 bg-[#202124] p-4 rounded-xl border border-[#3c4043] mb-6">
              <div>
                <span className="text-[11px] font-semibold text-[#9aa0a6] uppercase tracking-wider">Meeting ID</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-lg font-mono font-extrabold text-[#8ab4f8] tracking-wider">
                    {createdMeeting.meetingId}
                  </span>
                  <button
                    onClick={() => copyToClipboard(createdMeeting.meetingId, "id")}
                    className="text-xs text-slate-300 hover:text-white px-2.5 py-1 bg-[#3c4043] rounded-md font-medium"
                  >
                    {copiedField === "id" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="border-t border-[#3c4043] pt-3">
                <span className="text-[11px] font-semibold text-[#9aa0a6] uppercase tracking-wider">Passcode</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-lg font-mono font-extrabold text-emerald-300 tracking-wider">
                    {createdMeeting.passcode}
                  </span>
                  <button
                    onClick={() => copyToClipboard(createdMeeting.passcode, "passcode")}
                    className="text-xs text-slate-300 hover:text-white px-2.5 py-1 bg-[#3c4043] rounded-md font-medium"
                  >
                    {copiedField === "passcode" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <span className="text-[11px] font-semibold text-[#9aa0a6] uppercase tracking-wider">Who can join?</span>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setMeetingAccessMode("open")}
                  className={`py-2.5 rounded-lg text-xs font-semibold border ${meetingAccessMode === "open" ? "bg-[#1a73e8] text-white border-[#1a73e8]" : "bg-[#3c4043] text-slate-300 border-[#3c4043]"}`}
                >
                  Open to all users
                </button>
                <button
                  type="button"
                  onClick={() => setMeetingAccessMode("selected")}
                  className={`py-2.5 rounded-lg text-xs font-semibold border ${meetingAccessMode === "selected" ? "bg-[#1a73e8] text-white border-[#1a73e8]" : "bg-[#3c4043] text-slate-300 border-[#3c4043]"}`}
                >
                  Selected users
                </button>
              </div>
              {meetingAccessMode === "selected" && (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-medium text-[#bdc1c6] uppercase tracking-wider">
                    Select Invited Users
                  </label>

                  {/* Selected User Pills */}
                  {invitedEmails.trim() && (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-[#202124] rounded-xl border border-[#3c4043] max-h-24 overflow-y-auto">
                      {invitedEmails.split(",").map((item) => item.trim()).filter(Boolean).map((emailItem) => (
                        <span key={emailItem} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#8ab4f8]/20 text-[#8ab4f8] text-xs font-medium border border-[#8ab4f8]/30">
                          <span>{emailItem}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = invitedEmails.split(",").map(e => e.trim()).filter(e => e.toLowerCase() !== emailItem.toLowerCase());
                              setInvitedEmails(updated.join(", "));
                            }}
                            className="hover:text-white font-bold ml-1"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Dropdown Toggle / Search */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="w-full px-4 py-3 rounded-xl bg-[#202124] border border-[#3c4043] text-left text-sm text-slate-200 flex items-center justify-between hover:border-[#8ab4f8]/50 transition-colors"
                    >
                      <span className="truncate">
                        {fetchingUsers ? "Loading user list..." : "Choose users from registered list..."}
                      </span>
                      <svg className={`w-4 h-4 text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {dropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[#202124] border border-[#3c4043] rounded-xl shadow-2xl z-50 p-2 max-h-60 overflow-y-auto space-y-1">
                        <input
                          type="text"
                          placeholder="Search name or email..."
                          value={userSearchTerm}
                          onChange={(e) => setUserSearchTerm(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-[#2d2f31] border border-[#3c4043] text-white focus:outline-none focus:border-[#8ab4f8] mb-2"
                        />

                        {registeredUsers.length === 0 ? (
                          <p className="text-xs text-[#9aa0a6] py-3 text-center">No other registered users found</p>
                        ) : (
                          registeredUsers
                            .filter(u => u.name?.toLowerCase().includes(userSearchTerm.toLowerCase()) || u.email?.toLowerCase().includes(userSearchTerm.toLowerCase()))
                            .map((userItem) => {
                              const currentSelected = invitedEmails.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
                              const isSelected = currentSelected.includes(userItem.email.toLowerCase());
                              return (
                                <div
                                  key={userItem.email}
                                  onClick={() => {
                                    let updated;
                                    if (isSelected) {
                                      updated = currentSelected.filter(e => e !== userItem.email.toLowerCase());
                                    } else {
                                      updated = [...currentSelected, userItem.email.toLowerCase()];
                                    }
                                    setInvitedEmails(updated.join(", "));
                                  }}
                                  className={`p-2.5 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-all ${isSelected ? "bg-[#1a73e8]/20 border border-[#1a73e8]/40" : "hover:bg-[#2d2f31]"}`}
                                >
                                  <div>
                                    <p className="font-medium text-slate-200">{userItem.name}</p>
                                    <p className="text-[11px] text-slate-400">{userItem.email}</p>
                                  </div>
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? "bg-[#1a73e8] border-[#1a73e8] text-white" : "border-[#3c4043]"}`}>
                                    {isSelected && <span className="text-[10px] font-bold">✓</span>}
                                  </div>
                                </div>
                              );
                            })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Manual email fallback */}
                  <input
                    type="text"
                    value={invitedEmails}
                    onChange={(event) => setInvitedEmails(event.target.value)}
                    placeholder="Or type emails manually (comma separated)"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#202124] border border-[#3c4043] text-white text-xs"
                  />
                </div>
              )}
              {accessError && <p className="text-xs text-red-300 mt-2">{accessError}</p>}
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelCreatedMeeting}
                className="flex-1 py-3 bg-[#3c4043] hover:bg-[#4a4e51] text-slate-200 font-medium rounded-xl text-sm transition-colors"
              >
                Close
              </button>
              <button
                onClick={startCreatedMeeting}
                disabled={savingAccess}
                className="flex-1 py-3 bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium rounded-xl text-sm transition-colors shadow-md"
              >
                {savingAccess ? "Saving..." : "Start Meeting"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JOIN MEETING MODAL */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#2d2f31] border border-[#3c4043] rounded-2xl p-8 relative shadow-2xl">
            <button
              onClick={() => setShowJoinModal(false)}
              className="absolute top-4 right-4 text-[#9aa0a6] hover:text-white"
            >
              ✕
            </button>

            <h3 className="text-2xl font-normal text-white mb-2">Join Meeting</h3>
            <p className="text-xs text-[#9aa0a6] mb-6">Enter meeting credentials to connect</p>

            {joinError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#bdc1c6] uppercase tracking-wider mb-1">
                  Meeting ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AB12CD"
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#202124] border border-[#3c4043] text-white uppercase font-mono tracking-wider focus:outline-none focus:border-[#8ab4f8] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#bdc1c6] uppercase tracking-wider mb-1">
                  Passcode
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••"
                  value={joinPasscode}
                  onChange={(e) => setJoinPasscode(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#202124] border border-[#3c4043] text-white font-mono focus:outline-none focus:border-[#8ab4f8] text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 py-3 bg-[#3c4043] hover:bg-[#4a4e51] text-slate-200 font-medium rounded-xl text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joining}
                  className="flex-1 py-3 bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium rounded-xl text-sm flex items-center justify-center gap-2 transition-colors shadow-md"
                >
                  {joining ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    "Join Now"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
