import { io } from "socket.io-client";
import { API_BASE_URL } from "./api";

const socket = io(API_BASE_URL, {
	autoConnect: false,
	auth: {
		token: localStorage.getItem("token")
	}
});

export const connectSocket = () => {
	const token = localStorage.getItem("token");
	socket.auth = { token };
	if (!socket.connected) {
		socket.connect();
	}
	return socket;
};

export default socket;