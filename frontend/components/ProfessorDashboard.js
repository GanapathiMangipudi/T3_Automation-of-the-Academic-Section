/* eslint-disable react-hooks/exhaustive-deps */
// src/components/ProfessorDashboard.jsx

import React, { useEffect, useState } from "react";

/**
 * ProfessorDashboard with integrated Attendance UI
 *
 * - Normalizes backend enrollments into grouped courses (same logic from before)
 * - Attendance panel lives on same page; uses endpoints:
 *    GET  /api/professors/attendance?course_id=...&date=YYYY-MM-DD
 *    POST /api/professors/attendance   { course_id, student_id, date, status }
 *
 * Make sure your backend implements those endpoints and that the professor token
 * is in localStorage (prof_token or token).
 */

export default function ProfessorDashboard() {
  const [coursesData, setCoursesData] = useState(null);
  const [msg, setMsg] = useState("");
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState("");
  const [department, setDepartment] = useState("");

  // Attendance UI state:
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10)); // YYYY-MM-DD
  const [attendanceRows, setAttendanceRows] = useState([]); // rows returned by attendance endpoint
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // NEW: which course is open inline on the left column (toggles compact -> expanded)
  const [openAttendanceCourseId, setOpenAttendanceCourseId] = useState(null);

  const API_ORIGIN = process.env.REACT_APP_API_ORIGIN || "http://localhost:4000";
  const ENROLLMENTS_URL = `${API_ORIGIN}/api/professors/enrollments`;
  const ATTENDANCE_GET_URL = `${API_ORIGIN}/api/professors/attendance`;
  const ATTENDANCE_POST_URL = `${API_ORIGIN}/api/professors/attendance`;

  // ----------------- helper: group flat rows into courses -----------------
  function groupRowsToCourses(rows) {
    const map = {};
    for (const r of rows) {
      const cid = r.course_id ?? r.courseId;
      const code = r.course_code ?? r.code;
      const title = r.course_title ?? r.title;
      if (!map[cid]) {
        map[cid] = { course_id: cid, course_code: code, course_title: title, students: [] };
      }
      map[cid].students.push({
        course_response_id: r.course_response_id ?? r.cr_id ?? r.id,
        student_id: r.student_id ?? r.studentId,
        student_roll: r.student_roll ?? r.student_id ?? r.studentRoll,
        student_name: r.student_name ?? r.name ?? r.studentName,
        email: r.email ?? null,
        selected_at: r.selected_at ?? r.selectedAt ?? null,
      });
    }
    return Object.values(map).map(c => ({ ...c, student_count: c.students.length }));
  }

  function normalizeResponse(body) {
    if (!body) return [];
    if (Array.isArray(body.courses)) {
      return body.courses.map(c => ({ ...c, students: c.students || [], student_count: (c.students && c.students.length) || c.student_count || 0 }));
    }
    if (Array.isArray(body.enrollments) && (body.ok !== undefined || body.by !== undefined)) {
      const first = body.enrollments[0];
      if (!first) return [];
      if (Array.isArray(first.students)) return body.enrollments.map(c => ({ ...c, student_count: c.students.length }));
      return groupRowsToCourses(body.enrollments);
    }
    if (Array.isArray(body)) {
      if (body.length === 0) return [];
      const first = body[0];
      if (first && Array.isArray(first.students)) return body.map(c => ({ ...c, student_count: c.students.length }));
      return groupRowsToCourses(body);
    }
    if (Array.isArray(body.data)) return groupRowsToCourses(body.data);
    return [];
  }

  // ----------------- load enrollments (courses list) -----------------
  const [coursesError, setCoursesError] = useState(null); // show load error

  async function loadEnrollments() {
    setLoading(true);
    setMsg("");
    setRaw(null);
    setCoursesError(null);

    const profToken = localStorage.getItem("prof_token");
    const token = profToken || localStorage.getItem("token");
    console.log('[loadEnrollments] token present?', !!token);

    if (!token) {
      setMsg("No token found in localStorage (prof_token or token). Please login as professor.");
      setCoursesData([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(ENROLLMENTS_URL, {
        method: 'GET',
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const text = await res.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch (e) {
        console.warn('[loadEnrollments] non-JSON response', text);
      }

      console.log('[loadEnrollments] status', res.status, 'body', body);
      setRaw(body ?? text);

      if (!res.ok) {
        const serverMsg = body?.error || body?.message || `Server returned ${res.status}`;
        setMsg(`Failed to load enrollments: ${serverMsg}`);
        setCoursesData([]);
        setLoading(false);
        setCoursesError(serverMsg);
        return;
      }

      const courses = normalizeResponse(body);
      console.log('[loadEnrollments] normalized courses count ->', courses.length, courses);
      setCoursesData(courses);

      if (courses && courses.length > 0) {
        const first = courses[0];
        setSelectedCourseId(first.course_id);
        const today = new Date().toISOString().slice(0,10);
        setAttendanceDate(today);
      } else {
        setAttendanceRows([]);
      }

    } catch (err) {
      console.error('[loadEnrollments] error ->', err);
      setMsg('Network error while loading enrollments.');
      setCoursesData([]);
      setCoursesError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEnrollments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------------------------
  // Helpers
  // --------------------------------------------------

  function normalizeRow(r = {}) {
    return {
      student_id: r.student_id ?? r.studentId ?? (r.student && r.student.id) ?? null,
      student_name: r.student_name ?? r.name ?? (r.student && r.student.name) ?? "",
      status: r.status ?? null,
      marked_at: r.marked_at ?? r.markedAt ?? null,
      editable: typeof r.editable === "boolean" ? r.editable : true,
      _saving: false
    };
  }

  function buildRowsFromCourse(courseId) {
    if (!courseId) return [];
    const cid = Number(courseId);
    if (!Array.isArray(coursesData)) return [];
    const course = coursesData.find(c => Number(c.course_id) === cid);
    if (!course) return [];

    return (course.students || []).map(s => ({
      student_id: s.student_id ?? s.studentId ?? s.student_roll ?? null,
      student_name: s.student_name ?? s.name ?? s.studentName ?? "",
      status: null,
      marked_at: null,
      editable: true,
      _saving: false
    }));
  }

  // ----------------- Attendance: fetch rows for selectedCourseId + date -----------------
  async function fetchAttendance(courseId, date) {
    const cid = courseId ?? selectedCourseId;
    const dt = date ?? attendanceDate;

    if (!cid || !dt) {
      console.warn('[fetchAttendance] missing course or date', { cid, dt });
      setAttendanceRows([]);
      return;
    }

    setAttendanceLoading(true);
    try {
      const token = localStorage.getItem('prof_token') || localStorage.getItem('token');
      const q = `${API_ORIGIN}/api/professors/attendance?course_id=${encodeURIComponent(cid)}&date=${encodeURIComponent(dt)}`;
      const res = await fetch(q, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => null);

      console.log('[fetchAttendance] response', res.status, body);

      if (!res.ok) {
        console.warn('fetchAttendance failed', body);
        const fallback = buildRowsFromCourse(cid);
        setAttendanceRows(fallback);
        return;
      }

      const rows = body?.rows || [];
      if (Array.isArray(rows) && rows.length > 0) {
        setAttendanceRows(rows.map(normalizeRow));
      } else {
        const fallback = buildRowsFromCourse(cid);
        setAttendanceRows(fallback);
      }
    } catch (err) {
      console.error('fetchAttendance error', err);
      const fallback = buildRowsFromCourse(cid);
      setAttendanceRows(fallback);
    } finally {
      setAttendanceLoading(false);
    }
  }

  useEffect(() => {
    if (selectedCourseId && attendanceDate) {
      fetchAttendance(selectedCourseId, attendanceDate);
    }
  }, [selectedCourseId, attendanceDate]);

  // ----------------- Attendance: mark a student -----------------
  async function markAttendance(student_id, status) {
    const token = localStorage.getItem("prof_token") || localStorage.getItem("token");
    if (!token) { alert("Login required"); return; }
    if (!selectedCourseId) { alert("Select a course"); return; }
    if (!attendanceDate) { alert("Select a date"); return; }

    const strId = String(student_id);

    // optimistic UI: set _saving and temporary status in attendanceRows
    setAttendanceRows(prev => {
      const found = (prev || []).some(r => String(r.student_id) === strId);
      const existingName = (prev || []).find(r => String(r.student_id) === strId)?.student_name ?? "";
      const optimisticRow = {
        student_id,
        student_name: existingName,
        status,
        marked_at: new Date().toISOString(),
        editable: true,
        _saving: true
      };
      if (found) {
        return (prev || []).map(r => (String(r.student_id) === strId ? { ...r, ...optimisticRow } : r));
      } else {
        return [...(prev || []), optimisticRow];
      }
    });

    try {
      const payload = { course_id: selectedCourseId, student_id, status, date: attendanceDate };
      console.log('[markAttendance] POST', ATTENDANCE_POST_URL, payload);

      const res = await fetch(ATTENDANCE_POST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => null);
      console.log('[markAttendance] response', res.status, body);

      if (!res.ok) {
        const serverMsg = body?.error || body?.message || res.statusText || `HTTP ${res.status}`;
        alert("Mark failed: " + serverMsg);
        // clear saving flag for that student
        setAttendanceRows(prev => (prev || []).map(r => (String(r.student_id) === strId ? { ...r, _saving: false } : r)));
        return;
      }

      // server should return the created/updated record
      const updated = body?.record || body?.row || body?.attendance || body || null;

      if (updated && (updated.student_id || updated.studentId || updated.student)) {
        const merged = {
          student_id: updated.student_id ?? updated.studentId ?? (updated.student && updated.student.id) ?? student_id,
          student_name: updated.student_name ?? updated.studentName ?? (updated.student && updated.student.name) ?? (attendanceRows.find(r => String(r.student_id) === strId)?.student_name ?? ""),
          status: updated.status ?? status,
          marked_at: updated.marked_at ?? updated.markedAt ?? new Date().toISOString(),
          editable: true,
          _saving: false,
          id: updated.id ?? updated.attendance_id ?? null
        };
        setAttendanceRows(prev => (prev || []).map(r => (String(r.student_id) === String(merged.student_id) ? { ...r, ...merged } : r)));
      } else {
        // No record information returned: unset _saving
        setAttendanceRows(prev => (prev || []).map(r => (String(r.student_id) === strId ? { ...r, _saving: false } : r)));
      }
    } catch (err) {
      console.error("markAttendance error:", err);
      alert("Network error while marking attendance");
      setAttendanceRows(prev => (prev || []).map(r => (String(r.student_id) === strId ? { ...r, _saving: false } : r)));
    }
  }

  // ----------------- logout -----------------
  function handleLogout() {
    const profToken = localStorage.getItem("prof_token") || localStorage.getItem("token");
    if (profToken) {
      try {
        fetch(`${API_ORIGIN}/api/logout`, { method: "POST", headers: { Authorization: `Bearer ${profToken}` }}).catch(()=>{});
      } catch (e) {}
    }
    const keys = ["prof_token", "token", "student_id", "student_name", "role"];
    keys.forEach(k => localStorage.removeItem(k));
    window.location.href = "/login";
  }

  function fmtDate(dt) {
    if (!dt) return "-";
    try {
      const d = new Date(dt);
      if (Number.isNaN(d.getTime())) return dt;
      return d.toLocaleString();
    } catch (e) {
      return dt;
    }
  }


  // ----------------- render -----------------
  // ----------------- render -----------------
return (
  <div className="container mt-4">
    <div className="d-flex justify-content-between align-items-start mb-3">
      <div>
        <h2 className="mb-1">Professor Dashboard</h2>
        <div className="text-muted">
          Welcome, {username || "Professor"}{" "}
          {department && <small className="text-muted">({department})</small>}
        </div>
      </div>

      <div className="text-end">
        <button className="btn btn-outline-secondary me-2" onClick={loadEnrollments} disabled={loading}>
          {loading ? "Loading..." : "Refresh Courses"}
        </button>
        <button className="btn btn-outline-danger" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>

    <div className="row">
      {/* Left: Courses & Enrollments */}
      <div className="col-lg-6 mb-4">
        <div className="card shadow-sm h-100">
          <div className="card-header">
            <strong>Courses & Enrollments</strong>
            <div className="small text-muted">{/* optional subtitle */}</div>
          </div>
          <div className="card-body">
            {coursesData === null ? (
              <div>Loading courses…</div>
            ) : coursesData.length === 0 ? (
              <div>No courses found.</div>
            ) : (
              coursesData.map((c) => (
                <div key={c.course_id} className="mb-4 pb-2 border-bottom">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <div>
                      <h5 className="mb-0">{c.course_code} — {c.course_title}</h5>
                      <div className="small text-muted">{c.student_count || 0} students</div>
                    </div>
                    <div>
                      <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => {
                          const today = new Date().toISOString().slice(0,10);
                          setSelectedCourseId(c.course_id);
                          setAttendanceDate(today);
                          fetchAttendance(c.course_id, today);
                          setOpenAttendanceCourseId(prev => prev === c.course_id ? null : c.course_id);
                        }}
                      >
                        {openAttendanceCourseId === c.course_id ? "Close attendance" : "Open attendance"}
                      </button>
                    </div>
                  </div>

                  {/* Expanded view: actions */}
                  {openAttendanceCourseId === c.course_id ? (
                    <div className="table-responsive mt-2">
                      <table className="table table-sm table-bordered mb-0">
                        <thead className="table-light">
                          <tr>
                            <th style={{width:120}}>ID</th>
                            <th>Name</th>
                            <th style={{width:220}}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(c.students || []).map(s => {
                            const sid = s.student_id ?? s.student_roll;
                            const sname = s.student_name ?? s.name ?? "";
                            const serverRow = (attendanceRows || []).find(r => String(r.student_id) === String(sid));
                            const saving = serverRow ? serverRow._saving : false;
                            const status = serverRow ? serverRow.status : null;

                            return (
                              <tr key={sid}>
                                <td className="align-middle">{s.student_roll ?? sid}</td>
                                <td className="align-middle">{sname}</td>
                                <td>
                                  <button
                                    className="btn btn-sm btn-success me-2"
                                    onClick={() => markAttendance(sid, 'present')}
                                    disabled={saving}
                                  >
                                    {saving && status === 'present' ? 'Saving...' : 'Present'}
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => markAttendance(sid, 'absent')}
                                    disabled={saving}
                                  >
                                    {saving && status === 'absent' ? 'Saving...' : 'Absent'}
                                  </button>
                                  {status && <small className="ms-3 text-muted">{status}</small>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="table-responsive mt-2">
                      <table className="table table-sm mb-0">
                        <thead className="table-light">
                          <tr>
                            <th style={{width:120}}>ID</th>
                            <th>Name</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(c.students || []).map(s => (
                            <tr key={s.student_id ?? s.student_roll}>
                              <td className="align-middle">{s.student_roll ?? s.student_id}</td>
                              <td className="align-middle">{s.student_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right: Attendance Report */}
      <div className="col-lg-6 mb-4">
        <div className="card shadow-sm h-100">
          <div className="card-header">
            <strong>Attendance</strong>
          </div>

          <div className="card-body">
            <div className="row g-2 mb-3">
              <div className="col">
                <select
                  className="form-select"
                  value={selectedCourseId ?? ""}
                  onChange={(e) => setSelectedCourseId(Number(e.target.value) || null)}
                >
                  <option value="">-- select course --</option>
                  {(coursesData || []).map(c => (
                    <option key={c.course_id} value={c.course_id}>{c.course_code} — {c.course_title}</option>
                  ))}
                </select>
              </div>
              <div className="col-auto">
                <input
                  type="date"
                  className="form-control"
                  value={attendanceDate}
                  onChange={e => setAttendanceDate(e.target.value)}
                />
              </div>
              <div className="col-auto">
                <button className="btn btn-primary" onClick={() => fetchAttendance(selectedCourseId, attendanceDate)}>
                  Load
                </button>
              </div>
            </div>

            {attendanceLoading ? (
              <div>Loading attendance…</div>
            ) : (
              <>
                {attendanceRows.length === 0 ? (
                  <div>No students (or no attendance rows)</div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-striped table-bordered table-hover mb-0">
                      <thead className="table-dark">
                        <tr>
                          <th>Student ID</th>
                          <th>Name</th>
                          <th>Marked At</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceRows.map(r => (
                          <tr key={r.student_id}>
                            <td className="align-middle">{r.student_id}</td>
                            <td className="align-middle">{r.student_name}</td>
                            <td className="align-middle">{r.marked_at ? fmtDate(r.marked_at) : "-"}</td>
                            <td className="align-middle">
                              <span className={`badge ${r.status === 'present' ? 'bg-success' : 'bg-danger'}`}>
                                {r.status || "-"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            <div className="mt-3 small text-muted">
              <div>Note: Attendance is editable for 30 minutes after marking.</div>
              <div>If you need a persistent lock earlier/later, modify the server MS_30_MIN value.</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="mt-3">
      <details>
        <summary>Raw debug</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify({ raw, attendanceRows }, null, 2)}</pre>
      </details>
    </div>
  </div>
);
}