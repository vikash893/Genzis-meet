/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import socket, { connectSocket } from "../socket";
import Chat from "../components/Chat";
import RemoteVideo from "../components/RemoteVideo";

const normalizeMeetingId = (value) =>
  String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

// Fast, redundant STUN/TURN server endpoints for global low-latency connectivity
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.services.mozilla.com" },
  { urls: "stun:global.stun.twilio.com:3478" },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turns:openrelay.metered.ca:443?transport=tcp"
    ],
    username: "openrelayproject",
    credential: "openrelayproject"
  }
];

// ============================================================
// RemoteVideoTile — wraps RemoteVideo with an internal ref
// so each remote participant gets a stable, unique <video> ref.
// ============================================================
function RemoteVideoTile({
  stream,
  email,
  isMuted,
  isCameraOff,
  isHandRaised,
  isPrivacyMode,
  isMain = false,
  onClick,
  isClickable = false,
}) {
  return (
    <RemoteVideo
      stream={stream}
      email={email}
      isMuted={isMuted}
      isCameraOff={isCameraOff}
      isHandRaised={isHandRaised}
      isPrivacyMode={isPrivacyMode}
      isMain={isMain}
      onClick={onClick}
      isClickable={isClickable}
    />
  );
}

// ============================================================
// LocalVideoTile — local user tile with opacity-based hiding
// so audio keeps playing even when camera is off.
// ============================================================
function LocalVideoTile({
  videoRef,
  stream,
  name,
  muted,
  cameraOff,
  isMain = false,
  onClick,
  isClickable = false,
}) {
  const innerRef = useRef(null);

  useEffect(() => {
    const el = (videoRef && videoRef.current) || innerRef.current;
    if (!el || !stream) return undefined;
    el.srcObject = stream;
    el.play().catch(() => {});
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream, videoRef]);

  const setRef = (node) => {
    innerRef.current = node;
    if (videoRef) {
      videoRef.current = node;
    }
  };

  return (
    <div
      onClick={onClick}
      className={`relative w-full h-full min-h-0 overflow-hidden rounded-xl sm:rounded-2xl border transition-all duration-200 bg-[#11182d] flex items-center justify-center ${
        isClickable
          ? "cursor-pointer hover:border-[#8ab4f8]/70 hover:shadow-2xl"
          : ""
      } ${
        isMain
          ? "border-white/10 shadow-xl"
          : "border-[#0f3460]/50 hover:ring-2 hover:ring-[#8ab4f8]/50 shadow-md"
      }`}
    >
      {/* FIX: Use opacity-0 + absolute instead of display:none so audio keeps decoding */}
      <video
        ref={setRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          cameraOff ? "opacity-0 absolute" : "opacity-100"
        }`}
      />
      {cameraOff && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 sm:gap-3 bg-[#18213b] p-2">
          <div
            className={`flex items-center justify-center rounded-full bg-[#8ab4f8] font-bold text-[#11182d] shadow-lg ${
              isMain
                ? "h-16 w-16 sm:h-20 sm:w-20 text-2xl sm:text-3xl"
                : "h-9 h-9 sm:h-11 sm:w-11 text-sm sm:text-base"
            }`}
          >
            {name.charAt(0).toUpperCase()}
          </div>
          <span
            className={`text-slate-400 font-medium ${
              isMain ? "text-xs sm:text-sm" : "text-[10px]"
            }`}
          >
            Camera off
          </span>
        </div>
      )}
      {/* Pinned / Main Badge */}
      {isMain && (
        <div className="absolute top-2 sm:top-3 left-2 sm:left-3 z-20 px-2 sm:px-2.5 py-1 bg-black/60 backdrop-blur-md text-[#8ab4f8] text-[10px] sm:text-xs rounded-lg border border-[#8ab4f8]/30 flex items-center gap-1">
          <span>📌 Main (You)</span>
        </div>
      )}
      <div className="absolute inset-x-2 sm:inset-x-3 bottom-2 sm:bottom-3 z-20 flex items-center justify-between rounded-xl bg-black/70 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs backdrop-blur-md border border-white/10 max-w-[85%]">
        <span className="max-w-[70%] truncate font-semibold text-white">
          You ({name})
        </span>
        <div className="flex items-center gap-1.5">
          {muted && (
            <span className="rounded-full bg-red-500/80 px-2 py-0.5 text-[10px] font-bold text-white">
              Muted
            </span>
          )}
          {!isMain && isClickable && (
            <span className="hidden sm:inline-block text-[10px] text-[#8ab4f8] bg-[#8ab4f8]/10 px-1.5 py-0.5 rounded">
              Click to pin
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Floating Emoji Reaction
// ============================================================
function FloatingReaction({ emoji, id }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  const left = 10 + Math.random() * 80;
  return (
    <div
      key={id}
      className="fixed z-50 text-4xl pointer-events-none animate-bounce"
      style={{ bottom: "120px", left: `${left}%`, animation: "floatUp 3s ease-out forwards" }}
    >
      {emoji}
    </div>
  );
}

// ============================================================
// MeetingRoom — Main Component
// ============================================================
function MeetingRoom() {
  const { meetingId: routeMeetingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const meetingId = normalizeMeetingId(routeMeetingId);
  const email =
    location.state?.email || localStorage.getItem("userEmail") || "Guest User";
  const passcode =
    location.state?.passcode ||
    new URLSearchParams(location.search).get("passcode") ||
    sessionStorage.getItem(`meeting_passcode_${meetingId}`) ||
    "";

  // Refs
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const participantsRef = useRef([]);
  const joinedRef = useRef(false);
  const makingOfferRef = useRef(new Map());
  const ignoreOfferRef = useRef(new Map());
  const peerWatchdogsRef = useRef(new Map());
  // Buffer candidates per peer until remoteDescription is ready
  const iceCandidateQueueRef = useRef(new Map());
  // Persistent remote MediaStreams — accumulate tracks cleanly
  const remoteMediaStreamsRef = useRef(new Map());

  // State
  const [preJoin, setPreJoin] = useState(true);
  const [joinOptions, setJoinOptions] = useState({
    camera: true,
    microphone: true,
  });
  const [joining, setJoining] = useState(false);
  const [socketStatus, setSocketStatus] = useState(
    socket.connected ? "connected" : "offline"
  );
  const [error, setError] = useState("");
  const [localCameraOff, setLocalCameraOff] = useState(true);
  const [localMuted, setLocalMuted] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [remoteStates, setRemoteStates] = useState({});
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [handRaisedUsers, setHandRaisedUsers] = useState({});
  const [reactions, setReactions] = useState([]);
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [hostSocketId, setHostSocketId] = useState(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [copiedToast, setCopiedToast] = useState("");
  const [maximizedUserId, setMaximizedUserId] = useState(null);

  // -----------------------------------------------------------
  // Helper: sync a single track onto an existing RTCPeerConnection
  // -----------------------------------------------------------
  const syncTrack = (pc, track) => {
    if (!pc || !track) return Promise.resolve();
    const transceiver = pc
      .getTransceivers()
      .find((item) => item.receiver?.track?.kind === track.kind || item.sender?.track?.kind === track.kind);
    if (transceiver && transceiver.sender) {
      return transceiver.sender.replaceTrack(track);
    }
    try {
      pc.addTrack(track, localStreamRef.current);
    } catch {}
    return Promise.resolve();
  };

  // -----------------------------------------------------------
  // Helper: flush queued ICE candidates after remoteDescription is set
  // -----------------------------------------------------------
  const flushIceCandidates = async (targetSocketId, pc) => {
    const queue = iceCandidateQueueRef.current.get(targetSocketId);
    if (!queue || queue.length === 0 || !pc) return;
    iceCandidateQueueRef.current.set(targetSocketId, []);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("Flushed ICE candidate warning:", e);
      }
    }
  };

  // -----------------------------------------------------------
  // createPeer — build an RTCPeerConnection for a remote participant
  // -----------------------------------------------------------
  const createPeer = useCallback((targetSocketId) => {
    const existing = peersRef.current.get(targetSocketId);
    if (existing && existing.connectionState !== "closed" && existing.connectionState !== "failed") {
      return existing;
    }
    if (existing) {
      try { existing.close(); } catch {}
      peersRef.current.delete(targetSocketId);
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle"
    });

    // Add bidirectional audio and video transceivers
    pc.addTransceiver("audio", { direction: "sendrecv" });
    pc.addTransceiver("video", { direction: "sendrecv" });
    peersRef.current.set(targetSocketId, pc);

    // Initialise ICE queue for this peer if not present
    if (!iceCandidateQueueRef.current.has(targetSocketId)) {
      iceCandidateQueueRef.current.set(targetSocketId, []);
    }

    // Push local tracks immediately if available
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => syncTrack(pc, track));
    }

    // Trickle ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit("ice-candidate", { targetSocketId, candidate });
      }
    };

    // ontrack — support multi-stream and discrete track accumulation
    pc.ontrack = (event) => {
      let peerStream = remoteMediaStreamsRef.current.get(targetSocketId);
      if (!peerStream) {
        peerStream = new MediaStream();
        remoteMediaStreamsRef.current.set(targetSocketId, peerStream);
      }

      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((incoming) => {
          if (!peerStream.getTracks().find((t) => t.id === incoming.id)) {
            peerStream.addTrack(incoming);
          }
        });
      } else if (event.track) {
        const incomingTrack = event.track;
        const existingTrack = peerStream
          .getTracks()
          .find((t) => t.kind === incomingTrack.kind);
        if (existingTrack && existingTrack.id !== incomingTrack.id) {
          peerStream.removeTrack(existingTrack);
        }
        if (!peerStream.getTracks().find((t) => t.id === incomingTrack.id)) {
          peerStream.addTrack(incomingTrack);
        }
      }

      const participant = participantsRef.current.find(
        (item) => item.socketId === targetSocketId
      );
      setRemoteStreams((current) => ({
        ...current,
        [targetSocketId]: {
          stream: peerStream,
          email: participant?.email || "Participant",
        },
      }));
    };

    // ICE connection recovery
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === "failed") {
        console.warn(`[WebRTC] ICE failed for ${targetSocketId}, attempting restart...`);
        try {
          if (pc.restartIce) pc.restartIce();
        } catch (e) {
          console.warn("ICE restart trigger error:", e);
        }
      }
    };

    // Peer connection lifecycle with watchdog recovery
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "failed") {
        const timer = setTimeout(() => {
          if (pc.connectionState === "failed") {
            try { pc.close(); } catch {}
            peersRef.current.delete(targetSocketId);
            remoteMediaStreamsRef.current.delete(targetSocketId);
            iceCandidateQueueRef.current.delete(targetSocketId);
            setRemoteStreams((current) => {
              const next = { ...current };
              delete next[targetSocketId];
              return next;
            });
          }
        }, 3500);
        peerWatchdogsRef.current.set(targetSocketId, timer);
      } else if (state === "connected") {
        const timer = peerWatchdogsRef.current.get(targetSocketId);
        if (timer) {
          clearTimeout(timer);
          peerWatchdogsRef.current.delete(targetSocketId);
        }
      } else if (state === "closed") {
        peersRef.current.delete(targetSocketId);
        remoteMediaStreamsRef.current.delete(targetSocketId);
        iceCandidateQueueRef.current.delete(targetSocketId);
        setRemoteStreams((current) => {
          const next = { ...current };
          delete next[targetSocketId];
          return next;
        });
      }
    };

    // Perfect negotiation: onnegotiationneeded
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current.set(targetSocketId, true);
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") return;
        await pc.setLocalDescription(offer);
        socket.emit("offer", {
          targetSocketId,
          offer: pc.localDescription,
        });
      } catch (negotiationError) {
        console.warn("Negotiation error:", negotiationError);
      } finally {
        makingOfferRef.current.set(targetSocketId, false);
      }
    };

    return pc;
  }, []);

  // -----------------------------------------------------------
  // addLocalTracks — push media stream to local video + all peers
  // -----------------------------------------------------------
  const addLocalTracks = async (stream) => {
    localStreamRef.current = stream;
    setLocalCameraOff(stream.getVideoTracks().length === 0);
    setLocalMuted(stream.getAudioTracks().length === 0);
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    await Promise.all(
      [...peersRef.current.values()].flatMap((pc) =>
        stream.getTracks().map((track) => syncTrack(pc, track))
      )
    );
  };

  // -----------------------------------------------------------
  // acquireSelectedMedia — get camera/mic with timeout fallback
  // -----------------------------------------------------------
  const acquireSelectedMedia = async () => {
    if (!joinOptions.camera && !joinOptions.microphone) return null;
    const constraints = {
      video: joinOptions.camera,
      audio: joinOptions.microphone,
    };
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        settled = true;
        reject(
          new Error(
            "Media permission was not completed. You can enable devices after joining."
          )
        );
      }, 8000);

      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
          if (settled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          settled = true;
          window.clearTimeout(timer);
          resolve(stream);
        })
        .catch((mediaError) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          reject(mediaError);
        });
    });
  };

  // -----------------------------------------------------------
  // emitJoin — tell the server we want to join
  // -----------------------------------------------------------
  const emitJoin = () => {
    if (!socket.connected) return;
    socket.emit("join-meeting", { meetingId, passcode });
  };

  // -----------------------------------------------------------
  // joinRoom — FIX: acquire media FIRST, then signal join
  // -----------------------------------------------------------
  const joinRoom = async () => {
    setJoining(true);
    setError("");
    joinedRef.current = true;

    // Step 1: Acquire media BEFORE connecting socket / emitting join
    if (joinOptions.camera || joinOptions.microphone) {
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await acquireSelectedMedia();
          if (stream) await addLocalTracks(stream);
        } catch (mediaError) {
          console.warn("Media setup skipped:", mediaError.message);
          setError(
            "Meeting joined. Camera and microphone are off until permission is granted."
          );
        }
      } else {
        setError(
          "Camera and microphone are not available in this browser. You can enable them later on a supported device."
        );
      }
    }

    // Step 2: Connect socket and emit join
    connectSocket();
    if (socket.connected) emitJoin();

    setPreJoin(false);
    setJoining(false);
  };

  // -----------------------------------------------------------
  // publishMediaState — broadcast muted/camera state to room
  // -----------------------------------------------------------
  const publishMediaState = (nextMuted, nextCameraOff) =>
    socket.emit("user-media-state", {
      meetingId,
      email,
      isMuted: nextMuted,
      isCameraOff: nextCameraOff,
    });

  // -----------------------------------------------------------
  // Socket event listeners
  // -----------------------------------------------------------
  useEffect(() => {
    const onConnect = () => {
      setSocketStatus("connected");
      if (joinedRef.current) emitJoin();
    };
    const onDisconnect = () => setSocketStatus("offline");
    const onConnectError = () => {
      setSocketStatus("offline");
      setError("Meeting server connection failed. Check the backend deployment.");
    };
    const onMeetingInfo = (info) => setMeetingInfo(info);
    const onHostInfo = ({ hostSocketId: hid }) => setHostSocketId(hid);
    const onChatHistory = (history) => setMessages(history);

    const onParticipants = (users) => {
      participantsRef.current = users;
      setParticipants(users);
      users
        .filter((user) => user.socketId !== socket.id)
        .forEach((user) => createPeer(user.socketId));
    };

    const onUserJoined = (user) => {
      if (user.socketId !== socket.id) createPeer(user.socketId);
    };

    const onUserLeft = ({ socketId }) => {
      peersRef.current.get(socketId)?.close();
      peersRef.current.delete(socketId);
      remoteMediaStreamsRef.current.delete(socketId);
      iceCandidateQueueRef.current.delete(socketId);
      setParticipants((current) =>
        current.filter((user) => user.socketId !== socketId)
      );
      setRemoteStreams((current) => {
        const next = { ...current };
        delete next[socketId];
        return next;
      });
      setMaximizedUserId((current) => (current === socketId ? null : current));
    };

    // Perfect negotiation: Handle incoming Offer with glare collision rollback
    const onOffer = async ({ fromSocketId, offer }) => {
      const pc = createPeer(fromSocketId);
      const isPolite = socket.id > fromSocketId;
      const isMakingOffer = makingOfferRef.current.get(fromSocketId);
      const offerCollision = isMakingOffer || pc.signalingState !== "stable";

      ignoreOfferRef.current.set(fromSocketId, !isPolite && offerCollision);
      if (ignoreOfferRef.current.get(fromSocketId)) {
        console.log(`[WebRTC] Glare collision: Impolite peer ignoring offer from ${fromSocketId}`);
        return;
      }

      try {
        if (offerCollision) {
          await pc.setLocalDescription({ type: "rollback" });
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await flushIceCandidates(fromSocketId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", {
          targetSocketId: fromSocketId,
          answer: pc.localDescription,
        });
      } catch (offerError) {
        console.error("Offer handling error:", offerError);
        setError(
          "A participant connection was refreshed. Establishing connection..."
        );
      }
    };

    // Apply incoming Answer and flush queued ICE candidates
    const onAnswer = async ({ fromSocketId, answer }) => {
      const pc = peersRef.current.get(fromSocketId);
      if (pc && pc.signalingState === "have-local-offer") {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await flushIceCandidates(fromSocketId, pc);
        } catch (e) {
          console.warn("Answer apply error:", e);
        }
      }
    };

    // Buffer ICE candidates reliably even if remoteDescription is pending
    const onIce = async ({ fromSocketId, candidate }) => {
      if (!candidate) return;
      const pc = peersRef.current.get(fromSocketId);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("ICE candidate error:", e);
        }
      } else {
        // Queue the candidate so it is never dropped
        const queue = iceCandidateQueueRef.current.get(fromSocketId) || [];
        queue.push(candidate);
        iceCandidateQueueRef.current.set(fromSocketId, queue);
      }
    };

    const onMediaState = ({ socketId, isMuted, isCameraOff }) =>
      setRemoteStates((current) => ({
        ...current,
        [socketId]: { isMuted, isCameraOff },
      }));

    const onChat = (message) =>
      setMessages((current) =>
        current.some((item) => item.id === message.id)
          ? current
          : [...current, message]
      );

    const onAccessDenied = ({ message }) => {
      setError(message || "You cannot join this meeting.");
      setPreJoin(true);
    };

    const onEnded = () => {
      setError("The host ended this meeting.");
      setTimeout(() => navigate("/dashboard"), 1200);
    };

    const onHandRaised = ({ socketId, email: raiserEmail, isHandRaised: raised }) => {
      setHandRaisedUsers((current) => ({ ...current, [socketId]: raised }));
    };

    const onReaction = ({ socketId, email: senderEmail, emoji, id }) => {
      setReactions((current) => [...current, { id, emoji, senderEmail }]);
      // Auto-remove after 3.5 seconds
      setTimeout(() => {
        setReactions((current) => current.filter((r) => r.id !== id));
      }, 3500);
    };

    const onPrivacyMode = ({ isPrivacyMode: mode }) => setIsPrivacyMode(mode);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("meeting-info", onMeetingInfo);
    socket.on("host-info", onHostInfo);
    socket.on("chat-history", onChatHistory);
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
    socket.on("user-hand-raised", onHandRaised);
    socket.on("receive-reaction", onReaction);
    socket.on("privacy-mode-changed", onPrivacyMode);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("meeting-info", onMeetingInfo);
      socket.off("host-info", onHostInfo);
      socket.off("chat-history", onChatHistory);
      socket.off("participants", onParticipants);
      socket.off("user-joined", onUserJoined);
      socket.off("user-left", onUserLeft);
      socket.off("offer", onOffer);
      socket.off("answer", onAnswer);
      socket.off("ice-candidate", onIce);
      socket.off("user-media-state-changed", onMediaState);
      socket.off("receive-message", onChat);
      socket.off("meeting-access-denied", onAccessDenied);
      socket.off("meeting-ended-by-host", onEnded);
      socket.off("user-hand-raised", onHandRaised);
      socket.off("receive-reaction", onReaction);
      socket.off("privacy-mode-changed", onPrivacyMode);
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      remoteMediaStreamsRef.current.clear();
      iceCandidateQueueRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      socket.disconnect();
    };
  }, [meetingId, passcode]);

  // -----------------------------------------------------------
  // Toggle Microphone
  // -----------------------------------------------------------
  const toggleMic = async () => {
    if (!localStreamRef.current?.getAudioTracks().length) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (!localStreamRef.current) {
          await addLocalTracks(stream);
        } else {
          stream.getAudioTracks().forEach((track) => localStreamRef.current.addTrack(track));
        }
        await Promise.all(
          [...peersRef.current.values()].map((pc) =>
            syncTrack(pc, localStreamRef.current.getAudioTracks()[0])
          )
        );
        setLocalMuted(false);
        publishMediaState(false, localCameraOff);
      } catch {
        setError("Microphone permission was denied or is unavailable.");
      }
      return;
    }
    const nextMuted = !localMuted;
    localStreamRef.current
      .getAudioTracks()
      .forEach((track) => {
        track.enabled = !nextMuted;
      });
    setLocalMuted(nextMuted);
    publishMediaState(nextMuted, localCameraOff);
  };

  // -----------------------------------------------------------
  // Toggle Camera
  // -----------------------------------------------------------
  const toggleCamera = async () => {
    if (!localStreamRef.current?.getVideoTracks().length) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        const track = stream.getVideoTracks()[0];
        if (!localStreamRef.current) {
          await addLocalTracks(stream);
        } else {
          localStreamRef.current.addTrack(track);
        }
        await Promise.all(
          [...peersRef.current.values()].map((pc) => syncTrack(pc, track))
        );
        setLocalCameraOff(false);
        publishMediaState(localMuted, false);
      } catch {
        setError("Camera permission was denied or is unavailable.");
      }
      return;
    }
    const nextOff = !localCameraOff;
    localStreamRef.current
      .getVideoTracks()
      .forEach((track) => {
        track.enabled = !nextOff;
      });
    setLocalCameraOff(nextOff);
    publishMediaState(localMuted, nextOff);
  };

  // -----------------------------------------------------------
  // Toggle Screen Share
  // -----------------------------------------------------------
  const toggleShare = async () => {
    if (sharing) {
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setSharing(false);
      const camera = localStreamRef.current?.getVideoTracks()[0];
      if (camera)
        await Promise.all(
          [...peersRef.current.values()].map((pc) => syncTrack(pc, camera))
        );
      if (localVideoRef.current)
        localVideoRef.current.srcObject = localStreamRef.current;
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      screenStreamRef.current = screen;
      const track = screen.getVideoTracks()[0];
      await Promise.all(
        [...peersRef.current.values()].map((pc) => syncTrack(pc, track))
      );
      if (localVideoRef.current) localVideoRef.current.srcObject = screen;
      setSharing(true);
      track.onended = () => toggleShare();
    } catch {}
  };

  // -----------------------------------------------------------
  // Send Chat — use the Chat component's callback
  // -----------------------------------------------------------
  const handleSendChat = (chatMsg) => {
    socket.emit("send-message", chatMsg);
  };

  // -----------------------------------------------------------
  // Host: End Meeting for All
  // -----------------------------------------------------------
  const endMeetingForAll = () => {
    socket.emit("end-meeting", { meetingId });
    setShowEndConfirm(false);
  };

  // -----------------------------------------------------------
  // Leave
  // -----------------------------------------------------------
  const leave = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    navigate("/dashboard");
  };

  // -----------------------------------------------------------
  // Copy to clipboard with toast
  // -----------------------------------------------------------
  const copyInvite = () => {
    const text = `Meeting ID: ${meetingId}\nPasscode: ${passcode || meetingInfo?.passcode || "N/A"}\nJoin: ${window.location.origin}/meeting/live/${meetingId}?passcode=${encodeURIComponent(passcode || meetingInfo?.passcode || "")}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedToast("Invite details copied!");
      setTimeout(() => setCopiedToast(""), 2500);
    });
  };

  // -----------------------------------------------------------
  // Compute Main and Thumbnail Tiles (Google Meet Style)
  // -----------------------------------------------------------
  const remoteEntries = Object.entries(remoteStreams);
  const isHost = hostSocketId === socket.id;

  // Determine if a remote participant is currently maximized
  const isRemoteMaximized =
    maximizedUserId !== null &&
    remoteStreams[maximizedUserId] !== undefined;

  const activeRemoteEntry = isRemoteMaximized
    ? [maximizedUserId, remoteStreams[maximizedUserId]]
    : null;

  // 1. The Main Video Tile
  let mainTile;
  if (isRemoteMaximized && activeRemoteEntry) {
    const [remoteId, item] = activeRemoteEntry;
    mainTile = (
      <RemoteVideoTile
        key={`main-${remoteId}`}
        stream={item.stream}
        email={item.email}
        isMuted={remoteStates[remoteId]?.isMuted}
        isCameraOff={remoteStates[remoteId]?.isCameraOff}
        isHandRaised={handRaisedUsers[remoteId] || false}
        isPrivacyMode={isPrivacyMode}
        isMain={true}
        isClickable={true}
        onClick={() => setMaximizedUserId(null)}
      />
    );
  } else {
    // Local user's video is the main large view by default
    mainTile = (
      <LocalVideoTile
        key="main-local"
        videoRef={localVideoRef}
        stream={localStreamRef.current}
        name={email}
        muted={localMuted}
        cameraOff={localCameraOff}
        isMain={true}
        isClickable={false}
      />
    );
  }

  // 2. The Sidebar / Thumbnail Video Tiles
  const sidebarTiles = [];
  if (remoteEntries.length > 0) {
    if (isRemoteMaximized) {
      // Local user tile becomes the first thumbnail
      sidebarTiles.push(
        <LocalVideoTile
          key="thumb-local"
          videoRef={localVideoRef}
          stream={localStreamRef.current}
          name={email}
          muted={localMuted}
          cameraOff={localCameraOff}
          isMain={false}
          isClickable={true}
          onClick={() => setMaximizedUserId(null)}
        />
      );

      // Remaining remote participants
      remoteEntries
        .filter(([id]) => id !== maximizedUserId)
        .forEach(([id, item]) => {
          sidebarTiles.push(
            <RemoteVideoTile
              key={`thumb-${id}`}
              stream={item.stream}
              email={item.email}
              isMuted={remoteStates[id]?.isMuted}
              isCameraOff={remoteStates[id]?.isCameraOff}
              isHandRaised={handRaisedUsers[id] || false}
              isPrivacyMode={isPrivacyMode}
              isMain={false}
              isClickable={true}
              onClick={() => setMaximizedUserId(id)}
            />
          );
        });
    } else {
      // Local user is in main, all remote participants are thumbnails
      remoteEntries.forEach(([id, item]) => {
        sidebarTiles.push(
          <RemoteVideoTile
            key={`thumb-${id}`}
            stream={item.stream}
            email={item.email}
            isMuted={remoteStates[id]?.isMuted}
            isCameraOff={remoteStates[id]?.isCameraOff}
            isHandRaised={handRaisedUsers[id] || false}
            isPrivacyMode={isPrivacyMode}
            isMain={false}
            isClickable={true}
            onClick={() => setMaximizedUserId(id)}
          />
        );
      });
    }
  }

  // ============================================================
  // PRE-JOIN SCREEN
  // ============================================================
  if (preJoin)
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1328] px-4 text-white">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#151e38] p-7 shadow-2xl sm:p-10">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8ab4f8]">
              Ready to join?
            </p>
            <h1 className="mt-3 text-3xl font-bold">Meeting {meetingId}</h1>
            <p className="mt-2 text-sm text-slate-400">
              Choose your devices before entering the room. You can change them
              anytime.
            </p>
          </div>
          {error && (
            <p className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </p>
          )}
          <div className="space-y-3">
            <button
              onClick={() =>
                setJoinOptions((current) => ({
                  ...current,
                  camera: !current.camera,
                }))
              }
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left ${
                joinOptions.camera
                  ? "border-[#8ab4f8] bg-[#8ab4f8]/10"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <span>
                <span className="block font-semibold">Camera</span>
                <span className="text-xs text-slate-400">Show your video</span>
              </span>
              <span className="text-2xl">
                {joinOptions.camera ? "On" : "Off"}
              </span>
            </button>
            <button
              onClick={() =>
                setJoinOptions((current) => ({
                  ...current,
                  microphone: !current.microphone,
                }))
              }
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left ${
                joinOptions.microphone
                  ? "border-[#8ab4f8] bg-[#8ab4f8]/10"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <span>
                <span className="block font-semibold">Microphone</span>
                <span className="text-xs text-slate-400">
                  Let others hear you
                </span>
              </span>
              <span className="text-2xl">
                {joinOptions.microphone ? "On" : "Off"}
              </span>
            </button>
          </div>
          <button
            disabled={joining}
            onClick={joinRoom}
            className="mt-7 w-full rounded-2xl bg-[#8ab4f8] px-5 py-4 font-bold text-[#0d1328] disabled:opacity-60"
          >
            {joining ? "Preparing meeting..." : "Join meeting"}
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="mt-3 w-full rounded-2xl px-5 py-3 text-sm font-semibold text-slate-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    );

  // ============================================================
  // LIVE MEETING ROOM
  // ============================================================
  return (
    <div className="flex h-screen h-[100dvh] flex-col overflow-hidden bg-[#0d1328] text-white select-none">
      {/* Float-up animation keyframes */}
      <style>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-300px) scale(1.5); }
        }
      `}</style>

      {/* Floating Emoji Reactions */}
      {reactions.map((r) => (
        <FloatingReaction key={r.id} emoji={r.emoji} id={r.id} />
      ))}

      {/* Copied toast */}
      {copiedToast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white shadow-2xl">
          {copiedToast}
        </div>
      )}

      {/* HEADER */}
      <header className="flex h-14 sm:h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#111a32] px-3 sm:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8ab4f8]">
            Live meeting
          </p>
          <p className="font-mono text-xs sm:text-sm font-bold truncate max-w-[150px] sm:max-w-xs">
            {meetingInfo?.title || meetingId}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-400">
          <span
            className={`h-2 w-2 rounded-full ${
              socketStatus === "connected" ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          <span className="hidden sm:inline">
            {socketStatus === "connected"
              ? `${participants.length} connected`
              : "Reconnecting"}
          </span>

          {/* Copy Invite */}
          <button
            onClick={copyInvite}
            className="rounded-xl bg-white/10 px-2.5 sm:px-3 py-1.5 sm:py-2 font-semibold text-white hover:bg-white/20 transition-colors"
            title="Copy meeting invite"
          >
            📋 <span className="hidden sm:inline">Invite</span>
          </button>

          {/* Chat Toggle */}
          <button
            onClick={() => setChatOpen((current) => !current)}
            className="rounded-xl bg-white/10 px-2.5 sm:px-3 py-1.5 sm:py-2 font-semibold text-white hover:bg-white/20 transition-colors"
          >
            💬 <span className="hidden sm:inline">Chat</span>
          </button>
        </div>
      </header>

      {/* ERROR BAR */}
      {error && (
        <div className="mx-auto mt-2 w-[min(92%,800px)] rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs sm:text-sm text-amber-100 shrink-0">
          {error}
        </div>
      )}

      {/* MAIN MEETING VIEWPORT */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
        {/* VIDEO STAGE */}
        <main className="flex flex-1 min-h-0 min-w-0 p-2.5 sm:p-4 overflow-hidden">
          <div className="flex flex-1 min-h-0 min-w-0 flex-col md:flex-row gap-2.5 sm:gap-3.5 items-center justify-center w-full h-full">
            {/* MAIN LARGE VIDEO */}
            <div
              className={`relative flex-1 min-h-0 min-w-0 w-full h-full flex items-center justify-center ${
                sidebarTiles.length > 0
                  ? "max-h-[62vh] sm:max-h-[68vh] md:max-h-full"
                  : "h-full"
              }`}
            >
              <div className="w-full h-full max-w-full max-h-full aspect-video flex items-center justify-center">
                {mainTile}
              </div>
            </div>

            {/* PARTICIPANT THUMBNAIL STRIP / SIDEBAR */}
            {sidebarTiles.length > 0 && (
              <div
                className={`
                  flex-shrink-0 min-h-0 min-w-0
                  w-full h-24 sm:h-28 flex flex-row gap-2 items-center justify-start sm:justify-center overflow-x-auto overflow-y-hidden px-1 py-0.5 no-scrollbar
                  ${
                    sidebarTiles.length <= 4
                      ? "md:h-full md:w-60 lg:w-72 xl:w-80 md:flex md:flex-col md:gap-2.5 md:justify-center md:overflow-y-hidden"
                      : "md:h-full md:w-72 lg:w-80 xl:w-96 md:grid md:grid-cols-2 md:gap-2 md:content-center md:auto-rows-fr md:overflow-y-hidden"
                  }
                `}
              >
                {sidebarTiles.map((tile, idx) => (
                  <div
                    key={idx}
                    className={`
                      h-full aspect-video flex-shrink-0 min-w-0 max-w-[140px] sm:max-w-[180px]
                      ${
                        sidebarTiles.length <= 4
                          ? "md:h-auto md:w-full md:aspect-video md:flex-1 md:min-h-0 md:max-h-[48%]"
                          : "md:h-full md:w-full md:aspect-video md:min-h-0"
                      }
                    `}
                  >
                    {tile}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* CHAT SIDEBAR — using integrated Chat component */}
        {chatOpen && (
          <Chat
            meetingId={meetingId}
            email={email}
            onClose={() => setChatOpen(false)}
            messages={messages}
            onSendMessage={handleSendChat}
          />
        )}
      </div>

      {/* End Meeting Confirmation Modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-[#151e38] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">
              End Meeting for All?
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              This will disconnect all participants and close the meeting
              permanently. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/20"
              >
                Cancel
              </button>
              <button
                onClick={endMeetingForAll}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700"
              >
                End for All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER CONTROLS */}
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-1.5 sm:gap-2.5 border-t border-white/10 bg-[#111a32] p-2 sm:p-3 md:p-3.5 max-w-full z-20">
        {/* Mic */}
        <button
          onClick={toggleMic}
          className={`rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-all ${
            localMuted
              ? "bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-500/20"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
          title={localMuted ? "Unmute microphone" : "Mute microphone"}
        >
          <span>🎙️</span>
          <span>{localMuted ? "Unmute" : "Mute"}</span>
        </button>

        {/* Camera */}
        <button
          onClick={toggleCamera}
          className={`rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-all ${
            localCameraOff
              ? "bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-500/20"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
          title={localCameraOff ? "Turn on camera" : "Turn off camera"}
        >
          <span>📷</span>
          <span>
            {localCameraOff ? "Start camera" : "Stop camera"}
          </span>
        </button>

        {/* Screen Share */}
        <button
          onClick={toggleShare}
          className={`rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-all ${
            sharing
              ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-md shadow-emerald-500/20"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
          title={sharing ? "Stop sharing screen" : "Share screen"}
        >
          <span>🖥️</span>
          <span className="hidden xs:inline sm:inline">
            {sharing ? "Stop sharing" : "Share screen"}
          </span>
        </button>

        {/* Raise Hand */}
        <button
          onClick={() => {
            const next = !handRaised;
            setHandRaised(next);
            socket.emit("raise-hand", {
              meetingId,
              email,
              isHandRaised: next,
            });
          }}
          className={`rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-all ${
            handRaised
              ? "bg-amber-400 text-[#0d1328] hover:bg-amber-300 shadow-md shadow-amber-400/20"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
          title={handRaised ? "Lower hand" : "Raise hand"}
        >
          <span>✋</span>
          <span className="hidden xs:inline sm:inline">
            {handRaised ? "Lower hand" : "Raise hand"}
          </span>
        </button>

        {/* Quick Emoji Reactions */}
        <div className="flex items-center gap-1 rounded-xl sm:rounded-2xl bg-white/5 px-2 py-1 border border-white/5">
          {["👍", "❤️", "🎉", "🔥"].map((emoji) => (
            <button
              key={emoji}
              onClick={() =>
                socket.emit("send-reaction", { meetingId, email, emoji })
              }
              className="rounded-full p-1 sm:p-1.5 text-base sm:text-lg hover:scale-125 active:scale-95 transition-transform hover:bg-white/10"
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Host: End Meeting */}
        {isHost && (
          <button
            onClick={() => setShowEndConfirm(true)}
            className="rounded-xl sm:rounded-2xl bg-red-700 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-red-800 active:scale-95 transition-all shadow-md shadow-red-700/20"
          >
            End Meeting
          </button>
        )}

        {/* Leave */}
        <button
          onClick={leave}
          className="rounded-xl sm:rounded-2xl bg-red-600 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-red-700 active:scale-95 transition-all shadow-md shadow-red-600/20"
        >
          Leave
        </button>
      </footer>
    </div>
  );
}

export default MeetingRoom;
