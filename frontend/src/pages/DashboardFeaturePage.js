import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { ENDPOINTS, normalizeMeetingId, normalizePasscode } from "../api";

const featureConfig = {
  meetings: {
    eyebrow: "Workspace",
    title: "Meetings",
    description: "Create a room, join an active session, and manage your live meeting access."
  },
  history: {
    eyebrow: "Workspace",
    title: "Meeting history",
    description: "Review past sessions and download attendance records."
  },
  recordings: {
    eyebrow: "Workspace",
    title: "Recordings",
    description: "Find recorded sessions and download them for later reference."
  },
  announcements: {
    eyebrow: "Workspace",
    title: "Announcements",
    description: "Keep up with updates and important messages from your team."
  },
  settings: {
    eyebrow: "Account",
    title: "Settings",
    description: "Manage your appearance and account preferences."
  }
};

function DashboardFeaturePage({ feature }) {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const userEmail = localStorage.getItem("userEmail") || "User";
  const config = featureConfig[feature] || featureConfig.meetings;
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [loading, setLoading] = useState(feature !== "settings");
  const [error, setError] = useState("");
  const [meetings, setMeetings] = useState([]);
  const [history, setHistory] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [title, setTitle] = useState("");
  const [joinId, setJoinId] = useState("");
  const [joinPasscode, setJoinPasscode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    if (feature === "meetings") fetchMeetings();
    if (feature === "history" || feature === "recordings") fetchHistory();
    if (feature === "announcements") fetchAnnouncements();
    // Feature pages intentionally fetch only the data they display.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, navigate, feature]);

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const response = await fetch(ENDPOINTS.MEETING_ACTIVE, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load meetings");
      setMeetings(data.meetings || []);
    } catch (err) {
      setError(err.message || "Unable to load meetings");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch(ENDPOINTS.MEETING_HISTORY, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load meeting history");
      setHistory(data.meetings || []);
    } catch (err) {
      setError(err.message || "Unable to load meeting history");
    } finally {
      setLoading(false);
    }
  };

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const response = await fetch(ENDPOINTS.ANNOUNCEMENT_ALL, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load announcements");
      setAnnouncements((data.notifications || []).slice().reverse());
    } catch (err) {
      setError(err.message || "Unable to load announcements");
    } finally {
      setLoading(false);
    }
  };

  const createMeeting = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(ENDPOINTS.MEETING_CREATE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title.trim() || "Untitled meeting" })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to create meeting");
      navigate(`/meeting/live/${data.meetingId}?passcode=${encodeURIComponent(data.passcode)}`, {
        state: { email: userEmail, passcode: data.passcode }
      });
    } catch (err) {
      setError(err.message || "Unable to create meeting");
    } finally {
      setBusy(false);
    }
  };

  const joinMeetingWithCredentials = async (meetingIdInput, passcodeInput) => {
    setBusy(true);
    setError("");
    try {
      const meetingId = normalizeMeetingId(meetingIdInput);
      const passcode = normalizePasscode(passcodeInput);
      if (!meetingId || !passcode) throw new Error("Meeting ID and passcode are required");
      const response = await fetch(ENDPOINTS.MEETING_JOIN, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meetingId, passcode })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to join meeting");
      navigate(`/meeting/live/${data.meetingId}?passcode=${encodeURIComponent(passcode)}`, {
        state: { email: data.useremail || userEmail, passcode }
      });
    } catch (err) {
      setError(err.message || "Unable to join meeting");
    } finally {
      setBusy(false);
    }
  };

  const joinMeeting = (event) => {
    event.preventDefault();
    return joinMeetingWithCredentials(joinId, joinPasscode);
  };

  const downloadAttendance = async (meetingId) => {
    const response = await fetch(ENDPOINTS.MEETING_HISTORY_CSV(meetingId), { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `meeting-${meetingId}-attendance.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadRecording = async (meetingId) => {
    const response = await fetch(ENDPOINTS.MEETING_RECORDING(meetingId), { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `meeting-${meetingId}.webm`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isLight = theme === "light";
  const surface = isLight ? "bg-white border-slate-200" : "bg-[#16213e] border-[#0f3460]/60";
  const muted = isLight ? "text-slate-600" : "text-slate-400";
  const inputClass = `w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#8ab4f8] ${isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#0f3460]/40 border-[#0f3460] text-white"}`;

  return (
    <div className={`min-h-screen font-sans overflow-x-hidden ${isLight ? "bg-slate-50 text-slate-900" : "bg-[#1a1a2e] text-[#e8eaed]"}`}>
      <Sidebar theme={theme} onThemeChange={setTheme} />
      <main className="min-h-screen px-4 pt-20 pb-8 sm:px-6 lg:ml-72 lg:px-10 lg:pt-8 max-w-full overflow-x-hidden">
        <div className="mb-8 flex flex-col gap-2">
          <span className={`text-xs font-bold uppercase tracking-[0.2em] ${isLight ? "text-[#533483]" : "text-[#8ab4f8]"}`}>{config.eyebrow}</span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{config.title}</h1>
          <p className={`max-w-2xl text-sm ${muted}`}>{config.description}</p>
        </div>

        {error && <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
        {loading ? <div className={`rounded-2xl border p-8 text-sm ${surface} ${muted}`}>Loading {config.title.toLowerCase()}...</div> : (
          <>
            {feature === "meetings" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <form onSubmit={createMeeting} className={`rounded-2xl border p-6 ${surface}`}>
                  <h2 className="text-xl font-bold">Create a meeting</h2>
                  <p className={`mt-1 text-sm ${muted}`}>Start a secure room and invite your participants.</p>
                  <input className={`${inputClass} mt-6`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Meeting title" />
                  <button disabled={busy} className="mt-4 w-full rounded-xl bg-[#8ab4f8] px-4 py-3 text-sm font-bold text-[#1a1a2e] disabled:opacity-60">{busy ? "Creating..." : "Create meeting"}</button>
                </form>
                <form onSubmit={joinMeeting} className={`rounded-2xl border p-6 ${surface}`}>
                  <h2 className="text-xl font-bold">Join a meeting</h2>
                  <p className={`mt-1 text-sm ${muted}`}>Use the meeting ID and passcode from your invitation.</p>
                  <input className={`${inputClass} mt-6`} value={joinId} onChange={(event) => setJoinId(event.target.value)} placeholder="Meeting ID" required />
                  <input className={`${inputClass} mt-3`} value={joinPasscode} onChange={(event) => setJoinPasscode(event.target.value)} placeholder="Passcode" required />
                  <button disabled={busy} className="mt-4 w-full rounded-xl bg-[#533483] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? "Joining..." : "Join meeting"}</button>
                </form>
                <section className={`rounded-2xl border p-6 lg:col-span-2 ${surface}`}>
                  <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-bold">Active rooms</h2><button onClick={fetchMeetings} className={`text-sm font-semibold ${isLight ? "text-[#533483]" : "text-[#8ab4f8]"}`}>Refresh</button></div>
                  <div className="mt-4 space-y-3">{meetings.length === 0 ? <p className={`text-sm ${muted}`}>No active rooms right now.</p> : meetings.map((meeting) => <div key={meeting.meetingId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#0f3460]/50 p-4"><div><p className="font-semibold">{meeting.title || "Untitled meeting"}</p><p className={`text-xs ${muted}`}>{meeting.meetingId}</p></div><button disabled={busy} onClick={() => joinMeetingWithCredentials(meeting.meetingId, meeting.passcode)} className="rounded-lg bg-[#0f3460] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">Join room</button></div>)}</div>
                </section>
              </div>
            )}

            {(feature === "history" || feature === "recordings") && (
              <section className={`rounded-2xl border p-6 ${surface}`}>
                <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-bold">{feature === "recordings" ? "Available recordings" : "Past meetings"}</h2><span className={`text-xs ${muted}`}>{history.length} total</span></div>
                <div className="mt-5 space-y-3">{(feature === "recordings" ? history.filter((meeting) => meeting.recording) : history).length === 0 ? <p className={`text-sm ${muted}`}>Nothing to show yet.</p> : (feature === "recordings" ? history.filter((meeting) => meeting.recording) : history).map((meeting) => <div key={meeting.meetingId} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#0f3460]/50 p-4"><div><p className="font-semibold">{meeting.title || "Untitled meeting"}</p><p className={`text-xs ${muted}`}>{meeting.meetingId} · {meeting.createdAt ? new Date(meeting.createdAt).toLocaleString() : "Date unavailable"}</p></div><button onClick={() => feature === "recordings" ? downloadRecording(meeting.meetingId) : downloadAttendance(meeting.meetingId)} className="rounded-lg bg-[#0f3460] px-3 py-2 text-xs font-bold text-white">Download {feature === "recordings" ? "recording" : "attendance"}</button></div>)}</div>
              </section>
            )}

            {feature === "announcements" && <section className={`rounded-2xl border p-6 ${surface}`}><h2 className="text-xl font-bold">Latest updates</h2><div className="mt-5 space-y-4">{announcements.length === 0 ? <p className={`text-sm ${muted}`}>No announcements at this time.</p> : announcements.map((item, index) => <article key={item._id || item.id || index} className="border-b border-[#0f3460]/50 pb-4 last:border-0"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Platform announcement</h3><span className={`text-xs ${muted}`}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}</span></div><p className={`mt-2 text-sm ${muted}`}>{item.information || item.message || item.content || "No announcement details available."}</p><p className={`mt-2 text-xs ${muted}`}>From {item.sender_email || item.senderEmail || "System"}</p></article>)}</div></section>}

            {feature === "settings" && <section className={`max-w-2xl rounded-2xl border p-6 ${surface}`}><h2 className="text-xl font-bold">Appearance</h2><p className={`mt-1 text-sm ${muted}`}>Choose how genzis-meet looks on this device.</p><div className="mt-6 flex gap-3"><button onClick={() => setTheme("light")} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${isLight ? "border-[#533483] bg-[#533483]/10" : "border-slate-700"}`}>Light mode</button><button onClick={() => setTheme("dark")} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${!isLight ? "border-[#8ab4f8] bg-[#8ab4f8]/10" : "border-slate-300"}`}>Dark mode</button></div><div className={`mt-8 border-t pt-6 ${isLight ? "border-slate-200" : "border-[#0f3460]"}`}><h2 className="text-xl font-bold">Account</h2><p className={`mt-2 text-sm ${muted}`}>{userEmail}</p></div></section>}
          </>
        )}
      </main>
    </div>
  );
}

export default DashboardFeaturePage;
