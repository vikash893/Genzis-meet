import { useEffect, useState, useRef } from "react";
import socket from "../socket";

function Chat({ meetingId, email, onClose, messages = [], onSendMessage }) {
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState(socket.connected);
  const messagesEndRef = useRef(null);
  const activeEmail = email || localStorage.getItem("userEmail") || "User";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    setConnected(socket.connected);

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = (e) => {
    e?.preventDefault();
    const cleanMessage = message.trim();
    if (!cleanMessage) return;

    const chatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      email: activeEmail,
      meetingId,
      message: cleanMessage,
      timestamp: new Date().toISOString()
    };

    if (onSendMessage) {
      onSendMessage(chatMessage);
    } else {
      socket.emit("send-message", chatMessage);
    }

    setMessage("");
  };

  const sendQuickEmoji = (emoji) => {
    socket.emit("send-reaction", { meetingId, email: activeEmail, emoji });
  };

  return (
    <div className="fixed inset-0 z-50 sm:relative sm:inset-auto sm:z-auto w-full sm:w-80 md:w-88 lg:w-96 h-full flex flex-col bg-[#16213e] border-l border-[#0f3460]/50 shadow-2xl sm:shadow-none animate-fadeIn">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-[#0f3460]/50 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">💬</span>
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">In-call messages</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              {connected ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[10px] text-emerald-400 font-semibold">Live</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
                  <span className="text-[10px] text-red-400 font-semibold">Connecting...</span>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-[#1a1a2e] hover:bg-[#0f3460] flex items-center justify-center transition-colors"
        >
          <span className="text-slate-400 hover:text-white text-sm">✕</span>
        </button>
      </div>

      {/* Notice */}
      <div className="px-4 py-2 bg-[#0f3460]/30 border-b border-[#0f3460]/30">
        <p className="text-[10px] text-slate-400 leading-relaxed">Messages are visible to everyone in this call and persist until the host ends the meeting.</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
            <div className="w-14 h-14 rounded-full bg-[#0f3460] flex items-center justify-center">
              <span className="text-2xl">💬</span>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-300">No messages yet</p>
              <p className="text-[10px] text-slate-500 mt-1">Start the conversation</p>
            </div>
          </div>
        ) : (
          messages.map((item, idx) => {
            const isMine = item.email === activeEmail;
            return (
              <div
                key={item.id || idx}
                className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
              >
                <span className="text-[10px] text-slate-500 mb-0.5 px-1 font-medium">
                  {isMine ? "You" : item.email?.split("@")[0]}
                </span>
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    isMine
                      ? "bg-[#8ab4f8] text-[#1a1a2e] rounded-tr-sm font-medium"
                      : "bg-[#0f3460] text-slate-100 rounded-tl-sm border border-[#533483]/20"
                  }`}
                >
                  {item.message}
                </div>
                <span className="text-[9px] text-slate-600 mt-0.5 px-1">
                  {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reactions */}
      <div className="px-4 py-2 border-t border-[#0f3460]/30 flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] text-slate-500 mr-1">Quick:</span>
        {["❤️", "👏", "👍", "🔥", "🎉"].map((emoji) => (
          <button
            key={emoji}
            onClick={() => sendQuickEmoji(emoji)}
            className="p-1 hover:scale-125 transition-transform text-base"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="px-3 py-3 border-t border-[#0f3460]/50 flex items-center gap-2 shrink-0 bg-[#1a1a2e]">
        <input
          type="text"
          placeholder="Send a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) sendMessage(e); }}
          className="flex-1 bg-[#0f3460] border border-[#533483]/30 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#8ab4f8]/50 transition-colors"
        />
        <button
          type="submit"
          disabled={!message.trim()}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            message.trim()
              ? "bg-[#8ab4f8] text-[#1a1a2e] shadow-md hover:bg-[#aecbfa]"
              : "bg-[#0f3460] text-slate-600 cursor-not-allowed"
          }`}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </form>
    </div>
  );
}

export default Chat;