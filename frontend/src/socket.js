import { io } from "socket.io-client";
import { API_BASE_URL } from "./api";

const socket = io(API_BASE_URL, {
	auth: {
		token: localStorage.getItem("token")
	}
});

export default socket;