// src/pages/AdminAddStudentPage.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminAddStudentPage({ apiBase = '' }) {
  const navigate = useNavigate();
  const API = `${apiBase}/admin/students`;

  const [form, setForm] = useState({
    student_id: '',
    name: '',
    email: '',
    password: '',
    role: 'student',
  });

  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  // refs for cleaning up pending requests / timers
  const abortRef = useRef(null);
  const timeoutRef = useRef(null);
  const navTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      // cleanup on unmount
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (loading) return; // prevent double submit
    setAlert(null);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // abort after 15s to avoid indefinite pending
    timeoutRef.current = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();
    }, 15000);

    try {
      console.log('Submitting to', API, 'payload:', form);

      const res = await fetch(API, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        signal: controller.signal,
      });

      // clear timeout after response (whether ok or error)
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      abortRef.current = null;

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText}: ${text}`);
      }

      // success
      const data = await res.json().catch(() => null);
      setAlert({ type: 'success', msg: 'Student added successfully.' });

      // small delay to show success message, then navigate back
      navTimeoutRef.current = setTimeout(() => navigate('/admin', { replace: true }), 700);
      console.log('Add success', data);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('Add request aborted / timed out', err);
        setAlert({ type: 'danger', msg: 'Request timed out. Please try again.' });
      } else {
        console.error('Add failed', err);
        setAlert({ type: 'danger', msg: 'Failed to add student: ' + (err.message || err) });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container py-4" style={{ maxWidth: 720 }}>
      <div className="card shadow-sm">
        <div className="card-body">
          <h3 className="card-title mb-3">Add Student</h3>

          {alert && (
            <div className={`alert alert-${alert.type} alert-dismissible`} role="alert">
              {alert.msg}
              <button type="button" className="btn-close" aria-label="Close" onClick={() => setAlert(null)} />
            </div>
          )}

          <form onSubmit={submit}>
            <div className="mb-3">
              <label htmlFor="student_id" className="form-label">Student ID</label>
              <input
                id="student_id"
                name="student_id"
                value={form.student_id}
                onChange={handleChange}
                className="form-control"
                required
                autoComplete="off"
              />
            </div>

            <div className="mb-3">
              <label htmlFor="name" className="form-label">Full name</label>
              <input
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                className="form-control"
                required
                autoComplete="name"
              />
            </div>

            <div className="mb-3">
              <label htmlFor="email" className="form-label">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                className="form-control"
                required
                autoComplete="email"
              />
            </div>

            <div className="mb-3">
              <label htmlFor="password" className="form-label">Temporary password</label>
              <input
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                className="form-control"
                minLength={6}
                required
                autoComplete="new-password"
              />
              <div className="form-text">Student should change password after first login.</div>
            </div>

            <div className="mb-3">
              <label htmlFor="role" className="form-label">Role</label>
              <select
                id="role"
                name="role"
                value={form.role}
                onChange={handleChange}
                className="form-select"
                required
              >
                <option value="student">Student</option>
                <option value="professor">Professor</option>
                <option value="admin">Admin</option>
              </select>
              <div className="form-text">Select role for role-based access control.</div>
            </div>

            <div className="d-flex justify-content-between align-items-center">
              <div>
                <button type="submit" className="btn btn-primary me-2" disabled={loading}>
                  {loading ? 'Adding...' : 'Add User'}
                </button>
                <button type="button" className="btn btn-link" onClick={() => navigate(-1)}>Cancel</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
