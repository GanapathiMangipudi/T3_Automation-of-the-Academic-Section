// src/components/AdminLogin.js
import React, { useState } from "react";

export default function AdminLogin({ onLogin }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("http://localhost:4000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          (body && (body.error || body.details)) || `Server ${res.status}`;
        throw new Error(msg);
      }

      if (!body || !body.ok || !body.token) {
        throw new Error("Invalid server response");
      }

      // Save auth info in localStorage
      localStorage.setItem("token", body.token);
      localStorage.setItem("role", body.role || "admin");
      localStorage.setItem("student_id", body.id ?? "");
      localStorage.setItem("student_name", body.username ?? "");

      // Notify parent
      onLogin({
        token: body.token,
        studentId: body.id ?? 0,
        name: body.username ?? "",
        role: body.role,
      });
    } catch (error) {
      console.error("Admin login failed:", error);
      setErr(error.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 420 }}>
      <h3>Admin Login</h3>
      {err && <div className="alert alert-danger">{err}</div>}
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="form-label">Username (numeric)</label>
          <input
            name="username"
            className="form-control"
            value={form.username}
            onChange={handleChange}
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Password</label>
          <input
            name="password"
            type="password"
            className="form-control"
            value={form.password}
            onChange={handleChange}
            required
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
