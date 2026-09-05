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

  // Parse URL search params & fallback to sessionStorage to survive page refresh
  const searchParams = new URLSearchParams(location.search);
  const storedPasscode = sessionStorage.getItem(`meeting_passcode_${meetingId}`) || "";
  const initialPasscode = searchParams.get("passcode") || location.state?.passcode || storedPasscode || "";

  if (initialPasscode) {
    sessionStorage.setItem(`meeting_passcode_${meetingId}`, initialPasscode);
  }

  // User credentials
  const email = location.state?.email || localStorage.getItem("userEmail") || "Guest User";
  const [meetingPasscode, setMeetingPasscode] = useState(initialPasscode);
  const passcodeRef = useRef(initialPasscode);
  passcodeRef.current = meetingPasscode || initialPasscode;

  const [meetingTitle, setMeetingTitle] = useState("Untitled meeting");
  const [currentSubtitle, setCurrentSubtitle] = useState(null);
  const speechRecognitionRef = useRef(null);

  // Media Refs
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  const participantsRef = useRef([]);

  // MediaRecorder Refs
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // States
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingBlobUrl, setRecordingBlobUrl] = useState(null);
  const [showRecordingPlayer, setShowRecordingPlayer] = useState(false);

  // Privacy Shield State
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);

  // Loading/Connecting State
  const [isConnecting, setIsConnecting] = useState(true);

  // Network Monitoring States
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [socketStatus, setSocketStatus] = useState(socket.connected ? "connected" : "connecting");
  const [networkQuality, setNetworkQuality] = useState("good"); // "excellent" | "good" | "weak" | "poor" | "offline"
  const [networkStats, setNetworkStats] = useState({
    ping: 0,
    packetLoss: 0,
    iceState: "connected",
    candidateType: "STUN",
    logs: []
  });
  const [showNetworkModal, setShowNetworkModal] = useState(false);

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
  const makingOfferRef = useRef(new Map());

  const addNetworkLog = (msg) => {
    setNetworkStats((prev) => ({
      ...prev,
      logs: [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.logs.slice(0, 19)]
    }));
  };

  // Listen to browser network status (Online/Offline)
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addNetworkLog("Internet connection restored.");
    };
    const handleOffline = () => {
      setIsOnline(false);
      setNetworkQuality("offline");
      addNetworkLog("⚠️ Internet connection lost (Browser Offline).");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // WebRTC Peer Connection Stats & Network Polling Loop
  useEffect(() => {
    const statsInterval = setInterval(async () => {
      if (!navigator.onLine) {
        setNetworkQuality("offline");
        return;
      }

      let totalPing = 0;
      let totalLoss = 0;
      let count = 0;
      let lastCandidateType = "STUN";
      let overallIceState = "connected";

      for (const [, pc] of peerConnectionsRef.current.entries()) {
        overallIceState = pc.iceConnectionState || pc.connectionState;

        try {
          const stats = await pc.getStats();
          for (const report of stats.values()) {
            if (report.type === "candidate-pair" && report.state === "succeeded") {
              if (report.currentRoundTripTime) {
                totalPing += report.currentRoundTripTime * 1000;
                count++;
              }
            }
            if (report.type === "inbound-rtp" && report.kind === "video") {
              if (report.packetsLost && report.packetsReceived) {
                const lossRatio = (report.packetsLost / (report.packetsLost + report.packetsReceived)) * 100;
                totalLoss += lossRatio;
              }
            }
            if (report.type === "local-candidate") {
              if (report.candidateType === "relay") lastCandidateType = "TURN";
              else if (report.candidateType === "host") lastCandidateType = "Host Direct";
            }
          }
        } catch (e) {
          // Peer connection stats fetch warning
        }
      }

      const avgPing = count > 0 ? Math.round(totalPing / count) : 45;
      const avgLoss = count > 0 ? Math.round((totalLoss / count) * 10) / 10 : 0;

      let quality = "excellent";
      if (!navigator.onLine || socketStatus === "disconnected") quality = "offline";
      else if (avgPing > 500 || avgLoss > 15 || overallIceState === "disconnected") quality = "poor";
      else if (avgPing > 250 || avgLoss > 5) quality = "weak";
      else if (avgPing > 120) quality = "good";

      setNetworkQuality(quality);
      setNetworkStats((prev) => ({
        ...prev,
        ping: avgPing,
        packetLoss: avgLoss,
        iceState: overallIceState,
        candidateType: lastCandidateType
      }));
    }, 3000);

    return () => clearInterval(statsInterval);
  }, [socketStatus]);

  const syncLocalTracksToPeers = useCallback(() => {
    const activeStream = screenStreamRef.current || localStreamRef.current;
    if (!activeStream) return;

    peerConnectionsRef.current.forEach((pc) => {
      activeStream.getTracks().forEach((track) => {
        const senders = pc.getSenders();
        const alreadyAdded = senders.some((s) => s.track && s.track.kind === track.kind);
        if (!alreadyAdded) {
          pc.addTrack(track, activeStream);
        } else {
          const sender = senders.find((s) => s.track && s.track.kind === track.kind);
          if (sender && sender.track !== track) {
            sender.replaceTrack(track);
          }
        }
      });
    });
  }, []);

  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ];

  const createPeerConnection = useCallback((targetSocketId) => {
    if (peerConnectionsRef.current.has(targetSocketId)) {
      return peerConnectionsRef.current.get(targetSocketId);
    }

    const peerConnection = new RTCPeerConnection({ iceServers });

    const activeStream = screenStreamRef.current || localStreamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, activeStream);
      });
    } else {
      try {
        peerConnection.addTransceiver("audio", { direction: "sendrecv" });
        peerConnection.addTransceiver("video", { direction: "sendrecv" });
      } catch (e) {
        console.warn("Transceiver fallback warning:", e);
      }
    }

    peerConnectionsRef.current.set(targetSocketId, peerConnection);

    peerConnection.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current.set(targetSocketId, true);
        const offer = await peerConnection.createOffer();
        if (peerConnection.signalingState !== "stable") return;
        await peerConnection.setLocalDescription(offer);
        socket.emit("offer", { targetSocketId, offer: peerConnection.localDescription });
      } catch (err) {
        console.error("Negotiation needed error:", err);
      } finally {
        makingOfferRef.current.set(targetSocketId, false);
      }
    };

    peerConnection.ontrack = (event) => {
      const stream = event.streams[0] || (event.track ? new MediaStream([event.track]) : null);
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
      const state = peerConnection.connectionState || peerConnection.iceConnectionState;
      if (state === "failed" || state === "closed") {
        peerConnectionsRef.current.delete(targetSocketId);
        pendingCandidatesRef.current.delete(targetSocketId);
        makingOfferRef.current.delete(targetSocketId);
        setRemoteStreams((prev) => {
          const updated = { ...prev };
          delete updated[targetSocketId];
          return updated;
        });
        addNetworkLog(`Peer connection with ${targetSocketId} closed/failed.`);
      } else if (state === "disconnected") {
        addNetworkLog(`⚠️ Peer connection with ${targetSocketId} temporarily disconnected.`);
      }
    };

    return peerConnection;
  }, []);

  // Socket & Media Effect
  useEffect(() => {
    const handleUserJoined = async (user) => {
      try {
        // Instant cleanup: If we already have a stream for this email under an old socketId, tear it down immediately
        setRemoteStreams((prev) => {
          let modified = false;
          const copy = { ...prev };
          Object.entries(copy).forEach(([sId, data]) => {
            if (data.email === user.email && sId !== user.socketId) {
              delete copy[sId];
              modified = true;
              const pc = peerConnectionsRef.current.get(sId);
              if (pc) pc.close();
              peerConnectionsRef.current.delete(sId);
              pendingCandidatesRef.current.delete(sId);
              makingOfferRef.current.delete(sId);
            }
          });
          return modified ? copy : prev;
        });

        const pc = createPeerConnection(user.socketId);
        syncLocalTracksToPeers();
        makingOfferRef.current.set(user.socketId, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { targetSocketId: user.socketId, offer });
      } catch (err) {
        console.error("Offer error:", err);
      } finally {
        makingOfferRef.current.set(user.socketId, false);
      }
    };

    const handleOffer = async ({ fromSocketId, offer }) => {
      try {
        const pc = createPeerConnection(fromSocketId);
        syncLocalTracksToPeers();

        const isImpolite = socket.id > fromSocketId;
        const offerCollision = makingOfferRef.current.get(fromSocketId) || pc.signalingState !== "stable";

        if (isImpolite && offerCollision) return;

        if (offerCollision) {
          await pc.setLocalDescription({ type: "rollback" });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const pending = pendingCandidatesRef.current.get(fromSocketId) || [];
        for (const cand of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
        }
        pendingCandidatesRef.current.delete(fromSocketId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { targetSocketId: fromSocketId, answer });
      } catch (err) {
        console.error("Offer handling error:", err);
      }
    };

    const handleAnswer = async ({ fromSocketId, answer }) => {
      const pc = peerConnectionsRef.current.get(fromSocketId);
      if (pc) {
        try {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));

            const pending = pendingCandidatesRef.current.get(fromSocketId) || [];
            for (const cand of pending) {
              try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
            }
            pendingCandidatesRef.current.delete(fromSocketId);
          }
        } catch (err) {
          console.error("Answer set error:", err);
        }
      }
    };

    const handleIceCandidate = async ({ fromSocketId, candidate }) => {
      const pc = peerConnectionsRef.current.get(fromSocketId);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("ICE add error:", err);
        }
      } else {
        if (!pendingCandidatesRef.current.has(fromSocketId)) {
          pendingCandidatesRef.current.set(fromSocketId, []);
        }
        pendingCandidatesRef.current.get(fromSocketId).push(candidate);
      }
    };

    const handleParticipants = (users) => {
      setParticipants(users);
      participantsRef.current = users;

      setRemoteStreams((prev) => {
        let hasChanges = false;
        const updated = { ...prev };
        users.forEach((u) => {
          if (updated[u.socketId] && updated[u.socketId].email !== u.email) {
            updated[u.socketId] = { ...updated[u.socketId], email: u.email };
            hasChanges = true;
          }
        });
        return hasChanges ? updated : prev;
      });
    };

    const handleChatHistory = (history) => {
      if (!history || history.length === 0) return;
      setChatMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages = history.filter((m) => !existingIds.has(m.id));
        if (newMessages.length === 0) return prev;
        const merged = [...prev, ...newMessages];
        merged.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        return merged;
      });
    };

    const handleReceiveMessage = (chatMessage) => {
      setChatMessages((prev) => {
        if (prev.some((item) => item.id === chatMessage.id || (item.timestamp === chatMessage.timestamp && item.email === chatMessage.email && item.message === chatMessage.message))) {
          return prev;
        }
        return [...prev, chatMessage];
      });
    };

    const handleUserLeft = ({ socketId }) => {
      const pc = peerConnectionsRef.current.get(socketId);
      if (pc) pc.close();
      peerConnectionsRef.current.delete(socketId);
      pendingCandidatesRef.current.delete(socketId);
      makingOfferRef.current.delete(socketId);

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
      if (passcode) {
        setMeetingPasscode(passcode);
        passcodeRef.current = passcode;
        sessionStorage.setItem(`meeting_passcode_${meetingId}`, passcode);
      }
    };

    const handleSubtitle = (subtitle) => {
      setCurrentSubtitle(subtitle);
    };

    const handleMeetingEndedByHost = () => {
      alert("The meeting has been ended by the host.");
      leaveMeeting();
    };

    // Socket Connection Lifecycle Listeners
    const handleConnect = () => {
      setSocketStatus("connected");
      addNetworkLog("Socket connected to signaling server.");
      if (!hasJoinedMeetingRef.current) return;
      const activePasscode = passcodeRef.current || sessionStorage.getItem(`meeting_passcode_${meetingId}`) || "";
      socket.emit("join-meeting", { meetingId, passcode: activePasscode });
    };

    const handleDisconnect = (reason) => {
      setSocketStatus("disconnected");
      addNetworkLog(`⚠️ Socket disconnected: ${reason}`);
    };

    const handleConnectError = (error) => {
      setSocketStatus("reconnecting");
      addNetworkLog(`⚠️ Socket connect error: ${error.message || "Server unreachable"}`);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
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
    socket.on("chat-history", handleChatHistory);
    socket.on("receive-message", handleReceiveMessage);

    const startMeeting = async () => {
      connectSocket();
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      } catch (err1) {
        console.warn("Could not get video and audio, trying video only:", err1);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (err2) {
          console.warn("Could not get video, trying audio only:", err2);
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          } catch (err3) {
            console.error("Camera and mic unavailable:", err3);
          }
        }
      }

      if (stream) {
        localStreamRef.current = stream;
        const hasVideo = stream.getVideoTracks().length > 0;
        const hasAudio = stream.getAudioTracks().length > 0;
        setIsCameraOff(!hasVideo);
        setIsMuted(!hasAudio);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }
        syncLocalTracksToPeers();
      } else {
        setIsCameraOff(true);
        setIsMuted(true);
      }

      hasJoinedMeetingRef.current = true;
      const activePasscode = passcodeRef.current || sessionStorage.getItem(`meeting_passcode_${meetingId}`) || "";
      socket.emit("join-meeting", { meetingId, passcode: activePasscode });
      setIsConnecting(false);
    };

    startMeeting();

    return () => {
      hasJoinedMeetingRef.current = false;
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
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
      socket.off("chat-history", handleChatHistory);
      socket.off("receive-message", handleReceiveMessage);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      pendingCandidatesRef.current.clear();
      makingOfferRef.current.clear();
    };
  }, [meetingId, email, createPeerConnection, syncLocalTracksToPeers]);

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
      if (speechRecognitionRef.current) {
        try { recognition.start(); } catch (error) { /* Browser may already be restarting. */ }
      }
    };
    speechRecognitionRef.current = recognition;
    try { recognition.start(); } catch (error) { console.warn("Speech recognition start failed", error); }

    return () => {
      speechRecognitionRef.current = null;
      recognition.stop();
    };
  }, [meetingId]);

  useEffect(() => {
    const activeStream = screenStreamRef.current || localStreamRef.current;
    if (localVideoRef.current && activeStream) {
      localVideoRef.current.srcObject = activeStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [isCameraOff, isScreenSharing]);

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

  const toggleCamera = async () => {
    if (!localStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        setIsCameraOff(false);
        setIsMuted(false);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }
        peerConnectionsRef.current.forEach((pc) => {
          stream.getTracks().forEach((track) => {
            const existingSender = pc.getSenders().find((s) => s.track && s.track.kind === track.kind);
            if (existingSender) {
              existingSender.replaceTrack(track);
            } else {
              pc.addTrack(track, stream);
            }
          });
        });
        socket.emit("user-media-state", { meetingId, email, isMuted: false, isCameraOff: false });
      } catch (err) {
        console.error("Could not acquire media:", err);
        alert("Camera/microphone permission is required. Please allow access in your browser settings.");
      }
      return;
    }

    const videoTracks = localStreamRef.current.getVideoTracks();

    if (videoTracks.length === 0) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newVideoTrack = newStream.getVideoTracks()[0];

        localStreamRef.current.addTrack(newVideoTrack);
        setIsCameraOff(false);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          localVideoRef.current.play().catch(() => {});
        }

        peerConnectionsRef.current.forEach((pc) => {
          const videoSender = pc.getSenders().find((s) => s.track?.kind === "video" || (!s.track && s._kind === "video"));
          if (videoSender) {
            videoSender.replaceTrack(newVideoTrack);
          } else {
            pc.addTrack(newVideoTrack, localStreamRef.current);
          }
        });

        socket.emit("user-media-state", { meetingId, email, isMuted, isCameraOff: false });
      } catch (err) {
        console.error("Could not acquire video:", err);
        alert("Camera permission is required. Please allow camera access in your browser settings.");
      }
      return;
    }

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

  const handleSendChatMessage = (chatMsg) => {
    setChatMessages((prev) => {
      if (prev.some((item) => item.id === chatMsg.id)) return prev;
      return [...prev, chatMsg];
    });
    socket.emit("send-message", chatMsg);
  };

  const togglePictureInPicture = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }

      if (!document.pictureInPictureEnabled) {
        alert("Picture-in-Picture is not supported in this browser.");
        return;
      }

      const videoEl = localVideoRef.current;
      if (!videoEl || !videoEl.srcObject || isCameraOff) {
        alert("Please turn on your camera to use Picture-in-Picture.");
        return;
      }

      if (videoEl.readyState >= 1) {
        await videoEl.requestPictureInPicture();
      }
    } catch (err) {
      console.error("Picture-in-Picture error:", err);
    }
  };

  const togglePrivacyShield = () => {
    if (!isHost) {
      alert("Only the host can toggle Privacy Shield mode.");
      return;
    }
    const nextPrivacy = !isPrivacyMode;
    setIsPrivacyMode(nextPrivacy);
    socket.emit("toggle-privacy-mode", { meetingId, isPrivacyMode: nextPrivacy });
  };

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

        const blobUrl = URL.createObjectURL(blob);
        setRecordingBlobUrl(blobUrl);
        setShowRecordingPlayer(true);

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
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      displayStream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };
    } catch (err) {
      console.error("Recording start error:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      }
    }
  };

  const downloadRecordingBlob = () => {
    if (!recordingBlobUrl) return;
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = recordingBlobUrl;
    a.download = `GenzMeet-Recording-${meetingId}-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 100);
  };

  const shareRecording = async () => {
    if (navigator.share) {
      try {
        const blob = await fetch(recordingBlobUrl).then((r) => r.blob());
        const file = new File([blob], `GenzMeet-Recording-${meetingId}.webm`, { type: "video/webm" });
        await navigator.share({
          title: `Meeting Recording - ${meetingId}`,
          text: `Recording from Genzis-Meet session ${meetingId}`,
          files: [file]
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          navigator.clipboard.writeText(window.location.href);
          alert("Link copied to clipboard! Share the meeting link with your recording.");
        }
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Link copied to clipboard!");
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
    if (totalTiles === 2) return "grid-cols-1 sm:grid-cols-2 max-w-6xl mx-auto";
    if (totalTiles <= 4) return "grid-cols-1 sm:grid-cols-2 max-w-6xl mx-auto";
    if (totalTiles <= 6) return "grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto";
    return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-w-7xl mx-auto";
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1a2e] text-slate-100 overflow-hidden relative select-none font-sans">

      {/* CONNECTING OVERLAY */}
      {isConnecting && (
        <div className="absolute inset-0 z-[100] bg-[#1a1a2e] flex flex-col items-center justify-center gap-6">
          <div className="w-16 h-16 border-4 border-[#8ab4f8]/30 border-t-[#8ab4f8] rounded-full animate-spin"></div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white mb-2">Joining Meeting...</h2>
            <p className="text-sm text-slate-400">Setting up your camera and microphone</p>
          </div>
        </div>
      )}

      {/* TOP NETWORK WARNING BANNER */}
      {!isOnline && (
        <div className="bg-red-600 text-white text-xs py-2 px-4 text-center font-bold flex items-center justify-center gap-2 z-50 animate-pulse">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>⚠️ Internet Offline — Reconnecting automatically once network is available...</span>
          <button onClick={() => setShowNetworkModal(true)} className="underline ml-2 hover:text-slate-200">Diagnostics</button>
        </div>
      )}

      {isOnline && socketStatus === "reconnecting" && (
        <div className="bg-amber-500 text-slate-950 text-xs py-1.5 px-4 text-center font-bold flex items-center justify-center gap-2 z-50">
          <div className="w-3 h-3 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin"></div>
          <span>⚡ Weak Network — Reconnecting to meeting server...</span>
          <button onClick={() => setShowNetworkModal(true)} className="underline ml-2 hover:text-slate-800">Check Stats</button>
        </div>
      )}

      {isOnline && socketStatus === "connected" && networkQuality === "weak" && (
        <div className="bg-amber-500/90 text-slate-950 text-xs py-1.5 px-4 text-center font-bold flex items-center justify-center gap-2 z-40">
          <span>📶 Weak Network Signal (Latency: {networkStats.ping}ms) — Consider turning off camera to save bandwidth.</span>
          <button onClick={() => setShowNetworkModal(true)} className="underline ml-2 hover:text-slate-800">Diagnostics</button>
        </div>
      )}

      {/* TOP HEADER */}
      <header className="h-14 sm:h-16 px-3 sm:px-6 bg-[#16213e] border-b border-[#0f3460]/50 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="flex items-center gap-2 bg-[#0f3460] border border-[#533483]/40 px-2.5 sm:px-3.5 py-1.5 rounded-xl min-w-0">
            <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0 ${isOnline && socketStatus === "connected" ? "bg-emerald-400 animate-pulse" : "bg-red-500 animate-ping"}`}></span>
            <span className="font-mono font-bold text-xs sm:text-sm text-[#8ab4f8] tracking-wider shrink-0">
              {meetingId}
            </span>
            <span className="text-[10px] sm:text-xs text-white max-w-[100px] sm:max-w-[220px] truncate hidden sm:inline">{meetingTitle}</span>
          </div>

          {/* Recording Badge */}
          {isRecording && (
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 bg-red-600/20 border border-red-500/40 text-red-400 text-[10px] sm:text-xs font-mono font-bold rounded-xl animate-pulse shrink-0">
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-500"></span>
              <span>REC {formatDuration(recordingDuration)}</span>
            </div>
          )}

          {/* Network Quality Badge in Header */}
          <button
            onClick={() => setShowNetworkModal(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              !isOnline || socketStatus === "disconnected"
                ? "bg-red-600/20 text-red-400 border-red-500/40"
                : networkQuality === "weak" || networkQuality === "poor"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
            }`}
            title="Click for Network Diagnostics"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
            <span className="hidden sm:inline">
              {!isOnline ? "Offline" : `${networkStats.ping}ms`}
            </span>
          </button>
        </div>

        {/* Center Title */}
        <div className="hidden md:flex items-center gap-2">
          <span className="font-bold text-white text-sm">genzis-meet</span>
          <span className="text-xs text-slate-500">•</span>
          <span className="text-xs text-slate-400 font-medium">{participants.length} Active</span>
        </div>

        {/* Share Button */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={copyLiveInviteLink}
            className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#1a1a2e] font-semibold rounded-lg text-[10px] sm:text-xs shadow-md transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="hidden sm:inline">{copiedText === "link" ? "Copied!" : "Copy Link"}</span>
          </button>
        </div>
      </header>

      {/* MAIN MEETING CANVAS */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 p-2 sm:p-4 md:p-6 overflow-y-auto flex items-center justify-center relative">
          <div className={`w-full grid gap-2 sm:gap-3 md:gap-4 ${getGridClass()} h-full max-h-[85vh] sm:max-h-[80vh] transition-all duration-300`}>
            {/* LOCAL USER TILE */}
            <div className="relative group w-full h-full min-h-[140px] sm:min-h-[180px] md:min-h-[220px] rounded-xl sm:rounded-2xl overflow-hidden bg-[#16213e] border border-[#0f3460]/50 flex items-center justify-center transition-all">
              {/* Privacy Watermark Overlay */}
              {isPrivacyMode && (
                <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center opacity-30 select-none">
                  <div className="rotate-[-25deg] text-center font-mono font-extrabold text-[10px] sm:text-xs text-amber-300 uppercase tracking-widest bg-black/60 px-3 sm:px-4 py-2 rounded-xl border border-amber-500/30">
                    🔒 PRIVACY PROTECTED • {email} • DO NOT RECORD
                  </div>
                </div>
              )}

              {/* Hand Raised Badge */}
              {isHandRaised && (
                <div className="absolute top-2 sm:top-3 left-2 sm:left-3 z-20 px-2 sm:px-3 py-1 bg-amber-400 text-slate-950 font-extrabold text-[10px] sm:text-xs rounded-full shadow-lg flex items-center gap-1 sm:gap-1.5 animate-bounce">
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5a1.5 1.5 0 113 0m-3 0V11m3-5.5a1.5 1.5 0 113 0V11" />
                  </svg>
                  <span className="hidden sm:inline">You Raised Hand</span>
                </div>
              )}

              {/* Top Right Controls: Network Signal & Audio Mute */}
              <div className="absolute top-2 sm:top-3 right-2 sm:right-3 z-20 flex items-center gap-1.5">
                <button
                  onClick={() => setShowNetworkModal(true)}
                  className={`px-2 py-1 rounded-full border text-[10px] font-bold flex items-center gap-1 backdrop-blur-md ${
                    networkQuality === "excellent" || networkQuality === "good"
                      ? "text-emerald-400 bg-emerald-500/20 border-emerald-500/30"
                      : networkQuality === "weak"
                      ? "text-amber-400 bg-amber-500/20 border-amber-500/30"
                      : "text-red-400 bg-red-600/30 border-red-500/40"
                  }`}
                  title="Network Health"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                  </svg>
                  <span className="hidden md:inline">{networkStats.ping}ms</span>
                </button>

                {/* Mute Indicator */}
                {isMuted ? (
                  <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-red-600/90 text-white flex items-center justify-center text-xs shadow-md backdrop-blur-md">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  </span>
                ) : (
                  <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs backdrop-blur-md">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  isCameraOff && !isScreenSharing ? "opacity-0 absolute" : "opacity-100"
                }`}
              />

              {/* Camera Disabled Fallback */}
              {isCameraOff && !isScreenSharing && (
                <div className="flex flex-col items-center justify-center gap-2 sm:gap-3">
                  <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-[#533483] to-[#8ab4f8] text-white font-black text-2xl sm:text-3xl flex items-center justify-center shadow-xl">
                    {email.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Your Camera is Off</span>
                </div>
              )}

              {/* Info Overlay */}
              <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-20 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-white/10">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400"></span>
                <span className="text-[10px] sm:text-xs font-semibold text-white">
                  You ({email.split('@')[0]}) {isHost && <span className="ml-1 text-[8px] sm:text-[10px] bg-[#533483] text-white px-1.5 sm:px-2 py-0.5 rounded-md font-bold uppercase">Host</span>}
                </span>
                {isScreenSharing && (
                  <span className="text-[8px] sm:text-[10px] bg-[#8ab4f8] text-[#1a1a2e] px-1.5 sm:px-2 py-0.5 rounded-md font-bold uppercase">
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
                  networkQuality={networkQuality}
                />
              );
            })}
          </div>

          {/* FLOATING EMOJI REACTION ANIMATION OVERLAY */}
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-40 flex flex-col items-center gap-2">
            {floatingReactions.map((r) => (
              <div key={r.id} className="animate-float-reaction flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-[#1a1a2e]/90 border border-[#0f3460] shadow-2xl">
                <span className="text-xl sm:text-2xl">{r.emoji}</span>
                <span className="text-[10px] sm:text-xs font-bold text-slate-200">{r.senderEmail.split('@')[0]}</span>
              </div>
            ))}
          </div>
          {currentSubtitle && (
            <div className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-30 max-w-[90%] sm:max-w-[80%] px-4 sm:px-5 py-2 rounded-xl bg-black/75 text-white text-xs sm:text-sm text-center shadow-xl">
              <strong>{currentSubtitle.email?.split("@")[0]}:</strong> {currentSubtitle.text}
            </div>
          )}
        </main>

        {/* SIDE DRAWER: IN-CALL CHAT */}
        <div className={`absolute top-0 right-0 bottom-0 z-40 w-full sm:w-80 transition-all duration-200 ${showChat ? "translate-x-0 opacity-100 pointer-events-auto" : "translate-x-full opacity-0 pointer-events-none"}`}>
          <Chat
            meetingId={meetingId}
            email={email}
            messages={chatMessages}
            onSendMessage={handleSendChatMessage}
            onClose={() => setShowChat(false)}
          />
        </div>

        {/* SIDE DRAWER: PARTICIPANTS */}
        {showParticipants && (
          <div className="absolute top-0 right-0 bottom-0 z-40 w-full sm:w-80 h-full bg-[#16213e] border-l border-[#0f3460]/50 p-4 flex flex-col text-slate-100">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#0f3460]/50">
              <h3 className="font-bold text-white text-base">People ({participants.length})</h3>
              <button onClick={() => setShowParticipants(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {participants.map((u) => {
                const rState = remoteStates[u.socketId] || {};
                const isSelf = u.email === email;
                return (
                  <div key={u.socketId} className="p-3 rounded-xl bg-[#1a1a2e] border border-[#0f3460]/50 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#533483]/30 text-[#8ab4f8] font-bold text-xs flex items-center justify-center border border-[#533483]/30 shrink-0">
                        {u.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-200 truncate">
                          {u.email} {isSelf && "(You)"}
                        </p>
                        <p className="text-[10px] text-slate-400">In Call</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
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

      {/* RESPONSIVE CONTROL BAR */}
      <footer className="h-16 sm:h-20 bg-[#16213e] border-t border-[#0f3460]/50 px-2 sm:px-6 flex items-center justify-between z-30 shrink-0 relative">
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={() => setShowInfoModal(true)}
            className="p-2 sm:px-3.5 sm:py-2 rounded-full bg-[#0f3460] hover:bg-[#533483]/50 border border-[#533483]/30 text-xs font-semibold text-slate-200 flex items-center gap-1.5 sm:gap-2 transition-all"
          >
            <svg className="w-4 h-4 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">Details</span>
          </button>

          {/* Network Diagnostics button in footer */}
          <button
            onClick={() => setShowNetworkModal(true)}
            className={`p-2 sm:px-3 sm:py-2 rounded-full text-xs font-semibold border transition-all flex items-center gap-1 ${
              !isOnline || socketStatus === "disconnected"
                ? "bg-red-600/20 border-red-500/40 text-red-400"
                : networkQuality === "weak"
                ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                : "bg-[#0f3460] border-[#533483]/30 text-slate-200"
            }`}
            title="Network Diagnostics"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
            <span className="hidden md:inline">Signal</span>
          </button>
        </div>

        {/* CENTER CONTROLS */}
        <div className="flex items-center gap-1.5 sm:gap-3 overflow-x-auto no-scrollbar px-1 sm:px-0 max-w-[60vw] sm:max-w-none">
          {/* Mute Mic */}
          <button
            onClick={toggleMicrophone}
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md shrink-0 ${
              isMuted ? "bg-red-600 text-white" : "bg-[#0f3460] hover:bg-[#533483]/50 text-slate-100"
            }`}
            title={isMuted ? "Unmute Mic" : "Mute Mic"}
          >
            {isMuted ? (
              <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-slate-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          {/* Camera On/Off */}
          <button
            onClick={toggleCamera}
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md shrink-0 ${
              isCameraOff ? "bg-red-600 text-white" : "bg-[#0f3460] hover:bg-[#533483]/50 text-slate-100"
            }`}
            title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
          >
            {isCameraOff ? (
              <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ) : (
              <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-slate-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          {/* Screen Share */}
          <button
            onClick={toggleScreenShare}
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md shrink-0 hidden sm:flex ${
              isScreenSharing ? "bg-[#8ab4f8] text-[#1a1a2e]" : "bg-[#0f3460] hover:bg-[#533483]/50 text-slate-100"
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
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md shrink-0 ${
              isHandRaised ? "bg-amber-400 text-slate-950 font-bold" : "bg-[#0f3460] hover:bg-[#533483]/50 text-slate-100"
            }`}
            title="Raise Hand"
          >
            <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5a1.5 1.5 0 113 0m-3 0V11m3-5.5a1.5 1.5 0 113 0V11" />
            </svg>
          </button>

          {/* Emoji Reactions */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowReactionsMenu(!showReactionsMenu)}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#0f3460] hover:bg-[#533483]/50 text-slate-100 flex items-center justify-center transition-all shadow-md"
              title="Send Reaction"
            >
              <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-slate-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {showReactionsMenu && (
              <div className="absolute bottom-14 sm:bottom-16 left-1/2 -translate-x-1/2 bg-[#16213e] border border-[#0f3460] p-2 rounded-2xl shadow-2xl flex gap-1.5 sm:gap-2 z-50">
                {["❤️", "👏", "👍", "🔥", "🎉"].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => sendEmojiReaction(emoji)}
                    className="p-1.5 sm:p-2 hover:scale-125 transition-transform text-lg sm:text-xl"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Record Button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md shrink-0 hidden sm:flex ${
              isRecording ? "bg-red-600 text-white animate-pulse" : isPrivacyMode && !isHost ? "bg-gray-700 text-gray-400 cursor-not-allowed opacity-50" : "bg-[#0f3460] hover:bg-[#533483]/50 text-slate-100"
            }`}
            title={isPrivacyMode && !isHost ? "Recording blocked" : isRecording ? "Stop Recording" : "Record"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="5" fill="currentColor" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            </svg>
          </button>

          {/* Privacy Shield */}
          <button
            onClick={togglePrivacyShield}
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md shrink-0 hidden lg:flex ${
              isPrivacyMode ? "bg-amber-500 text-slate-950" : "bg-[#0f3460] hover:bg-[#533483]/50 text-slate-100"
            } ${!isHost ? "opacity-60 cursor-not-allowed" : ""}`}
            title={!isHost ? "Only host can toggle Privacy Shield" : isPrivacyMode ? "Disable Privacy Shield" : "Enable Privacy Shield"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </button>

          {/* PiP */}
          <button
            onClick={togglePictureInPicture}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#0f3460] hover:bg-[#533483]/50 text-slate-100 flex items-center justify-center transition-all shadow-md shrink-0 hidden lg:flex"
            title="Picture-in-Picture"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>

        {/* Right Drawer Triggers & End Call */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <button
            onClick={() => {
              setShowParticipants(!showParticipants);
              if (showChat) setShowChat(false);
            }}
            className={`p-2 sm:px-3.5 sm:py-2 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 sm:gap-2 ${
              showParticipants ? "bg-[#8ab4f8] text-[#1a1a2e] border-[#8ab4f8]" : "bg-[#0f3460] hover:bg-[#533483]/50 border-[#533483]/30 text-slate-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="hidden md:inline">{participants.length}</span>
          </button>

          <button
            onClick={() => {
              setShowChat(!showChat);
              if (showParticipants) setShowParticipants(false);
            }}
            className={`p-2 sm:px-3.5 sm:py-2 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 sm:gap-2 ${
              showChat ? "bg-[#8ab4f8] text-[#1a1a2e] border-[#8ab4f8]" : "bg-[#0f3460] hover:bg-[#533483]/50 border-[#533483]/30 text-slate-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="hidden md:inline">Chat</span>
          </button>

          {isHost ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={leaveMeeting}
                className="px-2 sm:px-3.5 py-2 sm:py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-[10px] sm:text-xs shadow-lg transition-all hidden sm:block"
                title="Leave Meeting"
              >
                Leave
              </button>
              <button
                onClick={endMeetingForEveryone}
                className="px-2 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-[10px] sm:text-xs shadow-lg transition-all flex items-center gap-1 sm:gap-1.5"
                title="End Meeting for All"
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                </svg>
                <span className="hidden sm:inline">End</span>
              </button>
            </div>
          ) : (
            <button
              onClick={leaveMeeting}
              className="w-10 h-10 sm:w-14 sm:h-11 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-lg flex items-center justify-center shadow-lg transition-all"
              title="Leave Call"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white rotate-[135deg]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
            </button>
          )}
        </div>
      </footer>

      {/* MEETING INFO MODAL */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#16213e] rounded-2xl p-6 relative border border-[#0f3460]">
            <button onClick={() => setShowInfoModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">✕</button>

            <h3 className="text-xl font-bold text-white mb-1">Joining info</h3>
            <p className="text-xs text-slate-400 mb-6">Share this live link to invite participants instantly</p>

            <div className="space-y-4 bg-[#1a1a2e] p-4 rounded-xl border border-[#0f3460]/50 mb-6">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Direct Live Invite Link</span>
                <div className="flex items-center justify-between mt-1 gap-2">
                  <span className="text-xs text-[#8ab4f8] font-mono truncate">
                    {window.location.origin}/meeting/live/{meetingId}?passcode={meetingPasscode}
                  </span>
                  <button
                    onClick={copyLiveInviteLink}
                    className="text-xs px-3 py-1.5 bg-[#8ab4f8] text-[#1a1a2e] font-bold rounded-lg shrink-0"
                  >
                    {copiedText === "link" ? "Copied!" : "Copy Link"}
                  </button>
                </div>
              </div>

              <div className="border-t border-[#0f3460]/50 pt-3">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Meeting ID</span>
                <p className="font-mono font-bold text-[#8ab4f8] text-base mt-0.5">{meetingId}</p>
              </div>
            </div>

            {isHost && (
              <div className="flex gap-2">
                <button
                  onClick={endMeetingForEveryone}
                  className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs shadow-lg transition-all border border-red-500/30 flex items-center justify-center gap-2"
                >
                  <span>🛑</span>
                  <span>End Meeting for All</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NETWORK DIAGNOSTICS MODAL */}
      {showNetworkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#16213e] rounded-2xl p-6 relative border border-[#0f3460] shadow-2xl">
            <button onClick={() => setShowNetworkModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">✕</button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#8ab4f8]/20 text-[#8ab4f8] flex items-center justify-center font-bold">
                📶
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Network Diagnostics</h3>
                <p className="text-xs text-slate-400">Live connection metrics & troubleshooting</p>
              </div>
            </div>

            {/* Diagnostics Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3.5 rounded-xl bg-[#1a1a2e] border border-[#0f3460]/50">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Internet Status</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-red-500"}`}></span>
                  <span className="text-sm font-bold text-white">{isOnline ? "Online" : "Offline"}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#1a1a2e] border border-[#0f3460]/50">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Socket Gateway</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${socketStatus === "connected" ? "bg-emerald-400" : "bg-amber-400 animate-ping"}`}></span>
                  <span className="text-sm font-bold text-white capitalize">{socketStatus}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#1a1a2e] border border-[#0f3460]/50">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Latency / Ping</span>
                <p className={`text-base font-mono font-bold mt-1 ${networkStats.ping > 300 ? "text-red-400" : networkStats.ping > 150 ? "text-amber-400" : "text-emerald-400"}`}>
                  {isOnline ? `${networkStats.ping} ms` : "N/A"}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#1a1a2e] border border-[#0f3460]/50">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Packet Loss Rate</span>
                <p className={`text-base font-mono font-bold mt-1 ${networkStats.packetLoss > 5 ? "text-red-400" : "text-emerald-400"}`}>
                  {isOnline ? `${networkStats.packetLoss}%` : "100%"}
                </p>
              </div>
            </div>

            {/* Connection Details */}
            <div className="p-3.5 rounded-xl bg-[#1a1a2e] border border-[#0f3460]/50 mb-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">ICE Transport:</span>
                <span className="font-mono text-[#8ab4f8] font-bold">{networkStats.candidateType}</span>
              </div>
              <div className="flex justify-between border-t border-[#0f3460]/30 pt-2">
                <span className="text-slate-400">WebRTC State:</span>
                <span className="font-mono text-emerald-400 font-bold capitalize">{networkStats.iceState}</span>
              </div>
            </div>

            {/* Diagnostics Advice / Log */}
            <div className="mb-4">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block mb-1.5">Recommendations</span>
              {networkQuality === "weak" || networkQuality === "poor" ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                  <p>• Turn off your video camera to prioritize clear audio.</p>
                  <p>• Move closer to your Wi-Fi router or switch to Ethernet.</p>
                  <p>• Close background streaming applications (YouTube, downloads).</p>
                </div>
              ) : !isOnline ? (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs space-y-1">
                  <p>• Check your Wi-Fi connection or mobile network data.</p>
                  <p>• The app will automatically reconnect as soon as signal returns.</p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                  ✓ Network connection is optimal. High quality audio & video supported.
                </div>
              )}
            </div>

            {/* Event Log */}
            <div className="space-y-1 max-h-28 overflow-y-auto font-mono text-[10px] bg-black/50 p-2.5 rounded-xl border border-[#0f3460]/30 text-slate-400 mb-4">
              {networkStats.logs.length === 0 ? (
                <p className="text-slate-600 italic">No network alerts logged</p>
              ) : (
                networkStats.logs.map((log, i) => (
                  <p key={i} className="leading-tight">{log}</p>
                ))
              )}
            </div>

            <button
              onClick={() => setShowNetworkModal(false)}
              className="w-full py-2.5 bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#1a1a2e] font-bold rounded-xl text-xs transition-colors"
            >
              Close Diagnostics
            </button>
          </div>
        </div>
      )}

      {/* RECORDING PLAYER MODAL */}
      {showRecordingPlayer && recordingBlobUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-[#16213e] rounded-2xl p-6 relative border border-[#0f3460]">
            <button
              onClick={() => {
                setShowRecordingPlayer(false);
                URL.revokeObjectURL(recordingBlobUrl);
                setRecordingBlobUrl(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg z-10"
            >
              ✕
            </button>

            <h3 className="text-xl font-bold text-white mb-1">🎬 Recording Ready</h3>
            <p className="text-xs text-slate-400 mb-4">Your meeting recording has been saved. Play, download, or share it below.</p>

            <div className="rounded-xl overflow-hidden bg-black mb-4">
              <video
                src={recordingBlobUrl}
                controls
                className="w-full max-h-[50vh] object-contain"
                autoPlay={false}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={downloadRecordingBlob}
                className="flex-1 py-3 bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#1a1a2e] font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
              <button
                onClick={shareRecording}
                className="flex-1 py-3 bg-[#533483] hover:bg-[#533483]/80 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Meeting;