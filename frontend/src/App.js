// src/App.js
import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate,useNavigate } from "react-router-dom";
import Auth from "./auth";
import AdminHome from "./components/AdminHome";
import AdminLogin from "./components/AdminLogin";
import AdminAddStudentPage from "./components/AdminAddStudentPage";
import ViewStudents from "./components/ViewStudents";
import ProfessorSignup from "./components/ProfessorSignup";
import AdminViewProfessorsPage from "./components/AdminViewProfessorsPage";
import StudentDashboard from "./components/StudentDashboard";
import ProfessorLogin from './components/ProfessorLogin';
import ProfessorDashboard from './components/ProfessorDashboard'; 
import AssignmentUI from "./components/AssignmentUI";

// Base URLs
// For /api/* routes
const API_BASE = process.env.REACT_APP_API || "http://localhost:4000/api";
// For root-level routes like /auth, /admin
const ROOT_API_BASE = process.env.REACT_APP_ROOT_API || "http://localhost:4000";

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

export default function App() {
  console.log(
    "Auth debug → token:",
    localStorage.getItem("token"),
    "student_id:",
    localStorage.getItem("student_id")
  );

  const [courses, setCourses] = useState([]);
  const [selected, setSelected] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectAllChecked, setSelectAllChecked] = useState(false);
  const navigate = useNavigate();

  const [auth, setAuth] = useState({
    token: localStorage.getItem("token"),
    studentId: Number(localStorage.getItem("student_id") || 0),
    name: localStorage.getItem("student_name") || "",
    role: localStorage.getItem("role") || "student",
  });

  function getToken() {
    return localStorage.getItem("token") || null;
  }
  function authHeaders() {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

 function handleLogin(payload = {}) {
  // payload may contain different field names depending on backend:
  // - token
  // - id (internal PK)
  // - studentId or student_id (sometimes used for roll number, sometimes for PK)
  // - studentRoll or roll_number (explicit roll number)
  // - name, role

  const {
    token,
    id,
    studentId,
    student_id,
    studentRoll,
    roll_number,
    name,
    role,
  } = payload;

  // 1) save token
  if (token) localStorage.setItem("token", token);

  // 2) choose what to store as student_id in localStorage (we want the roll number)
  // Preference order:
  //  - explicit studentRoll or roll_number
  //  - student_id (some APIs use this name for roll)
  //  - studentId if it *looks like* a roll number (>= 100000 or string of 5+ digits)
  //  - id as a last resort (internal PK)
  let rollCandidate = null;

  if (studentRoll) rollCandidate = String(studentRoll);
  else if (roll_number) rollCandidate = String(roll_number);
  else if (student_id) rollCandidate = String(student_id);
  else if (studentId) {
    const n = Number(studentId);
    if (!Number.isNaN(n) && (n >= 100000 || String(studentId).length >= 5)) {
      rollCandidate = String(studentId);
    } else {
      // keep it but prefer checking id below
      rollCandidate = String(studentId);
    }
  } else if (id) {
    // last resort: internal PK
    rollCandidate = String(id);
  }

  if (rollCandidate !== null) {
    localStorage.setItem("student_id", rollCandidate);
  } else {
    // ensure we don't keep stale value if nothing provided
    localStorage.removeItem("student_id");
  }

  // 3) other fields
  if (name) localStorage.setItem("student_name", name);
  if (role) localStorage.setItem("role", role);

  // 4) update local auth state
  setAuth({
    token: localStorage.getItem("token"),
    studentId: Number(localStorage.getItem("student_id") || 0),
    name: localStorage.getItem("student_name") || "",
    role: localStorage.getItem("role") || "student",
  });
}


  function handleLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("student_id");
  localStorage.removeItem("student_name");
  localStorage.removeItem("role");
  navigate("/");   // ✅ go to homepage instead of login
}


