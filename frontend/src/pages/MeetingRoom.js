/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import socket, { connectSocket } from "../socket";

const normalizeMeetingId = (value) => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

function VideoTile({ videoRef, stream, name, muted, cameraOff, local = false }) {
  useEffect(() => {
    if (!videoRef.current || !stream) return undefined;
    videoRef.current.srcObject = stream;
    const playVideo = () => videoRef.current?.play().catch(() => {});
    playVideo();
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [stream, videoRef]);

  return (
    <div className="relative min-h-[220px] overflow-hidden rounded-2xl border border-white/10 bg-[#11182d] shadow-xl">
      <video ref={videoRef} autoPlay playsInline muted={local} className={`h-full min-h-[220px] w-full object-cover ${cameraOff ? "hidden" : "block"}`} />
      {cameraOff && (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 bg-[#18213b]">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#8ab4f8] text-3xl font-bold text-[#11182d]">{name.charAt(0).toUpperCase()}</div>
          <span className="text-sm text-slate-400">Camera off</span>
        </div>
      )}
      <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-xl bg-black/60 px-3 py-2 text-sm backdrop-blur">
        <span className="max-w-[70%] truncate font-semibold text-white">{local ? `You (${name})` : name}</span>
        {muted && <span className="rounded-full bg-red-500/80 px-2 py-1 text-[10px] font-bold text-white">Muted</span>}
      </div>
    </div>
  );
}

function MeetingRoom() {
  const { meetingId: routeMeetingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const meetingId = normalizeMeetingId(routeMeetingId);
  const email = location.state?.email || localStorage.getItem("userEmail") || "Guest User";
  const passcode = location.state?.passcode || new URLSearchParams(location.search).get("passcode") || sessionStorage.getItem(`meeting_passcode_${meetingId}`) || "";

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const participantsRef = useRef([]);
  const offerLockRef = useRef(new Map());
  const joinedRef = useRef(false);
  const [preJoin, setPreJoin] = useState(true);
  const [joinOptions, setJoinOptions] = useState({ camera: true, microphone: true });
  const [joining, setJoining] = useState(false);
  const [socketStatus, setSocketStatus] = useState(socket.connected ? "connected" : "offline");
  const [error, setError] = useState("");
  const [localCameraOff, setLocalCameraOff] = useState(true);
  const [localMuted, setLocalMuted] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [remoteStates, setRemoteStates] = useState({});
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
  ];

  const syncTrack = (pc, track) => {
    const transceiver = pc.getTransceivers().find((item) => item.receiver?.track?.kind === track.kind);
    if (transceiver) return transceiver.sender.replaceTrack(track);
    return Promise.resolve();
  };

  const createPeer = (targetSocketId) => {
    const existing = peersRef.current.get(targetSocketId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers });
    pc.addTransceiver("audio", { direction: "sendrecv" });
    pc.addTransceiver("video", { direction: "sendrecv" });
    peersRef.current.set(targetSocketId, pc);

    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach((track) => syncTrack(pc, track));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit("ice-candidate", { targetSocketId, candidate });
    };

    pc.ontrack = (event) => {
      const incoming = event.streams[0] || new MediaStream([event.track]);
      const participant = participantsRef.current.find((item) => item.socketId === targetSocketId);
      setRemoteStreams((current) => ({ ...current, [targetSocketId]: { stream: incoming, email: participant?.email || "Participant" } }));
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) {
        peersRef.current.delete(targetSocketId);
        setRemoteStreams((current) => {
          const next = { ...current };
          delete next[targetSocketId];
          return next;
        });
      }
    };

    pc.onnegotiationneeded = async () => {
      if (socket.id > targetSocketId || offerLockRef.current.get(targetSocketId) || pc.signalingState !== "stable") return;
      offerLockRef.current.set(targetSocketId, true);
      try {
        const offer = await pc.createOffer();
        if (pc.signalingState === "stable") {
          await pc.setLocalDescription(offer);
          socket.emit("offer", { targetSocketId, offer: pc.localDescription });
        }
      } catch (negotiationError) {
        if (!String(negotiationError?.name).includes("Invalid")) setError("Could not negotiate a participant connection.");
      } finally {
        offerLockRef.current.set(targetSocketId, false);
      }
    };

    return pc;
  };

  const addLocalTracks = async (stream) => {
    localStreamRef.current = stream;
    setLocalCameraOff(stream.getVideoTracks().length === 0);
    setLocalMuted(stream.getAudioTracks().length === 0);
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    await Promise.all([...peersRef.current.values()].flatMap((pc) => stream.getTracks().map((track) => syncTrack(pc, track))));
  };

  const acquireSelectedMedia = async () => {
    if (!joinOptions.camera && !joinOptions.microphone) return null;
    const constraints = { video: joinOptions.camera, audio: joinOptions.microphone };
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (combinedError) {
      let videoTracks = [];
      let audioTracks = [];
      if (joinOptions.camera) {
        try { videoTracks = (await navigator.mediaDevices.getUserMedia({ video: true, audio: false })).getVideoTracks(); } catch {}
      }
      if (joinOptions.microphone) {
        try { audioTracks = (await navigator.mediaDevices.getUserMedia({ video: false, audio: true })).getAudioTracks(); } catch {}
      }
      if (!videoTracks.length && !audioTracks.length) throw combinedError;
      return new MediaStream([...videoTracks, ...audioTracks]);
    }
  };

  const emitJoin = () => {
    if (!socket.connected) return;
    socket.emit("join-meeting", { meetingId, passcode });
  };

  const joinRoom = async () => {
    setJoining(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia && (joinOptions.camera || joinOptions.microphone)) throw new Error("Camera and microphone are not available in this browser.");
      const stream = await acquireSelectedMedia();
      if (stream) await addLocalTracks(stream);
      joinedRef.current = true;
      connectSocket();
      if (socket.connected) emitJoin();
      setPreJoin(false);
    } catch (joinError) {
      setError(joinError.message || "Media permission was denied. You can join with devices off.");
      joinedRef.current = true;
      connectSocket();
      if (socket.connected) emitJoin();
      setPreJoin(false);
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    const onConnect = () => { setSocketStatus("connected"); if (joinedRef.current) emitJoin(); };
    const onDisconnect = () => setSocketStatus("offline");
    const onConnectError = () => { setSocketStatus("offline"); setError("Meeting server connection failed. Check the backend deployment."); };
    const onParticipants = (users) => {
      participantsRef.current = users;
      setParticipants(users);
      users.filter((user) => user.socketId !== socket.id).forEach((user) => createPeer(user.socketId));
    };
    const onUserJoined = (user) => { if (user.socketId !== socket.id) createPeer(user.socketId); };
    const onUserLeft = ({ socketId }) => {
      peersRef.current.get(socketId)?.close();
      peersRef.current.delete(socketId);
      setParticipants((current) => current.filter((user) => user.socketId !== socketId));
      setRemoteStreams((current) => { const next = { ...current }; delete next[socketId]; return next; });
    };
    const onOffer = async ({ fromSocketId, offer }) => {
      const pc = createPeer(fromSocketId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { targetSocketId: fromSocketId, answer: pc.localDescription });
      } catch (offerError) {
        setError("A participant connection could not be negotiated. Please rejoin the meeting.");
      }
    };
    const onAnswer = async ({ fromSocketId, answer }) => {
      const pc = peersRef.current.get(fromSocketId);
      if (pc && pc.signalingState === "have-local-offer") {
        try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); } catch {}
      }
    };
    const onIce = async ({ fromSocketId, candidate }) => {
      const pc = peersRef.current.get(fromSocketId);
      if (pc?.remoteDescription) { try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {} }
    };
    const onMediaState = ({ socketId, isMuted, isCameraOff }) => setRemoteStates((current) => ({ ...current, [socketId]: { isMuted, isCameraOff } }));
    const onChat = (message) => setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    const onAccessDenied = ({ message }) => { setError(message || "You cannot join this meeting."); setPreJoin(true); };
    const onEnded = () => { setError("The host ended this meeting."); setTimeout(() => navigate("/dashboard"), 1200); };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("participants", onParticipants);
    socket.on("user-joined", onUserJoined);
    socket.on("user-left", onUserLeft);
    socket.on("offer", onOffer);
    socket.on("answer", onAnswer);
    socket.on("ice-candidate", onIce);
    socket.on("user-media-state-changed", onMediaState);
    socket.on("receive-message", onChat);
    socket.on("meeting-access-denied", onAccessDenied);
    socket.on("meeting-ended-by-host", onEnded);

    return () => {
      socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); socket.off("connect_error", onConnectError);
      socket.off("participants", onParticipants); socket.off("user-joined", onUserJoined); socket.off("user-left", onUserLeft);
      socket.off("offer", onOffer); socket.off("answer", onAnswer); socket.off("ice-candidate", onIce);
      socket.off("user-media-state-changed", onMediaState); socket.off("receive-message", onChat);
      socket.off("meeting-access-denied", onAccessDenied); socket.off("meeting-ended-by-host", onEnded);
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      socket.disconnect();
    };
  }, [meetingId, passcode]);

  const publishMediaState = (nextMuted, nextCameraOff) => socket.emit("user-media-state", { meetingId, email, isMuted: nextMuted, isCameraOff: nextCameraOff });

  const toggleMic = async () => {
    if (!localStreamRef.current?.getAudioTracks().length) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!localStreamRef.current) await addLocalTracks(stream); else stream.getAudioTracks().forEach((track) => localStreamRef.current.addTrack(track));
        await Promise.all([...peersRef.current.values()].map((pc) => syncTrack(pc, localStreamRef.current.getAudioTracks()[0])));
        setLocalMuted(false); publishMediaState(false, localCameraOff);
      } catch { setError("Microphone permission was denied or is unavailable."); }
      return;
    }
    const nextMuted = !localMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setLocalMuted(nextMuted); publishMediaState(nextMuted, localCameraOff);
  };

  const toggleCamera = async () => {
    if (!localStreamRef.current?.getVideoTracks().length) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const track = stream.getVideoTracks()[0];
        if (!localStreamRef.current) await addLocalTracks(stream); else localStreamRef.current.addTrack(track);
        await Promise.all([...peersRef.current.values()].map((pc) => syncTrack(pc, track)));
        setLocalCameraOff(false); publishMediaState(localMuted, false);
      } catch { setError("Camera permission was denied or is unavailable."); }
      return;
    }
    const nextOff = !localCameraOff;
    localStreamRef.current.getVideoTracks().forEach((track) => { track.enabled = !nextOff; });
    setLocalCameraOff(nextOff); publishMediaState(localMuted, nextOff);
  };

  const toggleShare = async () => {
    if (sharing) {
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setSharing(false);
      const camera = localStreamRef.current?.getVideoTracks()[0];
      if (camera) await Promise.all([...peersRef.current.values()].map((pc) => syncTrack(pc, camera)));
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screen;
      const track = screen.getVideoTracks()[0];
      await Promise.all([...peersRef.current.values()].map((pc) => syncTrack(pc, track)));
      if (localVideoRef.current) localVideoRef.current.srcObject = screen;
      setSharing(true);
      track.onended = () => toggleShare();
    } catch {}
  };

  const sendChat = (event) => {
    event.preventDefault();
    const message = chatMessage.trim();
    if (!message) return;
    socket.emit("send-message", { meetingId, email, message, id: `${Date.now()}-${socket.id}`, timestamp: new Date().toISOString() });
    setChatMessage("");
  };

  const leave = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    navigate("/dashboard");
  };

  const remoteEntries = Object.entries(remoteStreams);
  const tileCount = remoteEntries.length + 1;
  const gridClass = tileCount === 1 ? "grid-cols-1" : tileCount < 5 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3";

  if (preJoin) return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d1328] px-4 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#151e38] p-7 shadow-2xl sm:p-10">
        <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8ab4f8]">Ready to join?</p><h1 className="mt-3 text-3xl font-bold">Meeting {meetingId}</h1><p className="mt-2 text-sm text-slate-400">Choose your devices before entering the room. You can change them anytime.</p></div>
        {error && <p className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        <div className="space-y-3">
          <button onClick={() => setJoinOptions((current) => ({ ...current, camera: !current.camera }))} className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left ${joinOptions.camera ? "border-[#8ab4f8] bg-[#8ab4f8]/10" : "border-white/10 bg-white/5"}`}><span><span className="block font-semibold">Camera</span><span className="text-xs text-slate-400">Show your video</span></span><span className="text-2xl">{joinOptions.camera ? "On" : "Off"}</span></button>
          <button onClick={() => setJoinOptions((current) => ({ ...current, microphone: !current.microphone }))} className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left ${joinOptions.microphone ? "border-[#8ab4f8] bg-[#8ab4f8]/10" : "border-white/10 bg-white/5"}`}><span><span className="block font-semibold">Microphone</span><span className="text-xs text-slate-400">Let others hear you</span></span><span className="text-2xl">{joinOptions.microphone ? "On" : "Off"}</span></button>
        </div>
        <button disabled={joining} onClick={joinRoom} className="mt-7 w-full rounded-2xl bg-[#8ab4f8] px-5 py-4 font-bold text-[#0d1328] disabled:opacity-60">{joining ? "Preparing meeting..." : "Join meeting"}</button>
        <button onClick={() => navigate("/dashboard")} className="mt-3 w-full rounded-2xl px-5 py-3 text-sm font-semibold text-slate-400 hover:text-white">Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1328] text-white">
      <header className="flex h-16 items-center justify-between border-b border-white/10 bg-[#111a32] px-4 sm:px-6"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8ab4f8]">Live meeting</p><p className="font-mono text-sm font-bold">{meetingId}</p></div><div className="flex items-center gap-3 text-xs text-slate-400"><span className={`h-2 w-2 rounded-full ${socketStatus === "connected" ? "bg-emerald-400" : "bg-red-400"}`} />{socketStatus === "connected" ? `${participants.length} connected` : "Reconnecting"}<button onClick={() => setChatOpen((current) => !current)} className="rounded-xl bg-white/10 px-3 py-2 font-semibold text-white">Chat</button></div></header>
      {error && <div className="mx-auto mt-3 w-[min(92%,800px)] rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-100">{error}</div>}
      <main className="flex flex-1 flex-col gap-5 p-4 sm:p-6"><div className={`grid flex-1 content-center gap-4 ${gridClass}`}><VideoTile videoRef={localVideoRef} stream={localStreamRef.current} name={email} muted={localMuted} cameraOff={localCameraOff} local />{remoteEntries.map(([id, item]) => <VideoTile key={id} videoRef={{ current: null }} stream={item.stream} name={item.email} muted={remoteStates[id]?.isMuted} cameraOff={remoteStates[id]?.isCameraOff} />)}</div></main>
      {chatOpen && <aside className="fixed bottom-24 right-4 z-20 flex h-[min(60vh,500px)] w-[min(92vw,360px)] flex-col rounded-2xl border border-white/10 bg-[#151e38] p-4 shadow-2xl"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Chat</h2><button onClick={() => setChatOpen(false)} className="text-slate-400">×</button></div><div className="flex-1 space-y-3 overflow-y-auto">{messages.map((message) => <div key={message.id} className="rounded-xl bg-white/5 p-3"><p className="text-xs font-bold text-[#8ab4f8]">{message.email}</p><p className="mt-1 text-sm">{message.message}</p></div>)}</div><form onSubmit={sendChat} className="mt-3 flex gap-2"><input value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} placeholder="Write a message" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" /><button className="rounded-xl bg-[#8ab4f8] px-3 text-sm font-bold text-[#0d1328]">Send</button></form></aside>}
      <footer className="flex items-center justify-center gap-2 border-t border-white/10 bg-[#111a32] p-4 sm:gap-3"><button onClick={toggleMic} className={`rounded-2xl px-4 py-3 text-sm font-bold ${localMuted ? "bg-red-500 text-white" : "bg-white/10 text-white"}`}>{localMuted ? "Unmute" : "Mute"}</button><button onClick={toggleCamera} className={`rounded-2xl px-4 py-3 text-sm font-bold ${localCameraOff ? "bg-red-500 text-white" : "bg-white/10 text-white"}`}>{localCameraOff ? "Start camera" : "Stop camera"}</button><button onClick={toggleShare} className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold">{sharing ? "Stop sharing" : "Share screen"}</button><button onClick={() => { const next = !handRaised; setHandRaised(next); socket.emit("raise-hand", { meetingId, email, isHandRaised: next }); }} className={`rounded-2xl px-4 py-3 text-sm font-bold ${handRaised ? "bg-amber-400 text-[#0d1328]" : "bg-white/10 text-white"}`}>Raise hand</button><button onClick={leave} className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white">Leave</button></footer>
    </div>
  );
}

export default MeetingRoom;
