
/* eslint-disable react-hooks/exhaustive-deps */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./StudentDashboard.css";

const API_BASE = process.env.REACT_APP_API || "http://localhost:4000/api";

export default function StudentDashboard({pollIntervalMs = 0 }) {
  const [courses, setCourses] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [selectAllChecked, setSelectAllChecked] = useState(false);
   const [data, setData] = useState([]);      // holds attendance rows
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const studentId = localStorage.getItem("student_id");
  // add these state hooks (place them where other useState are declared)
const [attendanceSummary, setAttendanceSummary] = useState({ per_course: [], overall: null });
const [attendanceLoading, setAttendanceLoading] = useState(false);

const localStudentId = studentId || localStorage.getItem('student_id') || null;
  useEffect(() => {
    loadCourses();
    // run once
    // eslint-disable-next-line
  }, []);

  function normalizeArrayResp(body) {
    if (!body) return [];
    if (Array.isArray(body)) return body;
    if (Array.isArray(body.data)) return body.data;
    if (Array.isArray(body.courses)) return body.courses;
    if (Array.isArray(body.rows)) return body.rows;
    return [];
  }

  async function loadCourses() {
    setLoading(true);
    setMsg(null);
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      else if (studentId) headers["x-student-id"] = studentId;

      const res = await fetch(`${API_BASE}/courses`, { headers, cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`GET /api/courses failed: ${res.status} ${txt}`);
      }
      const body = await res.json().catch(() => null);
      const list = normalizeArrayResp(body);
      setCourses(list);

      // after courses are loaded, fetch saved selections
      await loadCourseResponses(list);
      
    } catch (err) {
      console.error("loadCourses error", err);
      setMsg("Failed to load courses (see console).");
      setCourses([]);
      setSelected(new Set());
      setSelectAllChecked(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadCourseResponses(coursesList = null) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      else if (studentId) headers["x-student-id"] = studentId;

      const tryPaths = [
        `${API_BASE}/course_responses/my`,
        `${API_BASE}/course_responses`,
        `${API_BASE}/course_responses?student_id=${studentId}`,
        `/course_responses`
      ];

      let body = null;
      let ok = false;
      for (const p of tryPaths) {
        try {
          const r = await fetch(p, { headers, cache: "no-store" });
          if (!r.ok) continue;
          body = await r.json().catch(() => null);
          ok = true;
          break;
        } catch (e) {
          continue;
        }
      }

      if (!ok || !body) {
        setSelected(new Set());
        setSelectAllChecked(false);
        return;
      }

      const rows = normalizeArrayResp(body);
      const sel = new Set();
      for (const r of rows) {
        const id = Number(r.course_id ?? r.courseId ?? r.id);
        if (!Number.isNaN(id) && id > 0) sel.add(id);
      }
      setSelected(sel);

      const list = Array.isArray(coursesList) ? coursesList : courses;
      const courseIds = (list || []).map((c) => Number(c.course_id ?? c.id ?? c.courseId)).filter(Boolean);
      setSelectAllChecked(courseIds.length > 0 && courseIds.every((id) => sel.has(id)));
    } catch (err) {
      console.error("loadCourseResponses error", err);
      setSelected(new Set());
      setSelectAllChecked(false);
    }
  }

  function toggleCourse(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const courseIds = courses.map((c) => Number(c.course_id ?? c.id ?? c.courseId)).filter(Boolean);
      const allSel = courseIds.length > 0 && courseIds.every((cid) => next.has(cid));
      setSelectAllChecked(Boolean(allSel));
      return next;
    });
  }

  function handleSelectAll() {
    const ids = courses.map((c) => Number(c.course_id ?? c.id ?? c.courseId)).filter(Boolean);
    if (ids.length === 0) return;
    setSelected((prev) => {
      if (selectAllChecked) {
        setSelectAllChecked(false);
        return new Set();
      } else {
        setSelectAllChecked(true);
        return new Set(ids);
      }
    });
  }

  const [error, setError] = useState(null);

  const getToken = () => token || localStorage.getItem("token") || null;

  const fetchAttendance = async (signal) => {
    setLoading(true);
    setError(null);
    try {
let url = "http://localhost:4000/api/student/attendance_summary";
if (localStudentId) {
  url += `?student_id=${encodeURIComponent(localStudentId)}`;
}
      if (studentId && !getToken()) {
        // include student_id only if explicitly provided and no token used
        url += `?student_id=${encodeURIComponent(studentId)}`;
      }
      const headers = {};
      const bearer = getToken();
      if (bearer) headers["Authorization"] = `Bearer ${bearer}`;

      const res = await fetch(url, { method: "GET", headers, signal });
      if (!res.ok) {
        // try to parse JSON error
        let errBody;
        try { errBody = await res.json(); } catch (e) { /* ignore */ }
        const msg = (errBody && (errBody.error || errBody.message)) || res.statusText || "Fetch error";
        throw new Error(msg);
      }
      const json = await res.json();
      setData(Array.isArray(json.attendance) ? json.attendance : []);
    } catch (err) {
      if (err.name === "AbortError") return; // fetch aborted due to unmount/poll change
      console.error("Attendance fetch failed:", err);
      setError(err.message || "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchAttendance(controller.signal);

    if (pollIntervalMs > 0) {
      const id = setInterval(() => {
        const c = new AbortController();
        fetchAttendance(c.signal);
      }, pollIntervalMs);
      return () => {
        controller.abort();
        clearInterval(id);
      };
    }

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, studentId, pollIntervalMs]); // re-run if token/id/interval changes

  // compute an overall percentage across all subjects (weighted by classes)
  const overall = (() => {
    let present = 0, total = 0;
    for (const r of data) {
      present += Number(r.present || 0);
      total += Number(r.total || 0);
    }
    return total ? Math.round((present / total) * 10000) / 100 : 0;
  })();



  async function handleSave(e) {
    e && e.preventDefault();
    setMsg(null);
    if (!studentId && !token) {
      setMsg("No student identity found (set localStorage.student_id or login).");
      return;
    }
    if (selected.size === 0) {
      setMsg("Please select at least one course.");
      return;
    }
    const payload = {
      student_id: Number(studentId),
      course_ids: Array.from(selected).map(Number)
    };

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      else if (studentId) headers["x-student-id"] = studentId;

      const res = await fetch(`${API_BASE}/course_responses`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const errMsg = body?.error || body?.message || `${res.status}`;
        setMsg(`Save failed: ${errMsg}`);
        return;
      }

      setMsg("Saved successfully.");
      await loadCourseResponses(courses);
    } catch (err) {
      console.error("handleSave error", err);
      setMsg("Network error during save (see console).");
    }
  }



  function doLogout() {
 [
    'token','prof_token','student_id','student_name','role','prof_department',
    'auth_token','accessToken'
  ].forEach(k => localStorage.removeItem(k));
  // force reload to clear UI state
  window.location.replace('/login'); // or '/' if you want
}


  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("student_id");
    localStorage.removeItem("student_name");
    localStorage.removeItem("role");
    navigate("/login");
  }

  return (
    <div className="dashboard">
      <div className="header">
        <div>
          <h1>Student Dashboard</h1>
          <div className="sub">Welcome, {studentId ?? "—"}</div>
        </div>

        <div>
          <button onClick={doLogout} className="btn">Logout</button>
        </div>
      </div>

      <div className="section">
        <h2>Available Courses</h2>
        {loading && <div>Loading...</div>}
        {msg && <div className="msg">{msg}</div>}

        <div className="controls">
          <button onClick={handleSelectAll} className="btn small">
            {selectAllChecked ? "Unselect all" : "Select all"}
          </button>
          <button onClick={handleSave} className="btn small">Save selections</button>
        </div>

        <table className="courses-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Code</th>
              <th>Title</th>
              <th>Term</th>
              <th>Seats</th>
              <th>Schedule</th>
            </tr>
          </thead>
          <tbody>
            {courses.length === 0 && !loading && (
              <tr><td colSpan={6} className="empty">No courses available.</td></tr>
            )}
            {courses.map((c) => {
              const id = Number(c.course_id ?? c.id ?? c.courseId);
              return (
                <tr key={id}>
                  <td><input type="checkbox" checked={selected.has(id)} onChange={() => toggleCourse(id)} /></td>
                  <td>{c.code ?? "-"}</td>
                  <td>{c.title ?? c.name ?? "-"}</td>
                  <td>{c.term ?? "-"}</td>
                  <td>{(c.seats_available ?? c.seats_total) ?? "-"}</td>
                  <td>{c.schedule ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <section aria-labelledby="attendance-heading" style={{ maxWidth: 920, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h2 id="attendance-heading" style={{ margin: 0, fontSize: 18 }}>Subject-wise Attendance</h2>
        <div style={{ fontSize: 14, color: "#444" }}>
          Overall: <strong>{overall}%</strong>
        </div>
      </header>

      {loading && <div style={{ padding: 12 }}>Loading attendance…</div>}

      {error && (
        <div role="alert" style={{ padding: 12, background: "#ffecec", color: "#900", borderRadius: 6 }}>
          {error}
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div style={{ padding: 12, color: "#666" }}>No attendance records found.</div>
      )}

      {!loading && !error && data.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
          {data.map((course) => {
            const percent = Number(course.percent ?? 0);
            const pctText = Number.isFinite(percent) ? percent.toFixed(2) : "0.00";
            return (
              <li key={course.course_id} style={{ padding: 12, border: "1px solid #e6e6e6", borderRadius: 8, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {course.course_code} — {course.course_title}
                    </div>
                    <div style={{ fontSize: 13, color: "#666" }}>
                      {course.present}/{course.total} present
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 80 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{pctText}%</div>
                    <div style={{ fontSize: 12, color: "#666" }}>{/* small extra if wanted */}</div>
                  </div>
                </div>

                {/* accessible progress bar */}
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percent)}
                  aria-label={`${course.course_code} attendance ${pctText} percent`}
                  style={{
                    marginTop: 10,
                    height: 12,
                    background: "#f1f1f1",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, percent))}%`,
                      height: "100%",
                      background: percent >= 75 ? "#16a34a" : percent >= 50 ? "#f59e0b" : "#ef4444",
                      transition: "width 400ms ease",
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>

      </div>

    </div>
  );
}
