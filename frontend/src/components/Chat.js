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
    if (e) e.preventDefault();
    const cleanMessage = message.trim();
    if (!cleanMessage) return;

    const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const chatMessage = {
      id: messageId,
      email: activeEmail,
      meetingId: meetingId,
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

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sendQuickEmoji = (emoji) => {
    socket.emit("send-reaction", { meetingId, email, emoji });
  };

  return (
    <div className="w-full md:w-80 h-full flex flex-col bg-[#202124] border-l border-[#3c4043] text-slate-100 shadow-2xl relative select-none">
      {/* GOOGLE MEET STYLE CHAT HEADER */}
      <div className="p-4 border-b border-[#3c4043] flex items-center justify-between bg-[#2d2f31]">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <h3 className="font-bold text-white text-base">In-call messages</h3>
        </div>

        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
            connected 
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
              : "bg-red-500/20 text-red-400 border-red-500/30"
          }`}>
            {connected ? "Live" : "Connecting..."}
          </span>

          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-lg p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-2 bg-indigo-500/10 border-b border-[#3c4043] text-[11px] text-indigo-300">
        Messages can be seen only by people in the call.
      </div>

      {/* MESSAGES LIST */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-10">
            <span className="text-3xl mb-2">💬</span>
            <p className="text-xs font-semibold">No in-call messages yet</p>
            <p className="text-[11px] text-slate-500 mt-1">Send a message to everyone in this call</p>
          </div>
        ) : (
          messages.map((item) => {
            const isMe = item.email === email;
            return (
              <div
                key={item.id}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-bold text-slate-400">
                    {isMe ? "You" : item.email.split('@')[0]}
                  </span>
                  <span className="text-[9px] text-slate-500">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div
                  className={`px-3.5 py-2.5 rounded-2xl max-w-[85%] text-xs font-medium leading-relaxed break-words shadow-md ${
                    isMe
                      ? "bg-[#8ab4f8] text-[#202124] rounded-tr-none font-semibold"
                      : "bg-[#3c4043] text-slate-100 rounded-tl-none"
                  }`}
                >
                  {item.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* QUICK EMOJI BAR */}
      <div className="px-4 py-2 bg-[#2d2f31] border-t border-[#3c4043] flex items-center justify-around">
        {["❤️", "👏", "👍", "🔥", "🎉"].map((emoji) => (
          <button
            key={emoji}
            onClick={() => sendQuickEmoji(emoji)}
            className="hover:scale-125 transition-transform text-base p-1"
            title={`Send ${emoji} reaction`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* INPUT FORM */}
      <form onSubmit={sendMessage} className="p-3 border-t border-[#3c4043] bg-[#2d2f31] flex gap-2">
        <input
          type="text"
          placeholder="Send a message to everyone..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 px-3.5 py-2.5 rounded-full bg-[#202124] border border-[#3c4043] text-white placeholder-slate-500 text-xs focus:outline-none focus:border-[#8ab4f8]"
        />

        <button
          type="submit"
          disabled={!message.trim()}
          className="px-4 py-2.5 bg-[#8ab4f8] hover:bg-blue-300 disabled:opacity-40 text-[#202124] rounded-full font-bold text-xs transition-all shrink-0"
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default Chat;