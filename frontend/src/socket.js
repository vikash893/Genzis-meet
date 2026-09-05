import { io } from "socket.io-client";
import { API_BASE_URL } from "./api";

const socket = io(API_BASE_URL, {
  autoConnect: false,
  // FIX: Reconnection configuration for seamless refresh handling
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  // Let Render establish the Socket.IO session over HTTP first, then upgrade
  // to WebSocket when the proxy and browser support it.
  transports: ["polling", "websocket"],
  upgrade: true
});

export const connectSocket = () => {
  const token = localStorage.getItem("token");
  // Always sync auth so reconnections use the latest token
  socket.auth = { token: token || "" };
  if (!socket.connected) {
    socket.connect();
  }
};

export default socket;