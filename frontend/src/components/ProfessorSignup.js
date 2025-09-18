// src/components/ProfessorSignup.js
import React, { useState, useRef, useEffect } from "react";
import api from "../api"; // axios instance
import { useNavigate } from "react-router-dom";

export default function ProfessorSignup({ onSubmit }) {
  const [form, setForm] = useState({
    username: "",
    full_name: "",
    email: "",
    password: "",
    department: "",
    courses: "" // comma-separated (optional)
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const navigate = useNavigate();
  const navTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    };
  }, []);

  function update(k, v) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function validate() {
    if (!form.username.trim()) return "Professor ID (username) is required";
    if (!form.full_name.trim()) return "Full name is required";
    if (!form.email.trim() || !form.email.includes("@")) return "Valid email is required";
    if (!form.password || form.password.length < 6) return "Password must be at least 6 characters";
    if (!form.department.trim()) return "Department is required";
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);
    const err = validate();
    if (err) { setMsg({ type: "danger", text: err }); return; }

    setLoading(true);

    try {
      const payload = {
        role: "professor",
        username: form.username.trim(),
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        department: form.department.trim(),
        courses: form.courses.split(",").map(s => s.trim()).filter(Boolean)
      };

      const res = await api.post("/auth/create", payload);

      setMsg({ type: "success", text: "Professor created successfully." });
      setForm({
        username: "",
        full_name: "",
        email: "",
        password: "",
        department: "",
        courses: ""
      });

      if (typeof onSubmit === "function") onSubmit(res.data);

      // ✅ same as student: small delay then redirect
      navTimeoutRef.current = setTimeout(
        () => navigate("/admin", { replace: true }),
        700
      );

    } catch (err) {
      console.error("professor create error", err);
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.details ||
        err?.message ||
        "Failed to create professor";
      setMsg({ type: "danger", text: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 820 }}>
      <div className="card shadow-sm mt-4">
        <div className="card-body">
          <h4 className="card-title mb-3">Add Professor</h4>
          <p className="text-muted small">
            Admin creates a professor account. Posts to backend and expects server-side hashing.
          </p>

          {msg && (
            <div className={`alert alert-${msg.type}`} role="alert">
              {msg.text}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* ✅ form is untouched */}
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Professor ID (username)</label>
                <input className="form-control"
                       value={form.username}
                       onChange={e => update("username", e.target.value)} />
              </div>

              <div className="col-md-6">
                <label className="form-label">Full name</label>
                <input className="form-control"
                       value={form.full_name}
                       onChange={e => update("full_name", e.target.value)} />
              </div>

              <div className="col-md-6">
                <label className="form-label">Email</label>
                <input type="email" className="form-control"
                       value={form.email}
                       onChange={e => update("email", e.target.value)} />
              </div>

              <div className="col-md-6">
                <label className="form-label">Department</label>
                <select className="form-control"
                        value={form.department}
                        onChange={e => update("department", e.target.value)}>
                  <option value="">Select department</option>
                  <option value="CS101">CS101</option>
                  <option value="cs102">CS102</option>
                  <option value="EE101">EE101</option>
                  <option value="EE">EE</option>
                </select>
              </div>

              <div className="col-md-6">
                <label className="form-label">Password</label>
                <input type="password" className="form-control"
                       value={form.password}
                       onChange={e => update("password", e.target.value)} />
                <div className="form-text">Min 6 characters</div>
              </div>

              <div className="col-12">
                <label className="form-label">Courses (comma separated codes)</label>
                <input className="form-control"
                       value={form.courses}
                       onChange={e => update("courses", e.target.value)}
                       placeholder="CS101, CS102, EE101" />
                <div className="form-text">
                  Optional: backend should map these to professor_courses table.
                </div>
              </div>
            </div>

            <div className="d-flex justify-content-end mt-4">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Creating…" : "Create Professor"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
