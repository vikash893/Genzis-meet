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

import socket, { connectSocket } from "../socket";
import { ENDPOINTS } from "../api";
import Chat from "../components/Chat";
import RemoteVideo from "../components/RemoteVideo";

function Meeting() {
  const { meetingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Parse URL search params (e.g. ?passcode=1234)
  const searchParams = new URLSearchParams(location.search);
  const urlPasscode = searchParams.get("passcode") || location.state?.passcode || "";

  // User credentials
  const email = location.state?.email || localStorage.getItem("userEmail") || "Guest User";
  const [meetingPasscode, setMeetingPasscode] = useState(urlPasscode);
  const [meetingTitle, setMeetingTitle] = useState("Untitled meeting");
  const [currentSubtitle, setCurrentSubtitle] = useState(null);
  const speechRecognitionRef = useRef(null);

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

    const handleMeetingAccessDenied = ({ message }) => {
      alert(message || "You do not have access to this meeting.");
      navigate("/dashboard");
    };

    const handleMeetingInfo = ({ title, passcode }) => {
      setMeetingTitle(title || "Untitled meeting");
      if (passcode) setMeetingPasscode(passcode);
    };
    const handleSubtitle = (subtitle) => {
      setCurrentSubtitle(subtitle);
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
    socket.on("meeting-access-denied", handleMeetingAccessDenied);
    socket.on("meeting-info", handleMeetingInfo);
    socket.on("subtitle", handleSubtitle);

    const startMeeting = async () => {
      connectSocket();
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
          socket.emit("join-meeting", { meetingId, passcode: urlPasscode });
        }
      } catch (err) {
        console.error("Camera/Mic error:", err);
      }
    };

    startMeeting();

    return () => {
      hasJoinedMeetingRef.current = false;
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
      socket.off("meeting-access-denied", handleMeetingAccessDenied);
      socket.off("meeting-info", handleMeetingInfo);
      socket.off("subtitle", handleSubtitle);

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
  }, [meetingId, email, urlPasscode, createPeerConnection]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return undefined;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (result.isFinal) {
        socket.emit("send-subtitle", {
          meetingId,
          text: result[0].transcript,
          timestamp: new Date().toISOString()
        });
      }
    };
    recognition.onerror = (error) => console.warn("Speech recognition unavailable:", error.error);
    recognition.onend = () => {
      if (hasJoinedMeetingRef.current) {
        try { recognition.start(); } catch (error) { /* Browser may already be restarting. */ }
      }
    };
    speechRecognitionRef.current = recognition;
    try { recognition.start(); } catch (error) { console.warn("Speech recognition start failed", error); }

    return () => {
      hasJoinedMeetingRef.current = false;
      recognition.stop();
      speechRecognitionRef.current = null;
    };
  }, [meetingId]);

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
    if (!isHost) {
      alert("Only the host can record this meeting.");
      return;
    }

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

      mediaRecorder.onstop = async () => {
        clearInterval(recordingTimerRef.current);
        setIsRecording(false);
        setRecordingDuration(0);

        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        try {
          const response = await fetch(ENDPOINTS.MEETING_RECORDING(meetingId), {
            method: "POST",
            headers: {
              "Content-Type": "video/webm",
              Authorization: `Bearer ${localStorage.getItem("token")}`
            },
            body: blob
          });
          if (!response.ok) throw new Error("Recording upload failed");
        } catch (error) {
          console.error("Recording upload error:", error);
          alert("Recording could not be saved to the server. A local download is still available.");
        }

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
              <span className="text-xs text-white max-w-[220px] truncate">{meetingTitle}</span>
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
              <svg className="w-4 h-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
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
            <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
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
                  <svg className="w-4 h-4 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5a1.5 1.5 0 113 0m-3 0V11m3-5.5a1.5 1.5 0 113 0V11" />
                  </svg>
                  <span>You Raised Hand</span>
                </div>
              )}

              {/* Mute Indicator */}
              <div className="absolute top-3 right-3 z-20">
                {isMuted ? (
                  <span className="w-8 h-8 rounded-full bg-red-600/90 text-white flex items-center justify-center text-xs shadow-md backdrop-blur-md">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  </span>
                ) : (
                  <span className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs backdrop-blur-md">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
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
          {currentSubtitle && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 max-w-[80%] px-5 py-2 rounded-xl bg-black/75 text-white text-sm text-center shadow-xl">
              <strong>{currentSubtitle.email?.split("@")[0]}:</strong> {currentSubtitle.text}
            </div>
          )}
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
                      {rState.isHandRaised && (
                        <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5a1.5 1.5 0 113 0m-3 0V11m3-5.5a1.5 1.5 0 113 0V11" />
                        </svg>
                      )}
                      {rState.isMuted ? (
                        <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      )}
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
            <svg className="w-4 h-4 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">Details</span>
          </button>
        </div>

        {/* CENTER GOOGLE MEET CONTROLS */}
        <div className="flex items-center gap-3">
          {/* Mute Mic */}
          <button
            onClick={toggleMicrophone}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
              isMuted ? "bg-red-600 text-white" : "bg-[#3c4043] hover:bg-slate-600 text-slate-100"
            }`}
            title={isMuted ? "Unmute Mic" : "Mute Mic"}
          >
            {isMuted ? (
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-slate-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          {/* Camera On/Off */}
          <button
            onClick={toggleCamera}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
              isCameraOff ? "bg-red-600 text-white" : "bg-[#3c4043] hover:bg-slate-600 text-slate-100"
            }`}
            title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
          >
            {isCameraOff ? (
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-slate-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          {/* Screen Share */}
          <button
            onClick={toggleScreenShare}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
              isScreenSharing ? "bg-[#8ab4f8] text-[#202124]" : "bg-[#3c4043] hover:bg-slate-600 text-slate-100"
            }`}
            title="Present Screen"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Raise Hand */}
          <button
            onClick={toggleRaiseHand}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
              isHandRaised ? "bg-amber-400 text-slate-950 font-bold" : "bg-[#3c4043] hover:bg-slate-600 text-slate-100"
            }`}
            title="Raise Hand"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5a1.5 1.5 0 113 0m-3 0V11m3-5.5a1.5 1.5 0 113 0V11" />
            </svg>
          </button>

          {/* Emoji Reactions Trigger */}
          <div className="relative">
            <button
              onClick={() => setShowReactionsMenu(!showReactionsMenu)}
              className="w-12 h-12 rounded-full bg-[#3c4043] hover:bg-slate-600 text-slate-100 flex items-center justify-center transition-all shadow-md"
              title="Send Reaction"
            >
              <svg className="w-5 h-5 text-slate-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
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
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
              isRecording ? "bg-red-600 text-white animate-pulse" : isPrivacyMode && !isHost ? "bg-gray-700 text-gray-400 cursor-not-allowed opacity-50" : "bg-[#3c4043] hover:bg-slate-600 text-slate-100"
            }`}
            title={isPrivacyMode && !isHost ? "Recording blocked by Host Privacy Shield" : isRecording ? "Stop Recording" : "Record Lecture"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="5" fill="currentColor" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            </svg>
          </button>

          {/* Privacy Shield Toggle Button */}
          <button
            onClick={togglePrivacyShield}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
              isPrivacyMode ? "bg-amber-500 text-slate-950" : "bg-[#3c4043] hover:bg-slate-600 text-slate-100"
            } ${!isHost ? "opacity-60 cursor-not-allowed" : ""}`}
            title={!isHost ? "Only host can toggle Privacy Shield" : isPrivacyMode ? "Disable Privacy Shield" : "Enable Privacy Shield"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
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
            className={`px-3.5 py-2 rounded-full text-xs font-semibold border transition-all flex items-center gap-2 ${
              showParticipants ? "bg-[#8ab4f8] text-[#202124] border-[#8ab4f8]" : "bg-[#2d2f31] hover:bg-[#3c4043] border-[#3c4043] text-slate-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="hidden md:inline">{participants.length}</span>
          </button>

          {/* Chat Drawer */}
          <button
            onClick={() => {
              setShowChat(!showChat);
              if (showParticipants) setShowParticipants(false);
            }}
            className={`px-3.5 py-2 rounded-full text-xs font-semibold border transition-all flex items-center gap-2 ${
              showChat ? "bg-[#8ab4f8] text-[#202124] border-[#8ab4f8]" : "bg-[#2d2f31] hover:bg-[#3c4043] border-[#3c4043] text-slate-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="hidden md:inline">Chat</span>
          </button>

          {/* End Call / End Meeting for All Buttons */}
          {isHost ? (
            <div className="flex items-center gap-2">
              <button
                onClick={leaveMeeting}
                className="px-3.5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs shadow-lg transition-all"
                title="Leave Meeting (Host leaves room)"
              >
                Leave
              </button>
              <button
                onClick={endMeetingForEveryone}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs shadow-lg transition-all flex items-center gap-1.5 animate-pulse"
                title="End Meeting for All Participants"
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                </svg>
                <span className="hidden lg:inline">End Meeting</span>
              </button>
            </div>
          ) : (
            <button
              onClick={leaveMeeting}
              className="w-14 h-11 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-lg flex items-center justify-center shadow-lg transition-all"
              title="Leave Call"
            >
              <svg className="w-6 h-6 text-white rotate-[135deg]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
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