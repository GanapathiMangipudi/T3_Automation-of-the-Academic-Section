import React, { useEffect, useState } from "react";

// top of file
async function apiFetch(path, { method = 'GET', body = null, headers = {}, signal } = {}) {
  const token = window.localStorage.getItem('token') || window.localStorage.getItem('prof_token') || '';
  const baseHeaders = { 'Content-Type': 'application/json', ...headers };
  if (token) baseHeaders.Authorization = 'Bearer ' + token;

  const res = await fetch(path, {
    method,
    headers: baseHeaders,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data?.error || ('HTTP ' + res.status));
    err.details = data;
    err.status = res.status;
    throw err;
  }
  return data;
}


const fmtDate = (iso) => new Date(iso).toLocaleString();

// dummy data generator (kept as original content)
const sampleAssignments = () => [
  {
    id: 1,
    title: "NAND and NOR gates",
    course: "EE101",
    due_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(),
    published: true,
    description:
      "Problems on vector spaces, eigenvalues. Submit PDF. Maximum marks: 25.",
  },
  {
    id: 2,
    title: "Assignment 2 — Data Structures",
    course: "CS201",
    due_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString(),
    published: false,
    description: "Implement linked list, stack and queue operations. Maximum marks: 30.",
  },
  {
    id: 3,
    title: "Quiz — Probability",
    course: "ST102",
    due_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    published: true,
    description: "Online quiz. Auto-graded multiple choice questions.",
  },
];

// --- Compact component: for embedding in ProfessorDashboard ----------------
export function AssignmentCompact({ onOpenFull = () => {} }) {
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
  let mounted = true;
  const ac = new AbortController();

  async function load() {
    try {
      // try real API; adjust query params as needed
const data = await apiFetch('http://localhost:4000/api/professors/assignments', { signal: ac.signal });
      if (!mounted) return;
      // if backend returns an array directly:
      if (Array.isArray(data)) setAssignments(data);
      // some APIs return { assignments: [...] }
      else if (Array.isArray(data.assignments)) setAssignments(data.assignments);
      else setAssignments(Array.isArray(data) ? data : sampleAssignments());
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Load assignments failed, using sample data', err);
      if (mounted) setAssignments(sampleAssignments());
    }
  }

  load();
  return () => { mounted = false; ac.abort(); };
}, []);


  return (
    <div className="bg-white rounded-2xl shadow-sm p-3 md:p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm md:text-base font-semibold">Assignments</h3>
          <p className="text-xs text-slate-500">Recent / upcoming</p>
        </div>
        <div>
          <button
            onClick={onOpenFull}
            className="text-xs px-2 py-1 rounded-md border hover:bg-slate-50"
          >
            View all
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {assignments.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50"
          >
            <div>
              <div className="text-sm font-medium">{a.title}</div>
              <div className="text-xs text-slate-500">{a.course} • due {fmtDate(a.deadline)}</div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-xs px-2 py-0.5 rounded-md border ${a.published ? 'bg-green-50 border-green-200 text-green-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}
              >
                {a.published ? 'Published' : 'Draft'}
              </span>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('assignment-view', { detail: a }))}
                className="text-xs px-2 py-1 rounded-md border hover:bg-slate-100"
              >
                View
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Full page /assignments (default export) ------------------------------
export default function AssignmentUI() {
  const [assignments, setAssignments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [editPayload, setEditPayload] = useState(null);

  useEffect(() => {
    // initial load -- replace with real API call
    setAssignments(sampleAssignments());

    const handler = (e) => setSelected(e.detail);
    window.addEventListener('assignment-view', handler);
    return () => window.removeEventListener('assignment-view', handler);
  }, []);

  const filtered = assignments.filter(
    (a) => a.title.toLowerCase().includes(query.toLowerCase()) || a.course.toLowerCase().includes(query.toLowerCase())
  );

  function togglePublish(id) {
    setAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, published: !a.published } : a))
    );
    // TODO: call PATCH /api/professors/assignments/:id { published }
  }

  function removeAssignment(id) {
    if (!window.prompt('Delete assignment? This action cannot be undone.')) return;
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    setSelected((s) => (s && s.id === id ? null : s));
    // TODO: call DELETE /api/professors/assignments/:id
  }

