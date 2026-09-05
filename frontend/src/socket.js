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
  transports: ["websocket", "polling"]
});

export const connectSocket = () => {
  const token = localStorage.getItem("token");
  if (token) {
    socket.auth = { token };
  }
  if (!socket.connected) {
    socket.connect();
  }
};

export default socket;