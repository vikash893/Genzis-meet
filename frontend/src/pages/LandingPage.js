import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import LoginModal from "../components/LoginModal";

function LandingPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Join Code Form
  const [meetingCode, setMeetingCode] = useState("");

  const handleInstantStart = () => {
    if (token) {
      navigate("/dashboard");
    } else {
      setShowLoginModal(true);
    }
  };

  const handleQuickJoin = (e) => {
    e.preventDefault();
    if (!meetingCode.trim()) return;

    if (!token) {
      setShowLoginModal(true);
      return;
    }

    const code = meetingCode.toUpperCase().trim();
    navigate(`/meeting/live/${code}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#202124] text-[#e8eaed] font-sans selection:bg-white selection:text-black">
        <Navbar />
        {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}

      {/* HERO SECTION - PURE GOOGLE MEET STYLE */}
      <section className="flex-1 py-16 md:py-24 px-6 md:px-16 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left Column: Hero Text & Actions */}
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#303134] border border-[#3c4043] text-white text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            <span>Premium video meetings. Now free for everyone.</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-normal text-white tracking-tight leading-tight">
            Video calls and meetings for everyone with <span className="font-bold text-white underline underline-offset-8 decoration-[#5f6368]">genzis-meet</span>
          </h1>

          <p className="text-[#9aa0a6] text-lg leading-relaxed max-w-xl">
            Connect, collaborate, and celebrate from anywhere with HD video calling, screen sharing, live chat, and instant 1-click meeting links.
          </p>

          {/* Google Meet Action Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
            <button
              onClick={handleInstantStart}
              className="px-6 py-3.5 bg-white hover:bg-slate-200 text-black font-semibold rounded-lg shadow-md transition-colors text-sm flex items-center justify-center gap-2 shrink-0"
            >
              <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>New meeting</span>
            </button>

            <form onSubmit={handleQuickJoin} className="flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9aa0a6]">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Enter a code or link"
                  value={meetingCode}
                  onChange={(e) => setMeetingCode(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-[#303134] border border-[#3c4043] rounded-lg text-white placeholder-[#9aa0a6] text-sm focus:outline-none focus:border-white transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={!meetingCode.trim()}
                className={`px-5 py-3 font-semibold rounded-lg text-sm transition-colors ${
                  meetingCode.trim()
                    ? "text-white bg-[#3c4043] hover:bg-slate-700"
                    : "text-[#5f6368] cursor-not-allowed"
                }`}
              >
                Join
              </button>
            </form>
          </div>

          <div className="pt-4 border-t border-[#3c4043] flex items-center gap-2 text-xs text-[#9aa0a6]">
            <span>Learn more about</span>
            <span className="text-white underline cursor-pointer">genzis-meet</span>
          </div>
        </div>

        {/* Right Column: Interactive Video Call Preview Showcase */}
        <div className="relative flex items-center justify-center">
          <div className="w-full max-w-lg bg-[#2d2f31] border border-[#3c4043] rounded-2xl p-4 shadow-2xl space-y-3 relative overflow-hidden">
            {/* Call Header */}
            <div className="flex items-center justify-between px-2 py-1 border-b border-[#3c4043]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span>
                <span className="text-xs font-semibold text-white">Live Meeting • genzis-meet</span>
              </div>
              <span className="text-xs text-white bg-white/10 px-2 py-0.5 rounded-md font-mono border border-white/20">
                HD 1080p
              </span>
            </div>

            {/* Simulated Grid Tiles */}
            <div className="grid grid-cols-2 gap-3 h-64">
              {/* Tile 1 */}
              <div className="relative rounded-xl overflow-hidden bg-[#171717] border border-[#3c4043] flex items-center justify-center group">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80"
                  alt="Video Call Participant 1"
                  className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-medium text-white flex items-center gap-1.5 border border-white/10">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Alex (Host)</span>
                </div>
              </div>

              {/* Tile 2 */}
              <div className="relative rounded-xl overflow-hidden bg-[#171717] border border-[#3c4043] flex items-center justify-center group">
                <img
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80"
                  alt="Video Call Participant 2"
                  className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-medium text-white flex items-center gap-1.5 border border-white/10">
                  <span>Jordan</span>
                </div>
                <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md w-6 h-6 rounded-full flex items-center justify-center text-[10px]">
                  🎤
                </div>
              </div>
            </div>

            {/* Simulated Control Pill */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <div className="w-10 h-10 rounded-full bg-[#3c4043] flex items-center justify-center text-sm">🎤</div>
              <div className="w-10 h-10 rounded-full bg-[#3c4043] flex items-center justify-center text-sm">📹</div>
              <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center text-sm font-bold">🖥️</div>
              <div className="w-10 h-10 rounded-full bg-[#3c4043] flex items-center justify-center text-sm">✋</div>
              <div className="w-12 h-10 rounded-full bg-red-600 flex items-center justify-center text-sm text-white">📞</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCT SNAPSHOT */}
      <section className="home-metrics border-y border-[#3c4043]">
        <div className="home-metrics-inner">
          <div><strong>HD video</strong><span>Clear, low-latency calls</span></div>
          <div><strong>1 click</strong><span>From link to live room</span></div>
          <div><strong>Private by design</strong><span>Host controls included</span></div>
          <div><strong>Any device</strong><span>Browser-ready and responsive</span></div>
        </div>
      </section>

      {/* PHOTO FEATURES SHOWCASE */}
      <section id="features" className="home-section py-20 px-6 md:px-16 max-w-7xl mx-auto w-full border-t border-[#3c4043]">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <h2 className="text-3xl font-normal text-white">
            Built for modern team collaboration on <span className="font-semibold text-white">genzis-meet</span>
          </h2>
          <p className="text-[#9aa0a6] text-sm">
            Experience crisp HD video, host control locks, and instant sharing.
          </p>
        </div>

        {/* 4 Photo Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Photo Card 1: HD Video Calls */}
          <div className="bg-[#2d2f31] border border-[#3c4043] rounded-2xl overflow-hidden hover:border-white/50 transition-all duration-300 group">
            <div className="h-48 overflow-hidden relative">
              <img
                src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80"
                alt="HD Video Calling"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-md text-xs font-semibold text-white border border-white/20">
                🎥 Full-Mesh WebRTC
              </div>
            </div>
            <div className="p-5 space-y-2">
              <h3 className="text-lg font-medium text-white">Crystal Clear Video Calls</h3>
              <p className="text-[#9aa0a6] text-xs leading-relaxed">
                Connect with low-latency P2P mesh technology and auto-adjusting video tile grids.
              </p>
            </div>
          </div>

          {/* Photo Card 2: Screen Sharing */}
          <div className="bg-[#2d2f31] border border-[#3c4043] rounded-2xl overflow-hidden hover:border-white/50 transition-all duration-300 group">
            <div className="h-48 overflow-hidden relative">
              <img
                src="https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=800&q=80"
                alt="Screen Sharing"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-md text-xs font-semibold text-white border border-white/20">
                🖥️ Instant Screen Presenting
              </div>
            </div>
            <div className="p-5 space-y-2">
              <h3 className="text-lg font-medium text-white">Present Your Screen</h3>
              <p className="text-[#9aa0a6] text-xs leading-relaxed">
                Share entire screens or app windows with seamless audio track replacement.
              </p>
            </div>
          </div>

          {/* Photo Card 3: Lecture Recording */}
          <div className="bg-[#2d2f31] border border-[#3c4043] rounded-2xl overflow-hidden hover:border-white/50 transition-all duration-300 group">
            <div className="h-48 overflow-hidden relative">
              <img
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80"
                alt="In-Browser Recording"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-md text-xs font-semibold text-white border border-white/20">
                🎙️ In-Browser Recording
              </div>
            </div>
            <div className="p-5 space-y-2">
              <h3 className="text-lg font-medium text-white">Record & Save Lectures</h3>
              <p className="text-[#9aa0a6] text-xs leading-relaxed">
                Capture high-definition meeting recordings directly into WebM files without software.
              </p>
            </div>
          </div>

          {/* Photo Card 4: Host Privacy Shield */}
          <div className="bg-[#2d2f31] border border-[#3c4043] rounded-2xl overflow-hidden hover:border-white/50 transition-all duration-300 group">
            <div className="h-48 overflow-hidden relative">
              <img
                src="https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80"
                alt="Anti-Leak Privacy Shield"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-md text-xs font-semibold text-white border border-white/20">
                🛡️ Host Privacy Guard
              </div>
            </div>
            <div className="p-5 space-y-2">
              <h3 className="text-lg font-medium text-white">Host Privacy Protection</h3>
              <p className="text-[#9aa0a6] text-xs leading-relaxed">
                Block non-host recordings and overlay security watermarks across video streams.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="home-section home-process py-20 px-6 md:px-16 max-w-7xl mx-auto w-full border-t border-[#3c4043]">
        <div className="home-section-heading">
          <span className="home-kicker">A calmer way to meet</span>
          <h2>From first hello to final takeaway.</h2>
          <p>Everything your team needs to move a conversation forward, without making people learn a complicated tool.</p>
        </div>
        <div className="process-grid">
          <article className="process-step"><span className="step-number">01</span><h3>Create a room</h3><p>Start a secure meeting in one click and get a shareable invite link instantly.</p></article>
          <article className="process-step"><span className="step-number">02</span><h3>Bring people in</h3><p>Share the link or meeting code. Guests join from a modern browser with no download.</p></article>
          <article className="process-step"><span className="step-number">03</span><h3>Make progress</h3><p>Present, chat, react, record, and keep the conversation focused from one room.</p></article>
        </div>
      </section>

      {/* SECURITY CALLOUT */}
      <section id="security" className="home-security max-w-7xl mx-auto w-full px-6 md:px-16">
        <div className="security-copy"><span className="home-kicker">Built for trust</span><h2>Your meeting stays yours.</h2><p>Host controls, privacy mode, and peer-to-peer media give you confidence before the call starts and control while it is running.</p><button onClick={handleInstantStart} className="security-link">Start a private room <span>→</span></button></div>
        <div className="security-list"><div><span>✓</span><p><strong>Host-first controls</strong><br />Manage the room as the conversation changes.</p></div><div><span>✓</span><p><strong>Privacy shield</strong><br />Add a visible protection layer to active streams.</p></div><div><span>✓</span><p><strong>Secure by default</strong><br />Connect through encrypted WebRTC media.</p></div></div>
      </section>

      {/* FOOTER */}
      <footer className="site-footer">
        <div className="footer-main"><div className="footer-brand"><div className="footer-mark">▶</div><div><strong>genzis<span>-meet</span></strong><p>Better conversations, anywhere.</p></div></div><p className="footer-intro">A focused video meeting space for teams, classrooms, and the people who make things happen.</p></div>
        <div className="footer-column"><h3>Product</h3><a href="/#features">Features</a><a href="/#how-it-works">How it works</a><a href="/#security">Security</a></div>
        <div className="footer-column"><h3>Get started</h3><button onClick={() => setShowLoginModal(true)}>Sign in</button><button onClick={() => navigate("/meeting")}>Join a meeting</button></div>
        <div className="footer-column"><h3>Connect</h3><a href="mailto:hello@genzis-meet.com">Contact support</a><a href="/#security">Privacy</a><a href="/#features">What's new</a></div>
        <div className="footer-bottom"><span>© 2026 genzis-meet Platform</span><span>Made for meaningful meetings.</span></div>
      </footer>
    </div>
  );
}

export default LandingPage;
