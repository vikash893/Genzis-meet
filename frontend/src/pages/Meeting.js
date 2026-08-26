/* eslint-disable react-hooks/exhaustive-deps */
import {
  useEffect,
  useRef,
  useState,
  useCallback
} from "react";
import {
  useParams,
  useLocation,
  useNavigate
} from "react-router-dom";

import socket from "../socket";
import Chat from "../components/Chat";
import RemoteVideo from "../components/RemoteVideo";

function Meeting() {
  const { meetingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Parse URL search params (e.g. ?passcode=1234)
  const searchParams = new URLSearchParams(location.search);
  const urlPasscode = searchParams.get("passcode") || "";

  // User credentials
  const email = location.state?.email || localStorage.getItem("userEmail") || "Guest User";
  const [meetingPasscode] = useState(urlPasscode || "••••");

  // Media Refs
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const participantsRef = useRef([]);

  // MediaRecorder Refs
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // States
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Privacy Shield State
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);

  // Drawers & Modals
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);
  const [copiedText, setCopiedText] = useState("");

  // Floating Emoji Animations
  const [floatingReactions, setFloatingReactions] = useState([]);

  // Host & Remote users state
  const [hostSocketId, setHostSocketId] = useState(null);
  const isHost = socket.id && hostSocketId && socket.id === hostSocketId;
  const [remoteStates, setRemoteStates] = useState({});

  const hasJoinedMeetingRef = useRef(false);

  // Create WebRTC Peer Connection
  const createPeerConnection = useCallback((targetSocketId) => {
    if (peerConnectionsRef.current.has(targetSocketId)) {
      return peerConnectionsRef.current.get(targetSocketId);
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });

    const activeStream = screenStreamRef.current || localStreamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, activeStream);
      });
    }

    peerConnectionsRef.current.set(targetSocketId, peerConnection);

    peerConnection.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;

      const participant = participantsRef.current.find((u) => u.socketId === targetSocketId);
      const remoteEmail = participant?.email || "Remote User";

      setRemoteStreams((prev) => ({
        ...prev,
        [targetSocketId]: { stream, email: remoteEmail }
      }));
    };

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      socket.emit("ice-candidate", {
        targetSocketId,
        candidate: event.candidate
      });
    };

    peerConnection.onconnectionstatechange = () => {
      if (
        peerConnection.connectionState === "failed" ||
        peerConnection.connectionState === "closed"
      ) {
        peerConnectionsRef.current.delete(targetSocketId);
        setRemoteStreams((prev) => {
          const updated = { ...prev };
          delete updated[targetSocketId];
          return updated;
        });
      }
    };

    return peerConnection;
  }, []);

  // Socket & Media Effect
  useEffect(() => {
    const handleUserJoined = async (user) => {
      try {
        const pc = createPeerConnection(user.socketId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { targetSocketId: user.socketId, offer });
      } catch (err) {
        console.error("Offer error:", err);
      }
    };

    const handleOffer = async ({ fromSocketId, offer }) => {
      try {
        const pc = createPeerConnection(fromSocketId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { targetSocketId: fromSocketId, answer });
      } catch (err) {
        console.error("Answer error:", err);
      }
    };

    const handleAnswer = async ({ fromSocketId, answer }) => {
      const pc = peerConnectionsRef.current.get(fromSocketId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error("Answer set error:", err);
        }
      }
    };

    const handleIceCandidate = async ({ fromSocketId, candidate }) => {
      const pc = peerConnectionsRef.current.get(fromSocketId);
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("ICE add error:", err);
        }
      }
    };

    const handleParticipants = (users) => {
      setParticipants(users);
      participantsRef.current = users;
    };

    const handleUserLeft = ({ socketId }) => {
      const pc = peerConnectionsRef.current.get(socketId);
      if (pc) pc.close();
      peerConnectionsRef.current.delete(socketId);

      setRemoteStreams((prev) => {
        const updated = { ...prev };
        delete updated[socketId];
        return updated;
      });

      setParticipants((prev) => prev.filter((u) => u.socketId !== socketId));
    };

    const handleUserHandRaised = ({ socketId, isHandRaised }) => {
      setRemoteStates((prev) => ({
        ...prev,
        [socketId]: { ...prev[socketId], isHandRaised }
      }));
    };

    const handleUserMediaState = ({ socketId, isMuted, isCameraOff }) => {
      setRemoteStates((prev) => ({
        ...prev,
        [socketId]: { ...prev[socketId], isMuted, isCameraOff }
      }));
    };

    const handleReceiveReaction = ({ email: senderEmail, emoji, id }) => {
      setFloatingReactions((prev) => [...prev, { id, emoji, senderEmail }]);
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
      }, 2500);
    };

    const handlePrivacyModeChanged = ({ isPrivacyMode: mode }) => {
      setIsPrivacyMode(mode);
    };

    const handleHostInfo = ({ hostSocketId: hId }) => {
      setHostSocketId(hId);
    };

    const handleMeetingEndedByHost = () => {
      alert("The meeting has been ended by the host.");
      leaveMeeting();
    };

    socket.on("user-joined", handleUserJoined);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("participants", handleParticipants);
    socket.on("user-left", handleUserLeft);
    socket.on("user-hand-raised", handleUserHandRaised);
    socket.on("user-media-state-changed", handleUserMediaState);
    socket.on("receive-reaction", handleReceiveReaction);
    socket.on("privacy-mode-changed", handlePrivacyModeChanged);
    socket.on("host-info", handleHostInfo);
    socket.on("meeting-ended-by-host", handleMeetingEndedByHost);

    const startMeeting = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        if (!hasJoinedMeetingRef.current) {
          hasJoinedMeetingRef.current = true;
          socket.emit("join-meeting", { meetingId, email });
        }
      } catch (err) {
        console.error("Camera/Mic error:", err);
      }
    };

    startMeeting();

    return () => {
      socket.off("user-joined", handleUserJoined);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);
      socket.off("participants", handleParticipants);
      socket.off("user-left", handleUserLeft);
      socket.off("user-hand-raised", handleUserHandRaised);
      socket.off("user-media-state-changed", handleUserMediaState);
      socket.off("receive-reaction", handleReceiveReaction);
      socket.off("privacy-mode-changed", handlePrivacyModeChanged);
      socket.off("host-info", handleHostInfo);
      socket.off("meeting-ended-by-host", handleMeetingEndedByHost);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    };
  }, [meetingId, email, createPeerConnection]);

  // Controls Handlers
  const toggleMicrophone = () => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;

    const nextMuted = !isMuted;
    audioTracks.forEach((t) => (t.enabled = !nextMuted));
    setIsMuted(nextMuted);

    socket.emit("user-media-state", {
      meetingId,
      email,
      isMuted: nextMuted,
      isCameraOff
    });
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    if (videoTracks.length === 0) return;

    const nextCameraOff = !isCameraOff;
    videoTracks.forEach((t) => (t.enabled = !nextCameraOff));
    setIsCameraOff(nextCameraOff);

    socket.emit("user-media-state", {
      meetingId,
      email,
      isMuted,
      isCameraOff: nextCameraOff
    });
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);

      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(cameraTrack);
        });
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        setIsScreenSharing(true);

        const screenTrack = screenStream.getVideoTracks()[0];
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;

        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(screenTrack);
        });

        screenTrack.onended = () => toggleScreenShare();
      } catch (err) {
        console.error("Screen share error:", err);
      }
    }
  };

  const toggleRaiseHand = () => {
    const nextHand = !isHandRaised;
    setIsHandRaised(nextHand);
    socket.emit("raise-hand", { meetingId, email, isHandRaised: nextHand });
  };

  const sendEmojiReaction = (emoji) => {
    socket.emit("send-reaction", { meetingId, email, emoji });
    setShowReactionsMenu(false);
  };

  // Toggle Host Privacy Shield (Host Only)
  const togglePrivacyShield = () => {
    if (!isHost) {
      alert("Only the host can toggle Privacy Shield mode.");
      return;
    }
    const nextPrivacy = !isPrivacyMode;
    setIsPrivacyMode(nextPrivacy);
    socket.emit("toggle-privacy-mode", { meetingId, isPrivacyMode: nextPrivacy });
  };

  // In-Browser HD Lecture Recording
  const startRecording = async () => {
    if (isPrivacyMode && !isHost) {
      alert("Privacy Shield is active! Non-host participants are restricted from recording this lecture.");
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      recordedChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(displayStream, { mimeType: "video/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        clearInterval(recordingTimerRef.current);
        setIsRecording(false);
        setRecordingDuration(0);

        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = `NexusMeet-Recording-${meetingId}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
      };

      mediaRecorder.start(1000);
      setIsRecording(true);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Recording start error:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const leaveMeeting = () => {
    if (isRecording) stopRecording();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop());
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    socket.disconnect();
    navigate("/dashboard");
  };

  const endMeetingForEveryone = () => {
    if (window.confirm("End this meeting for all participants?")) {
      socket.emit("end-meeting", { meetingId });
      leaveMeeting();
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const copyLiveInviteLink = () => {
    const liveLink = `${window.location.origin}/meeting/live/${meetingId}${meetingPasscode !== "••••" ? `?passcode=${meetingPasscode}` : ''}`;
    navigator.clipboard.writeText(liveLink);
    setCopiedText("link");
    setTimeout(() => setCopiedText(""), 2000);
  };

  const totalTiles = 1 + Object.keys(remoteStreams).length;
  const getGridClass = () => {
    if (totalTiles === 1) return "grid-cols-1 max-w-4xl mx-auto";
    if (totalTiles === 2) return "grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto";
    if (totalTiles <= 4) return "grid-cols-2 max-w-6xl mx-auto";
    return "grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto";
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#202124] text-slate-100 overflow-hidden relative select-none font-sans">
      {/* GOOGLE MEET TOP HEADER */}
      <header className="h-16 px-6 bg-[#202124] border-b border-[#3c4043] flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#2d2f31] border border-[#3c4043] px-3.5 py-1.5 rounded-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="font-mono font-bold text-sm text-[#8ab4f8] tracking-wider">
              {meetingId}
            </span>
          </div>

          {/* Recording Badge */}
          {isRecording && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600/20 border border-red-500/40 text-red-400 text-xs font-mono font-bold rounded-xl animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              <span>REC {formatDuration(recordingDuration)}</span>
            </div>
          )}

          {/* Privacy Shield Badge */}
          {isPrivacyMode && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold rounded-xl">
              <span>🛡️</span>
              <span>Privacy Shield ON</span>
            </div>
          )}
        </div>

        {/* Center Google Meet Title */}
        <div className="hidden md:flex items-center gap-2">
          <span className="font-bold text-white text-sm">genzis-meet</span>
          <span className="text-xs text-slate-500">•</span>
          <span className="text-xs text-slate-400 font-medium">{participants.length} Active Users</span>
        </div>

        {/* 1-Click Live Link Share Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={copyLiveInviteLink}
            className="px-4 py-2 bg-white hover:bg-slate-200 text-black font-semibold rounded-lg text-xs shadow-md transition-colors flex items-center gap-1.5 shrink-0"
          >
            <span>🔗</span>
            <span>{copiedText === "link" ? "Link Copied!" : "Copy Live Link"}</span>
          </button>
        </div>
      </header>

      {/* MAIN MEETING CANVAS */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 p-6 overflow-y-auto flex items-center justify-center relative">
          <div className={`w-full grid gap-4 ${getGridClass()} h-full max-h-[80vh]`}>
            {/* LOCAL USER TILE */}
            <div className="relative group w-full h-full min-h-[220px] rounded-2xl overflow-hidden bg-[#202124] border border-[#3c4043] flex items-center justify-center transition-all">
              {/* Privacy Watermark Overlay */}
              {isPrivacyMode && (
                <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center opacity-30 select-none">
                  <div className="rotate-[-25deg] text-center font-mono font-extrabold text-xs text-amber-300 uppercase tracking-widest bg-black/60 px-4 py-2 rounded-xl border border-amber-500/30">
                    🔒 PRIVACY PROTECTED • {email} • DO NOT RECORD
                  </div>
                </div>
              )}

              {/* Hand Raised Badge */}
              {isHandRaised && (
                <div className="absolute top-3 left-3 z-20 px-3 py-1 bg-amber-400 text-slate-950 font-extrabold text-xs rounded-full shadow-lg flex items-center gap-1.5 animate-bounce">
                  <span>✋</span>
                  <span>You Raised Hand</span>
                </div>
              )}

              {/* Mute Indicator */}
              <div className="absolute top-3 right-3 z-20">
                {isMuted ? (
                  <span className="w-8 h-8 rounded-full bg-red-600/90 text-white flex items-center justify-center text-xs shadow-md backdrop-blur-md">
                    🔇
                  </span>
                ) : (
                  <span className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs backdrop-blur-md">
                    🎤
                  </span>
                )}
              </div>

              {/* Video Element */}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  isCameraOff ? "opacity-0 absolute" : "opacity-100"
                }`}
              />

              {/* Camera Disabled Fallback */}
              {isCameraOff && (
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white font-black text-3xl flex items-center justify-center shadow-xl glow-brand">
                    {email.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Your Camera is Off</span>
                </div>
              )}

              {/* Info Overlay */}
              <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-white/10">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="text-xs font-semibold text-white">
                  You ({email.split('@')[0]}) {isHost && <span className="ml-1 text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-md font-bold uppercase">Host</span>}
                </span>
                {isScreenSharing && (
                  <span className="text-[10px] bg-[#8ab4f8] text-[#202124] px-2 py-0.5 rounded-md font-bold uppercase">
                    Presenting
                  </span>
                )}
              </div>
            </div>

            {/* REMOTE PARTICIPANTS TILES */}
            {Object.entries(remoteStreams).map(([socketId, p]) => {
              const rState = remoteStates[socketId] || {};
              return (
                <RemoteVideo
                  key={socketId}
                  stream={p.stream}
                  email={p.email}
                  isMuted={rState.isMuted}
                  isCameraOff={rState.isCameraOff}
                  isHandRaised={rState.isHandRaised}
                  isPrivacyMode={isPrivacyMode}
                />
              );
            })}
          </div>

          {/* FLOATING EMOJI REACTION ANIMATION OVERLAY */}
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-40 flex flex-col items-center gap-2">
            {floatingReactions.map((r) => (
              <div key={r.id} className="animate-float-reaction flex items-center gap-2 px-4 py-2 rounded-full bg-[#202124]/90 border border-[#3c4043] shadow-2xl">
                <span className="text-2xl">{r.emoji}</span>
                <span className="text-xs font-bold text-slate-200">{r.senderEmail.split('@')[0]}</span>
              </div>
            ))}
          </div>
        </main>

        {/* SIDE DRAWER: IN-CALL CHAT */}
        {showChat && (
          <div className="absolute top-0 right-0 bottom-0 z-40 w-full md:w-80">
            <Chat meetingId={meetingId} email={email} onClose={() => setShowChat(false)} />
          </div>
        )}

        {/* SIDE DRAWER: PARTICIPANTS */}
        {showParticipants && (
          <div className="w-80 h-full bg-[#202124] border-l border-[#3c4043] p-4 z-40 flex flex-col text-slate-100">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#3c4043]">
              <h3 className="font-bold text-white text-base">People ({participants.length})</h3>
              <button onClick={() => setShowParticipants(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {participants.map((u) => {
                const rState = remoteStates[u.socketId] || {};
                const isSelf = u.email === email;
                return (
                  <div key={u.socketId} className="p-3 rounded-xl bg-[#2d2f31] border border-[#3c4043] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-600/30 text-indigo-300 font-bold text-xs flex items-center justify-center border border-indigo-500/30">
                        {u.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-200">
                          {u.email} {isSelf && "(You)"}
                        </p>
                        <p className="text-[10px] text-slate-400">In Call</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {rState.isHandRaised && <span>✋</span>}
                      {rState.isMuted ? <span className="text-xs">🔇</span> : <span className="text-xs">🎤</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* GOOGLE MEET CENTERED FLOATING PILL CONTROL BAR */}
      <footer className="h-20 bg-[#202124] border-t border-[#3c4043] px-6 flex items-center justify-between z-30 shrink-0 relative">
        {/* Left Meeting Info */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInfoModal(true)}
            className="px-3.5 py-2 rounded-full bg-[#2d2f31] hover:bg-[#3c4043] border border-[#3c4043] text-xs font-semibold text-slate-200 flex items-center gap-2 transition-all"
          >
            <span>ℹ️</span>
            <span className="hidden sm:inline">Details</span>
          </button>
        </div>

        {/* CENTER GOOGLE MEET CONTROLS */}
        <div className="flex items-center gap-3">
          {/* Mute Mic */}
          <button
            onClick={toggleMicrophone}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all duration-200 shadow-md ${
              isMuted ? "bg-red-600 text-white" : "bg-[#3c4043] hover:bg-slate-600 text-slate-100"
            }`}
            title={isMuted ? "Unmute Mic" : "Mute Mic"}
          >
            {isMuted ? "🔇" : "🎤"}
          </button>

          {/* Camera On/Off */}
          <button
            onClick={toggleCamera}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all duration-200 shadow-md ${
              isCameraOff ? "bg-red-600 text-white" : "bg-[#3c4043] hover:bg-slate-600 text-slate-100"
            }`}
            title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
          >
            {isCameraOff ? "📷" : "📹"}
          </button>

          {/* Screen Share */}
          <button
            onClick={toggleScreenShare}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all duration-200 shadow-md ${
              isScreenSharing ? "bg-[#8ab4f8] text-[#202124]" : "bg-[#3c4043] hover:bg-slate-600 text-slate-100"
            }`}
            title="Present Screen"
          >
            🖥️
          </button>

          {/* Raise Hand */}
          <button
            onClick={toggleRaiseHand}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all duration-200 shadow-md ${
              isHandRaised ? "bg-amber-400 text-slate-950 font-bold" : "bg-[#3c4043] hover:bg-slate-600 text-slate-100"
            }`}
            title="Raise Hand"
          >
            ✋
          </button>

          {/* Emoji Reactions Trigger */}
          <div className="relative">
            <button
              onClick={() => setShowReactionsMenu(!showReactionsMenu)}
              className="w-12 h-12 rounded-full bg-[#3c4043] hover:bg-slate-600 text-slate-100 flex items-center justify-center text-lg font-bold transition-all shadow-md"
              title="Send Reaction"
            >
              😀
            </button>

            {showReactionsMenu && (
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-[#2d2f31] border border-[#3c4043] p-2 rounded-2xl shadow-2xl flex gap-2 z-50">
                {["❤️", "👏", "👍", "🔥", "🎉"].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => sendEmojiReaction(emoji)}
                    className="p-2 hover:scale-125 transition-transform text-xl"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Record Lecture Button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all duration-200 shadow-md ${
              isRecording ? "bg-red-600 text-white animate-pulse" : isPrivacyMode && !isHost ? "bg-gray-700 text-gray-400 cursor-not-allowed opacity-50" : "bg-[#3c4043] hover:bg-slate-600 text-slate-100"
            }`}
            title={isPrivacyMode && !isHost ? "Recording blocked by Host Privacy Shield" : isRecording ? "Stop Recording" : "Record Lecture"}
          >
            🎙️
          </button>

          {/* Privacy Shield Toggle Button */}
          <button
            onClick={togglePrivacyShield}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all duration-200 shadow-md ${
              isPrivacyMode ? "bg-amber-500 text-slate-950" : "bg-[#3c4043] hover:bg-slate-600 text-slate-100"
            } ${!isHost ? "opacity-60 cursor-not-allowed" : ""}`}
            title={!isHost ? "Only host can toggle Privacy Shield" : isPrivacyMode ? "Disable Privacy Shield" : "Enable Privacy Shield"}
          >
            🛡️
          </button>
        </div>

        {/* Right Drawer Triggers & End Call */}
        <div className="flex items-center gap-3">
          {/* People Drawer */}
          <button
            onClick={() => {
              setShowParticipants(!showParticipants);
              if (showChat) setShowChat(false);
            }}
            className={`px-3 py-2 rounded-full text-xs font-semibold border transition-all flex items-center gap-2 ${
              showParticipants ? "bg-[#8ab4f8] text-[#202124] border-[#8ab4f8]" : "bg-[#2d2f31] hover:bg-[#3c4043] border-[#3c4043] text-slate-200"
            }`}
          >
            <span>👥</span>
            <span className="hidden md:inline">{participants.length}</span>
          </button>

          {/* Chat Drawer */}
          <button
            onClick={() => {
              setShowChat(!showChat);
              if (showParticipants) setShowParticipants(false);
            }}
            className={`px-3 py-2 rounded-full text-xs font-semibold border transition-all flex items-center gap-2 ${
              showChat ? "bg-[#8ab4f8] text-[#202124] border-[#8ab4f8]" : "bg-[#2d2f31] hover:bg-[#3c4043] border-[#3c4043] text-slate-200"
            }`}
          >
            <span>💬</span>
            <span className="hidden md:inline">Chat</span>
          </button>

          {/* End Call / End Meeting for All Buttons */}
          {isHost ? (
            <div className="flex items-center gap-2">
              <button
                onClick={leaveMeeting}
                className="px-3 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs shadow-lg transition-all"
                title="Leave Meeting (Host leaves room)"
              >
                Leave
              </button>
              <button
                onClick={endMeetingForEveryone}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs shadow-lg transition-all flex items-center gap-1.5 animate-pulse"
                title="End Meeting for All Participants"
              >
                <span>🛑</span>
                <span className="hidden lg:inline">End Meeting</span>
              </button>
            </div>
          ) : (
            <button
              onClick={leaveMeeting}
              className="w-14 h-11 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-lg flex items-center justify-center shadow-lg transition-all"
              title="Leave Call"
            >
              📞
            </button>
          )}
        </div>
      </footer>

      {/* MEETING INFO MODAL */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#2d2f31] rounded-2xl p-6 relative border border-[#3c4043]">
            <button onClick={() => setShowInfoModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">✕</button>

            <h3 className="text-xl font-bold text-white mb-1">Joining info</h3>
            <p className="text-xs text-slate-400 mb-6">Share this live link to invite participants instantly</p>

            <div className="space-y-4 bg-[#202124] p-4 rounded-xl border border-[#3c4043] mb-6">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Direct Live Invite Link</span>
                <div className="flex items-center justify-between mt-1 gap-2">
                  <span className="text-xs text-[#8ab4f8] font-mono truncate">
                    {window.location.origin}/meeting/live/{meetingId}?passcode={meetingPasscode}
                  </span>
                  <button
                    onClick={copyLiveInviteLink}
                    className="text-xs px-3 py-1.5 bg-[#8ab4f8] text-[#202124] font-bold rounded-lg shrink-0"
                  >
                    {copiedText === "link" ? "Copied!" : "Copy Link"}
                  </button>
                </div>
              </div>

              <div className="border-t border-[#3c4043] pt-3">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Meeting ID</span>
                <p className="font-mono font-bold text-indigo-300 text-base mt-0.5">{meetingId}</p>
              </div>
            </div>

            {isHost && (
              <div className="flex gap-2">
                <button
                  onClick={endMeetingForEveryone}
                  className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs shadow-lg transition-all border border-red-500/30 flex items-center justify-center gap-2"
                >
                  <span>🛑</span>
                  <span>End Meeting for All Participants</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Meeting;