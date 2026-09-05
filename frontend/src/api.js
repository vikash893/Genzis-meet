// CRA embeds this value at build time, so keep the deployed backend as a safe production fallback.
const defaultApiUrl = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "http://localhost:8000"
  : "https://genzis-meet.onrender.com";

const configuredApiUrl = process.env.REACT_APP_API_URL || defaultApiUrl;
export const API_BASE_URL = configuredApiUrl.replace(/\/+$/, "");

export const normalizeMeetingId = (value = "") => String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
export const normalizePasscode = (value = "") => String(value ?? "").trim();

export const ENDPOINTS = {
  USER_LOGIN: `${API_BASE_URL}/api/user/login`,
  USER_REGISTER: `${API_BASE_URL}/api/user/register`,
  USER_ALL: `${API_BASE_URL}/api/user/all`,
  ADMIN_LOGIN: `${API_BASE_URL}/api/admin/admin-login`,
  ADMIN_REGISTER_USER: `${API_BASE_URL}/api/admin/Register-user`,
  ADMIN_CREATE_ADMIN: `${API_BASE_URL}/api/admin/create-admin`,
  ADMIN_USER_ANALYTICS: `${API_BASE_URL}/api/admin/user-analytics`,
  ANNOUNCEMENT_ALL: `${API_BASE_URL}/api/announcement/all`,
  ANNOUNCEMENT_PUBLISH: `${API_BASE_URL}/api/announcement/publish`,
  MEETING_CREATE: `${API_BASE_URL}/meeting/create`,
  MEETING_JOIN: `${API_BASE_URL}/meeting/join`,
  MEETING_ACTIVE: `${API_BASE_URL}/meeting/active`,
  MEETING_END: `${API_BASE_URL}/meeting/end`,
  MEETING_ACCESS: (meetingId) => `${API_BASE_URL}/meeting/${meetingId}/access`,
  MEETING_CANCEL: (meetingId) => `${API_BASE_URL}/meeting/${meetingId}`,
  MEETING_HISTORY: `${API_BASE_URL}/meeting/history`,
  MEETING_HISTORY_CSV: (meetingId) => `${API_BASE_URL}/meeting/history/${meetingId}.csv`,
  MEETING_RECORDING: (meetingId) => `${API_BASE_URL}/meeting/${meetingId}/recording`,
  MEETING_RECORDING_STREAM: (meetingId) => `${API_BASE_URL}/meeting/${meetingId}/recording/stream`
};
