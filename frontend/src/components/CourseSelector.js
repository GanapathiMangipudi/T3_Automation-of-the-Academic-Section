// frontend/src/components/CourseSelector.js
import React, { useEffect, useState } from 'react';

const SUBJECT_COLUMNS = ['cs101','cs102','ee101'];
const SUBJECT_MAP = {
  cs101: { code: 'CS101', label: 'Introduction to Programming' },
  cs102: { code: 'CS102', label: 'Data Structures' },
  ee101: { code: 'EE101', label: 'Basic Circuits' },
};

// mapping between your static subject keys and DB course_id values
const SUBJECT_TO_COURSE_ID = {
  cs101: 1, // CS101 -> course_id 1
  cs102: 2, // CS102 -> course_id 2
  ee101: 5 // EE101 -> course_id 5
};

// inverse mapping for quick lookup: course_id -> subject key
const COURSE_ID_TO_SUBJECT = Object.entries(SUBJECT_TO_COURSE_ID)
  .reduce((acc, [key, id]) => { acc[id] = key; return acc; }, {});

export default function CourseSelector({ studentId }) {
  const [selected, setSelected] = useState(() => {
    const m = {}; SUBJECT_COLUMNS.forEach(s => (m[s] = false)); return m;
  });
  const [selectAll, setSelectAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // Fetch student's saved responses and apply to `selected`
  useEffect(() => {
    if (!studentId) return;

    async function fetchResponses() {
      setLoading(true);
      setMsg(null);
      try {
        const res = await fetch('http://localhost:4000/api/course_responses', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-student-id': String(studentId) // sends header so server middleware can pick it up
          }
        });

        if (!res.ok) {
          // don't treat 401/403 as fatal here; simply leave defaults
          console.warn('Failed to fetch responses:', res.status);
          setLoading(false);
          return;
        }

        const body = await res.json();
        // expecting { data: [ { course_id: 1, ... }, ... ] }
        const rows = Array.isArray(body.data) ? body.data : [];
        const next = {};
        SUBJECT_COLUMNS.forEach(s => next[s] = false);
        rows.forEach(r => {
          const courseId = Number(r.course_id || r.course_id); // defensive
          const subj = COURSE_ID_TO_SUBJECT[courseId];
          if (subj) next[subj] = true;
        });
        setSelected(next);
        setSelectAll(SUBJECT_COLUMNS.every(s => next[s]));
      } catch (err) {
        console.error('Error fetching course_responses', err);
        setMsg({ type: 'error', text: 'Failed to load saved selections' });
      } finally {
        setLoading(false);
      }
    }

    fetchResponses();
  }, [studentId]);

  function toggleSubject(k) {
    setSelected(prev => {
      const next = { ...prev, [k]: !prev[k] };
      setSelectAll(SUBJECT_COLUMNS.every(s => next[s]));
      return next;
    });
  }

  function toggleSelectAll() {
    const n = !selectAll;
    const next = {}; SUBJECT_COLUMNS.forEach(s => (next[s] = n));
    setSelected(next); setSelectAll(n);
  }

  function buildPayload() {
    // Build the courseIds array based on the DB course_id mapping
    const courseIds = [];
    if (selected.cs101) courseIds.push(SUBJECT_TO_COURSE_ID.cs101);
    if (selected.cs102) courseIds.push(SUBJECT_TO_COURSE_ID.cs102);
    if (selected.ee101) courseIds.push(SUBJECT_TO_COURSE_ID.ee101);

    return { student_id: Number(studentId), courseIds };
  }

  async function handleSaveAll() {
    setMsg(null);
    if (!studentId) { setMsg({type:'error',text:'Missing studentId'}); return; }
    setLoading(true);

    const payload = buildPayload();
    console.log('Saving payload ->', payload);

    try {
      const res = await fetch('http://localhost:4000/api/course_responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }

      // POST route returns { success: true, enrolledCount } in your router
      const body = await res.json();
      setMsg({type:'success', text:'Saved'});

      // Refresh server state so UI reflects persisted rows
      // (this will call GET /course_responses and set selected accordingly)
      try {
        const r2 = await fetch('http://localhost:4000/api/course_responses', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'x-student-id': String(studentId) }
        });
        if (r2.ok) {
          const b2 = await r2.json();
          const rows = Array.isArray(b2.data) ? b2.data : [];
          const next = {};
          SUBJECT_COLUMNS.forEach(s => next[s] = false);
          rows.forEach(r => {
            const courseId = Number(r.course_id);
            const subj = COURSE_ID_TO_SUBJECT[courseId];
            if (subj) next[subj] = true;
          });
          setSelected(next);
          setSelectAll(SUBJECT_COLUMNS.every(s => next[s]));
        }
      } catch (err) {
        // ignore refresh error, we already reported save success
        console.warn('Failed to refresh responses after save', err);
      }

    } catch (err) {
      setMsg({type:'error', text: 'Save failed: ' + err.message});
    } finally { setLoading(false); }
  }

  return (
    <div className="card p-3">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h5 className="mb-0">Available Courses</h5>
        <div className="d-flex align-items-center">
          <div className="form-check form-switch me-3">
            <input className="form-check-input" type="checkbox" checked={selectAll} onChange={toggleSelectAll} />
            <label className="form-check-label">Select All</label>
          </div>
          <button className="btn btn-success" onClick={handleSaveAll} disabled={loading}>
            {loading ? 'Saving…' : 'Save All'}
          </button>
        </div>
      </div>

      <div className="list-group">
        {SUBJECT_COLUMNS.map(k => (
          <label key={k} className="list-group-item d-flex justify-content-between align-items-center">
            <div>
              <input type="checkbox" className="form-check-input me-2" checked={selected[k]} onChange={() => toggleSubject(k)} />
              <strong>{SUBJECT_MAP[k].code}</strong> — {SUBJECT_MAP[k].label}
            </div>
            <div>
              {selected[k] ? <span className="badge bg-primary">Enrolled</span> : <span className="badge bg-secondary">Not enrolled</span>}
            </div>
          </label>
        ))}
      </div>

      {msg && <div className={`mt-3 alert ${msg.type === 'error' ? 'alert-danger' : 'alert-success'}`}>{msg.text}</div>}
    </div>
  );
}
