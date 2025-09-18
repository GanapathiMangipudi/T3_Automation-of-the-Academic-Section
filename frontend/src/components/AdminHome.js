import React, { useEffect, useState, useRef } from 'react';
import { Link,useNavigate } from "react-router-dom";

export default function AdminHome({ apiBase = '' }) {
  const API = {
    addStudent: `${apiBase}/api/students`,
    listStudents: `${apiBase}/api/students`,
    transcripts: `${apiBase}/api/transcripts`,
    leaves: `${apiBase}/api/leave`,
    complaints: `${apiBase}/api/complaints`,
    health: `${apiBase}/health`
  };

  const [status, setStatus] = useState({ db: 'unknown', backend: 'unknown', last: 'none' });
  const [panel, setPanel] = useState({ title: 'Recent activity', subtitle: 'Summary', items: [] });
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const addStudentModalRef = useRef(null);
   const navigate = useNavigate();

  // form state
  const [studentForm, setStudentForm] = useState({ student_id: '', name: '', password: '', role: 'student' });
  const [alerts, setAlerts] = useState({ student: null });

  useEffect(() => {
    console.log('AdminHome: calling health at', API.health);
    fetch(API.health, { credentials: 'include' })
      .then(r => setStatus(s => ({ ...s, db: r.ok ? 'ok' : 'error', backend: r.ok ? 'ok' : 'error', last: 'ping' })))
      .catch((err) => {
        console.error('health fetch error', err);
        setStatus(s => ({ ...s, db: 'error', backend: 'error', last: 'ping failed' }));
      });
  }, []);

  async function fetchJsonDebug(url, opts = {}) {
    console.log('[fetchJsonDebug] requesting', url, opts);
    try {
      const res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' }, credentials: 'include' }, opts));
      console.log('[fetchJsonDebug] response status', res.status, res.statusText);
      const text = await res.text().catch(() => '');
      console.log('[fetchJsonDebug] response text (truncated):', (text || '').slice(0, 200));
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}: ${text}`);
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        return null;
      }
    } catch (err) {
      console.error('[fetchJsonDebug] fetch error:', err);
      throw err;
    }
  }

  async function loadStudents() {
    console.log('[loadStudents] start');
    setLoading(true);
    setPanel(p => ({ ...p, title: 'Students', subtitle: 'Recently added students', items: [] }));
    try {
      const data = await fetchJsonDebug(API.listStudents);
      console.log('[loadStudents] got data:', data);
      const list = Array.isArray(data) ? data : [];
      setStudents(list);
      setPanel(p => ({ ...p, items: list }));
      setStatus({ db: 'connected', backend: 'ok', last: 'Loaded students' });
    } catch (err) {
      console.error('[loadStudents] error', err);
      setPanel(p => ({ ...p, items: [], title: 'Students', subtitle: `Load failed: ${err.message}` }));
      setStatus({ db: 'connected', backend: 'error', last: 'Failed load students' });
    } finally {
      setLoading(false);
      console.log('[loadStudents] finished (loading false)');
    }
  }

  async function loadGeneric(url, title) {
    setLoading(true);
    setPanel({ title, subtitle: 'Pending', items: [] });
    try {
      const data = await fetchJsonDebug(url);
      setPanel({ title, subtitle: 'Pending', items: Array.isArray(data) ? data : [] });
      setStatus({ db: 'connected', backend: 'ok', last: `Loaded ${title}` });
    } catch (err) {
      setPanel({ title, subtitle: 'Pending', items: [] });
      setStatus({ db: 'connected', backend: 'error', last: 'Failed load' });
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function submitStudent(e) {
    e.preventDefault();
    setAlerts(a => ({ ...a, student: null }));
    try {
      await fetchJsonDebug(API.addStudent, { method: 'POST', body: JSON.stringify(studentForm) });
      setAlerts(a => ({ ...a, student: { type: 'success', msg: 'Student created successfully.' } }));
      if (addStudentModalRef.current && addStudentModalRef.current._instance) addStudentModalRef.current._instance.hide();
      setTimeout(loadStudents, 600);
    } catch (err) {
      setAlerts(a => ({ ...a, student: { type: 'danger', msg: 'Failed to create student: ' + err.message } }));
    }
  }

  function handleStudentChange(e) {
    const { name, value } = e.target;
    setStudentForm(f => ({ ...f, [name]: value }));
  }

  async function resetPassword(studentId) {
  if (!window.confirm(`Reset password for ${studentId} to default 'changeme'?`)) return;
  try {
    await fetchJsonDebug(`${API.addStudent}/${encodeURIComponent(studentId)}/reset-password`, { method: 'POST' });
    window.alert('Password reset. Student must change on next login.');
  } catch (err) {
    window.alert('Failed: ' + (err.message || err));
  }
}

async function deleteStudent(studentId) {
  if (!window.confirm(`Delete student ${studentId}? This cannot be undone.`)) return;
  try {
    await fetchJsonDebug(`${API.addStudent}/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
    window.alert('Student deleted.');
    loadStudents();
  } catch (err) {
    window.alert('Failed: ' + (err.message || err));
  }
}


  return (
    <div className="container py-4">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h3 className="mb-0">Welcome, Admin</h3>
          <div className="text-muted">Manage students, faculty, requests and complaints</div>
        </div>
        <div>
          <button 
            className="btn btn-outline-secondary btn-sm" 
            onClick={() => {
              localStorage.removeItem("token");
              window.location.href = "/login";
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-6 col-lg-3">
          <div className="card h-100">
            <div className="card-body d-flex flex-column">
              <h5 className="card-title">Manage Students</h5>
              <p className="card-text text-muted">Add or view student profiles, reset passwords, assign IDs.</p>
              <div className="mt-auto">
                <Link to="/admin/add-student" className="btn btn-primary btn-sm me-2">
                  Add Student
                </Link>
                <button className="btn btn-outline-primary btn-sm" onClick={loadStudents}>
                  View Students
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card h-100">
            <div className="card-body d-flex flex-column">
              <h5 className="card-title">Manage Professors</h5>
              <p className="card-text text-muted">Add new professors to the system.</p>
              <div className="mt-auto">
  <Link to="/admin/add-professor" className="btn btn-success btn-sm me-2">
    Add Professor
  </Link>
  <button
    className="btn btn-outline-secondary btn-sm"
    onClick={() => navigate("/admin/professors")}
  >
    View Professors
  </button>
</div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card h-100">
            <div className="card-body d-flex flex-column">
              <h5 className="card-title">View Transcript Requests</h5>
              <p className="card-text text-muted">Approve or reject transcript requests submitted by students.</p>
              <div className="mt-auto">
                <button className="btn btn-primary btn-sm" onClick={() => loadGeneric(API.transcripts, 'Transcript Requests')}>
                  Open Requests
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card h-100">
            <div className="card-body d-flex flex-column">
              <h5 className="card-title">View Leave Applications</h5>
              <p className="card-text text-muted">Approve leave applications submitted by students/faculty.</p>
              <div className="mt-auto">
                <button className="btn btn-primary btn-sm" onClick={() => loadGeneric(API.leaves, 'Leave Applications')}>
                  Open Applications
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Student list panel */}
      <div className="row g-3">
        <div className="col-lg-6">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>{panel.title}</strong>
              <small className="text-muted">{panel.subtitle}</small>
            </div>
            <div className="card-body" style={{ maxHeight: 420, overflow: 'auto' }}>
              {loading && <div className="p-3">Loading...</div>}
              {!loading && (!panel.items || panel.items.length === 0) && (
                <div className="p-3 text-muted">No items to show.</div>
              )}

              {!loading && panel.items && panel.items.length > 0 && (
                <div className="list-group list-group-flush">
                  {panel.items.slice(0, 100).map((it, idx) => (
                    <div key={idx} className="list-group-item d-flex justify-content-between align-items-start">
                      <div>
                        <div className="fw-bold">{it.name || it.student_id || it.username || it.title}</div>
                        <div className="small text-muted">
                          {it.student_id ? `ID: ${it.student_id} • role: ${it.role || 'student'}` : (it.description || '')}
                        </div>
                      </div>
                      <div>
                        {it.student_id && (
                          <>
                            <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => resetPassword(it.student_id)}>
                              Reset PW
                            </button>
                            <button className="btn btn-sm btn-outline-danger" onClick={() => deleteStudent(it.student_id)}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card mb-3">
            <div className="card-header"><strong>Quick actions</strong></div>
            <div className="card-body">
              <div className="d-grid gap-2">
                <button className="btn btn-outline-secondary" onClick={() => {
                  const t = panel.title;
                  if (t.includes('Students')) loadStudents();
                  else if (t.includes('Transcript')) loadGeneric(API.transcripts, 'Transcript Requests');
                  else if (t.includes('Leave')) loadGeneric(API.leaves, 'Leave Applications');
                  else if (t.includes('Complaints')) loadGeneric(API.complaints, 'Complaints');
                }}>Refresh Lists</button>
                <button className="btn btn-outline-danger" onClick={() => setStatus({ db: 'ok', backend: 'ok', last: 'Cache cleared (dev)' })}>
                  Clear Cache (dev)
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><strong>Status</strong></div>
            <div className="card-body">
              <ul className="list-unstyled mb-0">
                <li><strong>DB:</strong> {status.db}</li>
                <li><strong>Backend:</strong> {status.backend}</li>
                <li><strong>Last action:</strong> {status.last}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Add Student Modal */}
      <div className="modal fade" id="addStudentModal" tabIndex="-1" aria-labelledby="addStudentLabel" aria-hidden="true" ref={addStudentModalRef}>
        <div className="modal-dialog modal-dialog-centered">
          <form className="modal-content" onSubmit={submitStudent}>
            <div className="modal-header">
              <h5 className="modal-title" id="addStudentLabel">Add Student</h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              {alerts.student && <div className={`alert alert-${alerts.student.type}`}>{alerts.student.msg}</div>}
              <div className="mb-3">
                <label className="form-label">Student ID (username)</label>
                <input className="form-control" name="student_id" value={studentForm.student_id} onChange={handleStudentChange} required />
              </div>
              <div className="mb-3">
                <label className="form-label">Full name</label>
                <input className="form-control" name="name" value={studentForm.name} onChange={handleStudentChange} required />
              </div>
              <div className="mb-3">
                <label className="form-label">Temporary password</label>
                <input className="form-control" type="password" name="password" value={studentForm.password} onChange={handleStudentChange} required minLength={6} />
                <div className="form-text">Student should change password after first login.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" className="btn btn-primary">Create Student</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
