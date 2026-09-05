/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import socket, { connectSocket } from "../socket";
import Chat from "../components/Chat";
import RemoteVideo from "../components/RemoteVideo";

const normalizeMeetingId = (value) =>
  String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

// ============================================================
// RemoteVideoTile — wraps RemoteVideo with an internal ref
// so each remote participant gets a stable, unique <video> ref.
// ============================================================
function RemoteVideoTile({ stream, email, isMuted, isCameraOff, isHandRaised, isPrivacyMode }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.play().catch(() => {});
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream]);

  return (
    <RemoteVideo
      stream={stream}
      email={email}
      isMuted={isMuted}
      isCameraOff={isCameraOff}
      isHandRaised={isHandRaised}
      isPrivacyMode={isPrivacyMode}
    />
  );
}

// ============================================================
// LocalVideoTile — local user tile with opacity-based hiding
// so audio keeps playing even when camera is off.
// ============================================================
function LocalVideoTile({ videoRef, stream, name, muted, cameraOff }) {
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return undefined;
    el.srcObject = stream;
    el.play().catch(() => {});
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream, videoRef]);

  return (
    <div className="relative min-h-[220px] overflow-hidden rounded-2xl border border-white/10 bg-[#11182d] shadow-xl">
      {/* FIX: Use opacity-0 + absolute instead of display:none so audio keeps decoding */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`h-full min-h-[220px] w-full object-cover transition-opacity duration-300 ${
          cameraOff ? "opacity-0 absolute" : "opacity-100"
        }`}
      />
      {cameraOff && (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 bg-[#18213b]">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#8ab4f8] text-3xl font-bold text-[#11182d]">
            {name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm text-slate-400">Camera off</span>
        </div>
      )}
      <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-xl bg-black/60 px-3 py-2 text-sm backdrop-blur">
        <span className="max-w-[70%] truncate font-semibold text-white">
          You ({name})
        </span>
        {muted && (
          <span className="rounded-full bg-red-500/80 px-2 py-1 text-[10px] font-bold text-white">
            Muted
          </span>
        )}
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
  const offerLockRef = useRef(new Map());
  const joinedRef = useRef(false);
  // FIX: ICE candidate queue — buffer candidates until remoteDescription is set
  const iceCandidateQueueRef = useRef(new Map());
  // FIX: Persistent remote MediaStreams — accumulate tracks instead of overwriting
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

  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  // -----------------------------------------------------------
  // Helper: sync a single track onto an existing RTCPeerConnection
  // -----------------------------------------------------------
  const syncTrack = (pc, track) => {
    const transceiver = pc
      .getTransceivers()
      .find((item) => item.receiver?.track?.kind === track.kind);
    if (transceiver) return transceiver.sender.replaceTrack(track);
    return Promise.resolve();
  };

  // -----------------------------------------------------------
  // Helper: flush queued ICE candidates after remoteDescription is set
  // -----------------------------------------------------------
  const flushIceCandidates = async (targetSocketId, pc) => {
    const queue = iceCandidateQueueRef.current.get(targetSocketId);
    if (!queue || queue.length === 0) return;
    iceCandidateQueueRef.current.set(targetSocketId, []);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("Flushed ICE candidate failed:", e);
      }
    }
  };

  // -----------------------------------------------------------
  // createPeer — build an RTCPeerConnection for a remote participant
  // -----------------------------------------------------------
  const createPeer = useCallback(
    (targetSocketId) => {
      const existing = peersRef.current.get(targetSocketId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers });
      pc.addTransceiver("audio", { direction: "sendrecv" });
      pc.addTransceiver("video", { direction: "sendrecv" });
      peersRef.current.set(targetSocketId, pc);

      // Initialise ICE queue for this peer
      if (!iceCandidateQueueRef.current.has(targetSocketId)) {
        iceCandidateQueueRef.current.set(targetSocketId, []);
      }

      // Push local tracks if available
      const stream = localStreamRef.current;
      if (stream)
        stream.getTracks().forEach((track) => syncTrack(pc, track));

      // ICE trickle
      pc.onicecandidate = ({ candidate }) => {
        if (candidate)
          socket.emit("ice-candidate", { targetSocketId, candidate });
      };

      // FIX: ontrack — accumulate tracks into a persistent MediaStream per peer
      pc.ontrack = (event) => {
        let peerStream = remoteMediaStreamsRef.current.get(targetSocketId);
        if (!peerStream) {
          peerStream = new MediaStream();
          remoteMediaStreamsRef.current.set(targetSocketId, peerStream);
        }

        const incomingTrack = event.track;

        // Replace existing track of same kind, or add new
        const existingTrack = peerStream
          .getTracks()
          .find((t) => t.kind === incomingTrack.kind);
        if (existingTrack && existingTrack.id !== incomingTrack.id) {
          peerStream.removeTrack(existingTrack);
        }
        if (!peerStream.getTracks().find((t) => t.id === incomingTrack.id)) {
          peerStream.addTrack(incomingTrack);
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

      // Peer connection lifecycle
      pc.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(pc.connectionState)) {
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

      // Negotiation needed — polite peer pattern using socket.id ordering
      pc.onnegotiationneeded = async () => {
        if (
          socket.id > targetSocketId ||
          offerLockRef.current.get(targetSocketId) ||
          pc.signalingState !== "stable"
        )
          return;
        offerLockRef.current.set(targetSocketId, true);
        try {
          const offer = await pc.createOffer();
          if (pc.signalingState === "stable") {
            await pc.setLocalDescription(offer);
            socket.emit("offer", {
              targetSocketId,
              offer: pc.localDescription,
            });
          }
        } catch (negotiationError) {
          if (!String(negotiationError?.name).includes("Invalid"))
            setError("Could not negotiate a participant connection.");
        } finally {
          offerLockRef.current.set(targetSocketId, false);
        }
      };

      return pc;
    },
    [iceServers]
  );

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
    };

    // FIX: Apply offer → answer and then flush queued ICE candidates
    const onOffer = async ({ fromSocketId, offer }) => {
      const pc = createPeer(fromSocketId);
      try {
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
          "A participant connection could not be negotiated. Please rejoin the meeting."
        );
      }
    };

    // FIX: Apply answer then flush queued ICE candidates
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

    // FIX: Queue ICE candidates if remoteDescription not yet set
    const onIce = async ({ fromSocketId, candidate }) => {
      const pc = peersRef.current.get(fromSocketId);
      if (!pc) return;
      if (pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("ICE candidate error:", e);
        }
      } else {
        // Queue the candidate for later
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
  // Compute grid
  // -----------------------------------------------------------
  const remoteEntries = Object.entries(remoteStreams);
  const tileCount = remoteEntries.length + 1;
  const gridClass =
    tileCount === 1
      ? "grid-cols-1"
      : tileCount < 5
      ? "grid-cols-1 sm:grid-cols-2"
      : "grid-cols-2 lg:grid-cols-3";

  const isHost = hostSocketId === socket.id;

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
    <div className="flex min-h-screen flex-col bg-[#0d1328] text-white">
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
      <header className="flex h-16 items-center justify-between border-b border-white/10 bg-[#111a32] px-4 sm:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8ab4f8]">
            Live meeting
          </p>
          <p className="font-mono text-sm font-bold">
            {meetingInfo?.title || meetingId}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span
            className={`h-2 w-2 rounded-full ${
              socketStatus === "connected" ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          {socketStatus === "connected"
            ? `${participants.length} connected`
            : "Reconnecting"}

          {/* Copy Invite */}
          <button
            onClick={copyInvite}
            className="rounded-xl bg-white/10 px-3 py-2 font-semibold text-white hover:bg-white/20 transition-colors"
            title="Copy meeting invite"
          >
            📋 Invite
          </button>

          {/* Chat Toggle */}
          <button
            onClick={() => setChatOpen((current) => !current)}
            className="rounded-xl bg-white/10 px-3 py-2 font-semibold text-white hover:bg-white/20 transition-colors"
          >
            💬 Chat
          </button>
        </div>
      </header>

      {/* ERROR BAR */}
      {error && (
        <div className="mx-auto mt-3 w-[min(92%,800px)] rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-100">
          {error}
        </div>
      )}

      {/* MAIN CONTENT */}
      <div className="flex flex-1 overflow-hidden">
        {/* VIDEO GRID */}
        <main className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
          <div className={`grid flex-1 content-center gap-4 ${gridClass}`}>
            {/* Local tile */}
            <LocalVideoTile
              videoRef={localVideoRef}
              stream={localStreamRef.current}
              name={email}
              muted={localMuted}
              cameraOff={localCameraOff}
            />

            {/* Remote tiles — using RemoteVideo component with full features */}
            {remoteEntries.map(([id, item]) => (
              <RemoteVideoTile
                key={id}
                stream={item.stream}
                email={item.email}
                isMuted={remoteStates[id]?.isMuted}
                isCameraOff={remoteStates[id]?.isCameraOff}
                isHandRaised={handRaisedUsers[id] || false}
                isPrivacyMode={isPrivacyMode}
              />
            ))}
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
      <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-[#111a32] p-4 sm:gap-3">
        {/* Mic */}
        <button
          onClick={toggleMic}
          className={`rounded-2xl px-4 py-3 text-sm font-bold ${
            localMuted
              ? "bg-red-500 text-white"
              : "bg-white/10 text-white"
          }`}
        >
          {localMuted ? "🎙️ Unmute" : "🎙️ Mute"}
        </button>

        {/* Camera */}
        <button
          onClick={toggleCamera}
          className={`rounded-2xl px-4 py-3 text-sm font-bold ${
            localCameraOff
              ? "bg-red-500 text-white"
              : "bg-white/10 text-white"
          }`}
        >
          {localCameraOff ? "📷 Start camera" : "📷 Stop camera"}
        </button>

        {/* Screen Share */}
        <button
          onClick={toggleShare}
          className={`rounded-2xl px-4 py-3 text-sm font-bold ${
            sharing ? "bg-emerald-500 text-white" : "bg-white/10 text-white"
          }`}
        >
          {sharing ? "🖥️ Stop sharing" : "🖥️ Share screen"}
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
          className={`rounded-2xl px-4 py-3 text-sm font-bold ${
            handRaised
              ? "bg-amber-400 text-[#0d1328]"
              : "bg-white/10 text-white"
          }`}
        >
          ✋ {handRaised ? "Lower hand" : "Raise hand"}
        </button>

        {/* Quick Emoji Reactions */}
        <div className="flex items-center gap-1 rounded-2xl bg-white/5 px-2 py-1">
          {["👍", "❤️", "🎉", "🔥"].map((emoji) => (
            <button
              key={emoji}
              onClick={() =>
                socket.emit("send-reaction", { meetingId, email, emoji })
              }
              className="rounded-full p-2 text-lg hover:scale-125 transition-transform hover:bg-white/10"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Host: End Meeting */}
        {isHost && (
          <button
            onClick={() => setShowEndConfirm(true)}
            className="rounded-2xl bg-red-700 px-4 py-3 text-sm font-bold text-white hover:bg-red-800"
          >
            End Meeting
          </button>
        )}

        {/* Leave */}
        <button
          onClick={leave}
          className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white"
        >
          Leave
        </button>
      </footer>
    </div>
  );
}

export default MeetingRoom;
