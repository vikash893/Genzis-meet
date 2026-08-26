import { useEffect, useState } from "react";
import { ENDPOINTS } from "../api";

function LoginModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(ENDPOINTS.USER_LOGIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Login failed");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("userEmail", email);
      localStorage.setItem("userRole", "user");
      window.location.href = "/dashboard";
    } catch (requestError) {
      setError("Unable to connect to backend server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="login-modal-close" onClick={onClose} aria-label="Close login">×</button>
        <span className="home-kicker">Welcome back</span>
        <h2 id="login-modal-title">Sign in to genzis-meet</h2>
        <p className="login-modal-subtitle">Pick up the conversation wherever you left it.</p>

        {error && <div className="login-modal-error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit} className="login-modal-form">
          <label htmlFor="modal-email">Email address</label>
          <input id="modal-email" type="email" required placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="modal-password">Password</label>
          <input id="modal-password" type="password" required placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button type="submit" disabled={loading} className="login-modal-submit">{loading ? "Signing in..." : "Sign in"}</button>
        </form>
      </div>
    </div>
  );
}

export default LoginModal;
