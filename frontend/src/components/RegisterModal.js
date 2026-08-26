import { useEffect, useState } from "react";
import { ENDPOINTS } from "../api";

function RegisterModal({ onClose, onRegistered }) {
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleChange = (event) => {
    setFormData((currentForm) => ({ ...currentForm, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(ENDPOINTS.USER_REGISTER, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      setSuccess(true);
      setTimeout(onRegistered, 1200);
    } catch (requestError) {
      setError("Unable to connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="register-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="login-modal-close" onClick={onClose} aria-label="Close registration">×</button>
        <span className="home-kicker">Get started</span>
        <h2 id="register-modal-title">Create your account</h2>
        <p className="login-modal-subtitle">Join genzis-meet for seamless video collaboration.</p>

        {error && <div className="login-modal-error" role="alert">{error}</div>}
        {success && <div className="register-modal-success" role="status">Account created. Opening sign in...</div>}

        <form onSubmit={handleSubmit} className="login-modal-form">
          <label htmlFor="register-modal-name">Full name</label>
          <input id="register-modal-name" name="name" type="text" required placeholder="John Doe" value={formData.name} onChange={handleChange} />
          <label htmlFor="register-modal-email">Email address</label>
          <input id="register-modal-email" name="email" type="email" required placeholder="name@example.com" value={formData.email} onChange={handleChange} />
          <label htmlFor="register-modal-phone">Phone number</label>
          <input id="register-modal-phone" name="phone" type="tel" required placeholder="+1 234 567 8900" value={formData.phone} onChange={handleChange} />
          <label htmlFor="register-modal-password">Password</label>
          <input id="register-modal-password" name="password" type="password" required placeholder="Enter a password" value={formData.password} onChange={handleChange} />
          <button type="submit" disabled={loading || success} className="login-modal-submit">{loading ? "Creating account..." : "Create account"}</button>
        </form>
      </div>
    </div>
  );
}

export default RegisterModal;