async function openEdit(a) {
  try {
    const id = a.id || a.assignment_id;
    const res = await apiFetch(`/api/assignments/${id}`);
    const assignment = res.data || res;



    console.log('DEBUG openEdit - assignment:', assignment);

    setEditPayload(assignment);
    setShowCreate(true);
  } catch (err) {
    console.error('Failed to load assignment for edit', err);
    alert('Failed to load assignment details for edit.');
  }
}





   // --- API helper: create assignment on backend (uses bearer token from localStorage) ---
  async function createAssignment(payload) {
  // use apiFetch so Authorization & JSON parsing logic is consistent
  return await apiFetch('/api/professors/assignments', {
    method: 'POST',
    body: payload,
  });
}

// helper: update existing assignment via PUT
async function updateAssignment(id, body) {
  return await apiFetch(`/api/professors/assignments/${id}`, {
    method: 'PUT',
    body,
  });
}

// unified create / update
async function createOrUpdateAssignment(payload) {
  try {
    if (payload.id) {
      // Editing: call PUT
      await updateAssignment(payload.id, payload);

      // Refetch canonical assignment from server so we have server-generated IDs & exact shape
      let serverAssignment;
      try {
        const res = await apiFetch(`/api/assignments/${payload.id}`);
        serverAssignment = res.data || res; // tolerate { data: {...} } or bare object
      } catch (fetchErr) {
        console.warn('Refetch after update failed — falling back to local payload', fetchErr);
        serverAssignment = { ...payload };
      }

      // normalize keys for UI
serverAssignment.course = serverAssignment.course || serverAssignment.course_id || "";
serverAssignment.due_date = serverAssignment.due_date || serverAssignment.deadline || "";


setAssignments(prev =>
  prev.map(a => (a.id === payload.id ? { ...a, ...serverAssignment } : a))
);

     
    } else {
      // Creating: call POST helper you already have
      const data = await createAssignment(payload);

      const newAssignment = {
        ...payload,
        id: data.assignment_id || data.id || Math.floor(Math.random() * 1e9),
        published: !!payload.published,
        due_date: payload.deadline || new Date().toISOString(),
      };
      setAssignments(prev => [newAssignment, ...prev]);
    }

    // Close modal & clear edit state
    setShowCreate(false);
    setEditPayload(null);
  } catch (err) {
    console.error('Assignment save failed', err);
    const msg = err?.details?.error || err.message || 'Something went wrong';
    alert('Error saving assignment: ' + msg);
  }
}




 
  return (
    <div className="container mt-4">
      <div className="row">
        <header className="flex items-center justify-between mt-4 w-full">
          {/* Modal (visible when showCreate === true) */}
          {showCreate && (
            <>
              <div className="modal d-block" tabIndex="-1" role="dialog" style={{ background: "rgba(0,0,0,0.35)" }}>
                <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
                  <div className="modal-content">
                    <div className="modal-header">
                      <h5 className="modal-title">{editPayload ? "Edit Assignment" : "New Assignment"}</h5>
                      <button type="button" className="btn-close" aria-label="Close" onClick={() => { setShowCreate(false); setEditPayload(null); }} />
                    </div>
                    <div className="modal-body">
                      <CreateAssignmentForm
                        initial={editPayload}
                        onCancel={() => { setShowCreate(false); setEditPayload(null); }}
                        onSave={(payload) => { createOrUpdateAssignment(payload); /* parent closes modal */ }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          <div>
            <h1 className="text-2xl font-bold">Assignments</h1>
            <p className="text-sm text-slate-500">Create, publish and review assignments for your courses.</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or course"
              className="px-3 py-2 rounded-lg border w-64 text-sm"
            />
            <button
              onClick={() => { setEditPayload(null); setShowCreate(true); }}
              className="btn btn-primary"
            >
              + New
            </button>
          </div>
        </header>

        {/* Left: Assignments List */}
        <div className="col-md-8 mt-4">
          <div className="card shadow-sm mb-4">
            <div className="card-body">
              <h4 className="card-title">All assignments</h4>
              <ul className="list-unstyled">
                {assignments.map((a) => {
                  const status = a.published ? "Published" : "Draft";
                  return (
                    <li key={a.id} className="mb-3 pb-3 border-bottom">
                      <div className="d-flex justify-content-between">
                        <div>
                          <h5 className="mb-1">{a.title}</h5>
                          <small className="text-muted">{a.course}</small>
                          <div className="text-muted small">
                            • due {fmtDate(a.due_date)}
                          </div>
                          <p className="mt-2">{a.description}</p>
                        </div>
                        <div>
                          <span
                            className={`badge ${status === "Published" ? "bg-success" : "bg-secondary"}`}
                          >
                            {status}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2">
                        <button className="btn btn-sm btn-outline-primary me-2" onClick={() => setSelected(a)}>
                          Details
                        </button>
                        <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => openEdit(a)}>
                          Edit
                        </button>
                        {a.published ? (
                          <button className="btn btn-sm btn-warning me-2" onClick={() => togglePublish(a.id)}>Unpublish</button>
                        ) : (
                          <button className="btn btn-sm btn-success me-2" onClick={() => togglePublish(a.id)}>Publish</button>
                        )}
                        <button className="btn btn-sm btn-outline-danger" onClick={() => removeAssignment(a.id)}>Delete</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        {/* Right: Details panel */}
        <div className="col-md-4 mt-4">
          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="card-title">Details</h5>
              <p className="text-muted small">Select an assignment to see details</p>
              <hr />
              <button className="btn btn-outline-primary w-100 mb-2">
                Export submissions
              </button>
              <button className="btn btn-outline-secondary w-100">
                View marks
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// --- CreateAssignmentForm (small) -----------------------------------------
function CreateAssignmentForm({ onCancel, onSave, initial = null }) {
  
 
  // keep input for datetime-local (slice(0,16))
  const [title, setTitle] = useState(initial?.title || "");
const [course, setCourse] = useState(initial?.course_id || "");
const [desc, setDesc] = useState(initial?.description || "");
const [deadline, setDeadline] = useState(initial ? (initial.deadline ? new Date(initial.deadline).toISOString().slice(0,16) : "") : "");
  const [published, setPublished] = useState(initial ? !!initial.published : false);





  // questions: array of { id, text, options: [], correct: index, marks: number }
  // Normalize incoming initial.questions into the UI shape if necessary
  const normalizeInitialQuestions = (qs) => {
    if (!Array.isArray(qs)) return [];
    return qs.map((q, qi) => {
      // possible shapes: { question_text, options: [{label, text, is_correct}], marks } OR { text, options: [ 'a','b' ], correct: idx }
      let text = q.text ?? q.question_text ?? "";
      let marks = q.marks ?? q.points ?? 1;
      // transform options to simple string array for the UI inputs
      let options = [];
      let correct = 0;
      if (Array.isArray(q.options) && q.options.length > 0) {
        // options can be objects {label, text, is_correct} or strings
        options = q.options.map((opt, oi) => {
          if (typeof opt === "string") return opt;
          if (opt && typeof opt === "object") return String(opt.text ?? opt.option_text ?? "");
          return String(opt ?? "");
        });
        // determine correct index
        const idxFromObjects = q.options.findIndex(opt => opt && (opt.is_correct || opt.isCorrect));
        if (idxFromObjects >= 0) correct = idxFromObjects;
        else if (typeof q.correct === "number") correct = q.correct;
        else correct = 0;
      } else {
        // fallback: use q.options as empty or q.optionA, etc.
        options = Array.isArray(q.options) ? q.options : (q.optionTexts ? q.optionTexts : []);
      }

      return {
        id: q.id ?? `${Date.now()}_${qi}`,
        text: String(text ?? ""),
        options: options.length ? options : ["", ""],
        correct: Number.isFinite(correct) ? correct : 0,
        marks: Number(marks || 1),
        position: q.position ?? (qi + 1),
      };
    });
  };

  const [questions, setQuestions] = useState(initial ? normalizeInitialQuestions(initial.questions || []) : []);

  useEffect(() => {
     console.log("DEBUG initial payload to form:", initial);
    if (initial) {
      setTitle(initial.title || "");
      setCourse(initial.course_id || "");
      setDesc(initial.description || "");
      setDeadline(initial.deadline ? new Date(initial.deadline).toISOString().slice(0,16) : "");
      setPublished(!!initial.published);
      setQuestions(normalizeInitialQuestions(initial.questions || []));
    } else {
      setQuestions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function addQuestion() {
    setQuestions(prev => [
      ...prev,
      { id: Date.now(), text: "", options: ["", ""], correct: 0, marks: 1 }
    ]);
  }

  function removeQuestion(idx) {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  }

  function updateQuestion(idx, patch) {
    setQuestions(prev => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function addOption(qIdx) {
    setQuestions(prev => prev.map((q, i) => (i === qIdx ? { ...q, options: [...q.options, ""] } : q)));
  }

  function removeOption(qIdx, optIdx) {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const newOpts = q.options.filter((_, oi) => oi !== optIdx);
      const newCorrect = q.correct >= newOpts.length ? Math.max(0, newOpts.length - 1) : q.correct;
      return { ...q, options: newOpts, correct: newCorrect };
    }));
  }

  function updateOptionText(qIdx, optIdx, value) {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const newOptions = q.options.map((o, oi) => (oi === optIdx ? value : o));
      return { ...q, options: newOptions };
    }));
  }

  function setCorrectOption(qIdx, optIdx) {
    setQuestions(prev => prev.map((q, i) => (i === qIdx ? { ...q, correct: optIdx } : q)));
  }

  // ---------- Helper: build backend-friendly questions payload ----------
  // This creates for each option an object { label: 'A'|'B'..., text, is_correct }
  function buildQuestionsPayload(questionsLocal) {
    return questionsLocal.map((q, qi) => {
      const options = (q.options || []).map((opt, oi) => {
        const label = String.fromCharCode(65 + oi); // A, B, C...
        const text = typeof opt === "string" ? opt : (opt.text ?? String(opt));
        // mark correct if the UI's correct index equals this option, or opt has is_correct
        const is_correct = Number(q.correct ?? -1) === oi || !!(opt && opt.is_correct);
        return {
          label,
          text: String(text ?? ""),
          is_correct,
        };
      });

      return {
        position: typeof q.position === "number" ? q.position : (qi + 1),
        question_text: String(q.text ?? q.question_text ?? ""),
        options,
        marks: Number(q.marks ?? 1),
      };
    });
  }

  // ---------- Unified submit handler (replaces duplicates) ----------
  async function handleSubmit(e) {
    e.preventDefault();

    // basic required fields
    if (!title || !course || !deadline) {
      alert('Please provide title, course and due date.');
      return;
    }

    // local questions sanity
    if (!Array.isArray(questions) || questions.length === 0) {
      const ok = window.confirm('There are no questions. Save anyway?');
      if (!ok) return;
    }

    // detect incomplete question (empty text / option)
    const badQ = questions.find(q =>
      !String(q.text ?? q.question_text ?? '').trim()
      || !Array.isArray(q.options)
      || q.options.length < 2
      || q.options.some(opt => (typeof opt === 'string' ? !opt.trim() : !String(opt.text ?? '').trim()))
    );

    if (badQ) {
      const ok = window.confirm('One or more questions look incomplete (empty text/options). Save anyway?');
      if (!ok) return;
    }

    // build normalized payload for backend (labels A.., is_correct flags included)
    const questionsPayload = buildQuestionsPayload(questions);

    // detect missing correct answers
    const missingCorrect = questionsPayload.some(q => !Array.isArray(q.options) || !q.options.some(o => !!o.is_correct));
    if (missingCorrect) {
      const ok = window.confirm('One or more questions have no correct option selected. Save anyway?');
      if (!ok) return;
    }

    // final payload: map local names to backend-friendly keys
    const payload = {
      course_id: course,
      title,
      description: desc ?? '',
      // include both due_date and deadline (ISO) for robustness
     
      deadline: new Date(deadline).toISOString(),
      published: !!published,
      questions: questionsPayload,
    };

    if (initial && initial.id) {
      payload.id = initial.id;
    }

    try {
      const result = onSave && onSave(payload);
      if (result && typeof result.then === "function") {
        await result;
      }
      // parent (AssignmentUI) will handle closing modal / updating list
    } catch (err) {
      console.error('save assignment error', err);
      alert(err?.message || 'Failed to save assignment.');
    }
  }

  // ----- Render: UI unchanged, only form's onSubmit updated -----
  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-3 row">
        <div className="col-6">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title *" className="form-control" />
        </div>
        <div className="col-6">
          <input value={course} onChange={e => setCourse(e.target.value)} placeholder="Course code *" className="form-control" />
        </div>
      </div>

      <div className="mb-3">
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" className="form-control" rows={4} />
      </div>

      <div className="mb-3 row align-items-center">
        <div className="col-md-6">
<input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className="form-control" />
        </div>
        <div className="col-md-6">
          <div className="form-check">
            <input className="form-check-input" type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} id="publishNow" />
            <label className="form-check-label" htmlFor="publishNow">Publish immediately</label>
          </div>
        </div>
      </div>

      {/* Questions panel (initial view + Add question) */}
      <div className="mb-3 p-3 bg-light border rounded">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <strong>Questions</strong>
          <small className="text-muted">Multiple choice only (MCQ)</small>
        </div>

        {questions.length === 0 && (
          <div className="mb-2 text-muted">No questions yet. Click "Add question" to start.</div>
        )}

        {questions.map((q, qi) => (
          <div key={q.id} className="border rounded p-3 mb-3 bg-white">
            <div className="d-flex justify-content-between">
              <div className="flex-grow-1 me-3">
                <input value={q.text} onChange={e => updateQuestion(qi, { text: e.target.value })} placeholder={`Question ${qi + 1} text`} className="form-control mb-2" />
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2 mt-2">
                    <input
                      type="radio"
                      name={`q_correct_${qi}`}
                      checked={Number(q.correct ?? -1) === oi}
                      onChange={() => setCorrectOption(qi, oi)}
                    />
                    <input
                      value={opt}
                      onChange={(e) => updateOptionText(qi, oi, e.target.value)}
                      placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                      className="flex-1 px-3 py-2 rounded-md border"
                    />
                    <button type="button" onClick={() => removeOption(qi, oi)} className="px-2 py-1 rounded-md border text-sm">Remove</button>
                  </div>
                ))}

                <div className="d-flex gap-2 mt-2">
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => addOption(qi)}>Add option</button>
                  <div className="input-group input-group-sm" style={{ width: 120 }}>
                    <span className="input-group-text">Marks</span>
                    <input type="number" min="1" value={q.marks} onChange={e => updateQuestion(qi, { marks: Number(e.target.value || 1) })} className="form-control" />
                  </div>
                </div>
              </div>

              <div className="text-end">
                <div className="text-muted mb-2">Q {qi + 1}</div>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => removeQuestion(qi)}>Delete</button>
              </div>
            </div>
          </div>
        ))}

        <div>
          <button type="button" className="btn btn-sm btn-dark" onClick={addQuestion}>Add question</button>
        </div>
      </div>

      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">Create</button>
      </div>
    </form>
  );
}