/*
  fetchCourseResponses accepts optional `coursesList` to compute selectAllChecked reliably.
  If coursesList is omitted it will use the current `courses` state.
*/
async function fetchCourseResponses(coursesList = null) {
  try {
    // prefer JWT token, fall back to student_id header if no token
    const token = getToken(); // keep your helper
    const studentId = localStorage.getItem('student_id');

    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (studentId) headers['x-student-id'] = studentId;

    // Try the most likely GET endpoints. Some backends return /course_responses/my
    const tryPaths = [
      `${API_BASE}/course_responses/my`,
      `${API_BASE}/course_responses`,
      `${API_BASE}/course_responses?student_id=${studentId}`,
      `/course_responses` // alternate mount
    ];

    let body = null;
    let ok = false;

    for (const p of tryPaths) {
      try {
        const r = await fetch(p, { headers, cache: 'no-store' });
        if (!r.ok) {
          // try next; but if 401/403 maybe token issue — still try others
          continue;
        }
        body = await r.json().catch(() => null);
        ok = true;
        break;
      } catch (err) {
        // network error for this path — continue trying others
        continue;
      }
    }

    if (!ok || !body) {
      // nothing found — clear selections
      setSelected(new Set());
      setSelectAllChecked(false);
      console.warn('fetchCourseResponses: no responses endpoint succeeded');
      return;
    }

    console.log("fetchCourseResponses server response:", body);

    // body may be { data: [...] } or { responses: [...] } or plain [...]
    const rows =
      (Array.isArray(body.data) && body.data) ||
      (Array.isArray(body.responses) && body.responses) ||
      (Array.isArray(body) && body) ||
      [];

    // convert to a Set of numeric course_ids
    const sel = new Set();
    for (const r of rows) {
      const id = Number(r.course_id ?? r.courseId ?? r.id);
      if (!Number.isNaN(id) && id > 0) sel.add(id);
    }

    setSelected(sel);

    // determine select-all state using provided coursesList or current courses state
    const list = Array.isArray(coursesList) ? coursesList : courses;
    if (!Array.isArray(list) || list.length === 0) {
      setSelectAllChecked(false);
    } else {
      // count only those courses that have numeric ids
      const courseIds = list.map(c => Number(c.course_id ?? c.id ?? c.courseId)).filter(Boolean);
      const allSelected = courseIds.length > 0 && courseIds.every(id => sel.has(id));
      setSelectAllChecked(Boolean(allSelected));
    }

  } catch (e) {
    console.error("fetchCourseResponses error", e);
    // best-effort fallback
    setSelected(new Set());
    setSelectAllChecked(false);
  }
}

  function toggle(courseId) {
    setSelected((prev) => {
      const copy = { ...prev };
      if (copy[courseId]) delete copy[courseId];
      else copy[courseId] = true;
      const totalSelected = Object.keys(copy).length;
      setSelectAllChecked(totalSelected > 0 && totalSelected === courses.length);
      return copy;
    });
  }

  function handleSelectAll() {
    if (selectAllChecked) {
      setSelected({});
      setSelectAllChecked(false);
    } else {
      const map = {};
      courses.forEach((c) => (map[c.id] = true));
      setSelected(map);
      setSelectAllChecked(true);
    }
  }

  async function saveAll() {
    setSaving(true);
    setMessage(null);
    try {
      if (!auth.token) {
        setMessage({ type: "danger", text: "Not authenticated — please log in." });
        setSaving(false);
        return;
      }

      const courseIds = Object.keys(selected).map((k) => Number(k));
      if (courseIds.length === 0) {
        setMessage({ type: "danger", text: "No courses selected to save." });
        setSaving(false);
        return;
      }

      const res = await fetch(`${API_BASE}/course_responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ courseIds }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(
          (body && (body.details || body.error)) || `Server ${res.status}`
        );

      setMessage({
        type: "success",
        text: `Saved ${body.enrolledCount ?? courseIds.length} selections.`,
      });
      await fetchCourseResponses();
    } catch (err) {
      console.error("saveAll error", err);
      setMessage({ type: "danger", text: "Save failed: " + (err.message || err) });
    } finally {
      setSaving(false);
    }
  }

  const isSelected = (courseId) => !!selected[courseId];

  function RequireAuth({ children }) {
    if (!auth.token) return <Navigate to="/" replace />;
    return children;
  }
  function RequireAdmin({ children }) {
    if (!auth.token) return <Navigate to="/" replace />;
    if (auth.role !== "admin") return <Navigate to="/" replace />;
    return children;
  }

  function StudentDashboardView({ auth: authProp, handleLogout }) {
    const auth = authProp; // safe alias so the function body can continue to use `auth`
  const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState(null);

    useEffect(() => {
      async function fetchStudents() {
        try {
          const res = await fetch(`${API_BASE}/students`);
          if (!res.ok) throw new Error("Failed to load students");
          const data = await res.json();
          setStudents(data);
        } catch (err) {
          console.error("Fetch students failed:", err);
          setMessage({ type: "danger", text: err.message });
        } finally {
          setLoading(false);
        }
      }
      fetchStudents();
    }, []);

    return (
      <div className="container py-4">
        {/* Dashboard UI */}
      </div>
    );
  }

  // Routes
  return (
    <Routes>
      {/* Public / login routes */}
      <Route
        path="/admin-login"
        element={
          !auth.token ? <AdminLogin onLogin={handleLogin} /> : <Navigate to="/" replace />
        }
      />

      <Route
        path="/"
        element={
          !auth.token ? (
            <Auth onLogin={handleLogin} />
          ) : auth.role === "admin" ? (
            <Navigate to="/admin" replace />
          ) : (
            <StudentDashboard auth={auth} handleLogout={handleLogout} />
          )
        }
      />

      {/* Admin routes (guarded) */}
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminHome apiBase={ROOT_API_BASE} onLogout={handleLogout} />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/add-student"
        element={
          <RequireAdmin>
            <AdminAddStudentPage apiBase={ROOT_API_BASE} />
          </RequireAdmin>
        }
      />

      <Route
        path="/admin/students"
        element={
          <RequireAdmin>
            <ViewStudents apiBase={ROOT_API_BASE} />
          </RequireAdmin>
        }
      />

      <Route
        path="/admin/add-professor"
        element={
          <RequireAdmin>
            <ProfessorSignup apiBase={ROOT_API_BASE} />
          </RequireAdmin>
        }
      /> 

      <Route path="/admin/professors" element={<AdminViewProfessorsPage />} />

      {/* Fallback */}
      <Route
        path="*"
        element={<Navigate to={auth.token ? "/" : "/"} replace />}
      />

      <Route path="/professor-login" element={<ProfessorLogin/>} />
<Route path="/professor-dashboard" element={<ProfessorDashboard/>} />



    </Routes>
  );
}
