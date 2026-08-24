import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import Login from "./pages/login";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import JoinMeeting from "./pages/JoinMeeting";
import Meeting from "./pages/Meeting";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing Hub */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<LandingPage />} />
        <Route path="/contact" element={<LandingPage />} />

        {/* Auth Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />

        {/* User Dashboard */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Hidden Admin Routes */}
        <Route path="/genzies-admin" element={<Login defaultTab="admin" />} />
        <Route path="/genzies-admin/dashboard" element={<AdminDashboard />} />

        {/* Legacy Join Route */}
        <Route path="/meeting" element={<JoinMeeting />} />

        {/* Live Meeting Room */}
        <Route path="/meeting/live" element={<Meeting />} />
        <Route path="/meeting/live/:meetingId" element={<Meeting />} />

        {/* Catch-all fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;