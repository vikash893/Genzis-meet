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
    }
  }, [stream]);

  const initial = email ? email.charAt(0).toUpperCase() : "U";

  return (
    <div className="relative group w-full h-full min-h-[220px] rounded-2xl overflow-hidden bg-[#202124] border border-[#3c4043] flex items-center justify-center transition-all duration-300 select-none">
      {/* SECURITY PRIVACY WATERMARK OVERLAY */}
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
          <span>Hand Raised</span>
        </div>
      )}

      {/* Audio Muted Indicator Badge */}
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
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isCameraOff ? "opacity-0 absolute" : "opacity-100"
        }`}
      />

      {/* Camera Off Avatar Fallback */}
      {isCameraOff && (
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-black text-3xl flex items-center justify-center shadow-xl glow-brand">
            {initial}
          </div>
          <span className="text-xs text-slate-400 font-medium">Camera Turned Off</span>
        </div>
      )}

      {/* Participant Info Overlay Bar */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 max-w-[85%]">
        <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></div>
        <span className="text-xs font-semibold text-white truncate">{email}</span>
      </div>
    </div>
  );
}

export default RemoteVideo;