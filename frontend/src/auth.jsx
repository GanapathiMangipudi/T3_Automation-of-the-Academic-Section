// src/Auth.jsx
import React, { useState } from "react";

const API_BASE = process.env.REACT_APP_API || "http://localhost:4000/api";
const API_ORIGIN = API_BASE.replace(/\/api$/, "");

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student"); // default role
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleSignup(e) {
    e?.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_ORIGIN}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: Number(studentId),
          name,
          password,
          role,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.error) || res.statusText);
      setMessage({ type: "success", text: "Signup complete — please login." });
      setMode("login");
    } catch (err) {
      setMessage({ type: "danger", text: "Signup failed: " + (err.message || err) });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
  e?.preventDefault();
  setLoading(true);
  setMessage(null);
  try {
    const res = await fetch(`${API_ORIGIN}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: String(studentId),  // ✅ backend expects "username"
        password,
      }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body && body.error) || res.statusText);

    // expected response: { ok:true, token, role, username }
    localStorage.setItem("token", body.token);
    localStorage.setItem("student_id", body.id || studentId); // fallback to entered id
    localStorage.setItem("student_name", body.username || "");
    localStorage.setItem("role", body.role || "student");

    setMessage({ type: "success", text: "Logged in" });
    if (typeof onLogin === "function") {
      onLogin({
        studentId: body.id || Number(studentId),
        name: body.username,
        role: body.role,
        token: body.token,
      });
    }
  } catch (err) {
    setMessage({ type: "danger", text: "Login failed: " + (err.message || err) });
  } finally {
    setLoading(false);
  }
}

  return (
    <div className="container py-5" style={{ maxWidth: 560 }}>
      <div className="card shadow-sm">
        <div className="card-body">
          <h4 className="card-title mb-3">Student Portal</h4>

          <ul className="nav nav-tabs mb-3">
            <li className="nav-item">
              <button className={`nav-link ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Login</button>
            </li>
            <li className="nav-item">
              <button className={`nav-link ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>Sign up</button>
            </li>
            
          </ul>

          {message && (
            <div className={`alert alert-${message.type}`} role="alert">
              {message.text}
            </div>
          )}

          {mode === "signup" ? (
            <form onSubmit={handleSignup}>
              <div className="mb-3">
                <label className="form-label">Student ID</label>
                <input required type="number" className="form-control" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
              </div>

              <div className="mb-3">
                <label className="form-label">Full name</label>
                <input required type="text" className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="mb-3">
                <label className="form-label">Password</label>
                <input required type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} />
                <div className="form-text">Choose a strong password. This will be stored securely (hashed) on the server.</div>
              </div>

              <div className="mb-3">
                <label className="form-label">Role</label>
                <select className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="student">Student</option>
                  <option value="admin">Admin</option>
                </select>
                <div className="form-text">Role is used for role-based access control (RBAC).</div>
              </div>

              <div className="d-flex justify-content-between align-items-center">
                <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? "Signing up..." : "Sign up"}</button>
                <button type="button" className="btn btn-link" onClick={() => setMode("login")}>Already have an account?</button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin}>
              <div className="mb-3">
                <label className="form-label">Student ID</label>
                <input required type="number" className="form-control" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
              </div>

              <div className="mb-3">
                <label className="form-label">Password</label>
                <input required type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>

              <div className="d-flex justify-content-between align-items-center">
                <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? "Logging in..." : "Login"}</button>
                <button type="button" className="btn btn-link" onClick={() => setMode("signup")}>Sign up</button>
              </div>
              {/* put this inside your Auth component JSX, e.g. below the Login button */}
<div className="mt-3 d-flex justify-content-between align-items-center">
  <small className="text-muted">Not a student?</small>
  <button
    type="button"
    className="btn btn-link"
    style={{ padding: 0 }}
    onClick={() => { window.location.href = '/admin-login'; }}
  >
    Login as admin
  </button>

  <a href="/professor-login" style={{ marginRight: 12, color: '#007bff' }}>
    Login as professor
  </a>


</div>

            </form>
          )}
        </div>
      </div>
    </div>
  );
}
