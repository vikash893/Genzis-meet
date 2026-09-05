import { useEffect, useRef } from "react";

function RemoteVideo({
  stream,
  email,
  isMuted = false,
  isCameraOff = false,
  isHandRaised = false,
  isPrivacyMode = false
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((e) =>
        console.warn("Autoplay warning:", e)
      );
    }
  }, [stream]);

  const initial =
    email && typeof email === "string"
      ? email.charAt(0).toUpperCase()
      : "U";

  return (
    <div className="relative group w-full h-full min-h-[140px] sm:min-h-[180px] md:min-h-[220px] rounded-xl sm:rounded-2xl overflow-hidden bg-[#16213e] border border-[#0f3460]/50 flex items-center justify-center transition-all">
      {/* Privacy Mode Watermark */}
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
          <svg
            className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-950"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5a1.5 1.5 0 113 0m-3 0V11m3-5.5a1.5 1.5 0 113 0V11"
            />
          </svg>
          <span className="hidden sm:inline">Hand Raised</span>
        </div>
      )}

      {/* Audio Muted / Active Badge */}
      <div className="absolute top-2 sm:top-3 right-2 sm:right-3 z-20">
        {isMuted ? (
          <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-red-600/90 text-white flex items-center justify-center text-xs shadow-md backdrop-blur-md">
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isCameraOff ? "opacity-0 absolute" : "opacity-100"
        }`}
      />

      {/* Camera Off Fallback */}
      {isCameraOff && (
        <div className="flex flex-col items-center justify-center gap-2 sm:gap-3">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-[#533483] to-[#8ab4f8] text-white font-black text-2xl sm:text-3xl flex items-center justify-center shadow-xl">
            {initial}
          </div>
          <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Camera Turned Off</span>
        </div>
      )}

      {/* Participant Label */}
      <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-20 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-white/10">
        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400"></span>
        <span className="text-[10px] sm:text-xs font-semibold text-white truncate max-w-[120px] sm:max-w-[200px]">
          {email}
        </span>
      </div>
    </div>
  );
}

export default RemoteVideo;