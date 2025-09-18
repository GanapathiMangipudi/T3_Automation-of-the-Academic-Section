import React, { useEffect, useState } from "react";

/**
 * Assignments UI
 * - This file exports two components:
 *    1) default export -> AssignmentsPage (full-page view mounted at /assignments)
 *    2) named export -> AssignmentCompact (compact card to embed inside ProfessorDashboard)
 *
 * Styling: Tailwind CSS utility classes (no imports required for preview in canvas)
 * Behavior:
 *  - Shows a list of assignments with status, due date, and quick actions.
 *  - Compact view is small and meant to fit within the ProfessorDashboard column.
 *  - Full page supports pagination, create/edit drawer, and a detailed view when clicking "View".
 *  - All data is local/dummy by default but hooks are provided where API calls should be made.
 */

// --- Utility helpers -----------------------------------------------------
const fmtDate = (iso) => new Date(iso).toLocaleString();

// dummy data generator
const sampleAssignments = () => [
  {
    id: 1,
    title: "Assignment 1 — Linear Algebra",
    course: "MA101",
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
    // Replace with: fetch('/api/professors/assignments?limit=3')...
    setAssignments(sampleAssignments().slice(0, 3));
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
              <div className="text-xs text-slate-500">{a.course} • due {fmtDate(a.due_date)}</div>
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

// --- Full page /assignments ------------------------------------------------
export default function AssignmentsPage() {
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

  function openEdit(a) {
    setEditPayload(a);
    setShowCreate(true);
  }

  function createOrUpdateAssignment(payload) {
    // if payload contains id -> update, else create
    if (payload.id) {
      setAssignments((prev) => prev.map((a) => (a.id === payload.id ? { ...a, ...payload } : a)));
      setSelected(payload);
    } else {
      const nextId = Math.max(0, ...assignments.map((a) => a.id)) + 1;
      const newA = { id: nextId, ...payload };
      setAssignments((prev) => [newA, ...prev]);
      setSelected(newA);
    }
    setShowCreate(false);
    setEditPayload(null);
    // TODO: call POST or PATCH to backend accordingly
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
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
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm shadow"
            >
              + New
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* left: list */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h3 className="text-sm font-semibold mb-3">All assignments</h3>

              <ul className="divide-y">
                {filtered.map((a) => (
                  <li key={a.id} className="py-3 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="font-medium">{a.title}</div>
                        <div className="text-xs text-slate-500">{a.course}</div>
                        <div className="text-xs text-slate-500">• due {fmtDate(a.due_date)}</div>
                      </div>
                      <div className="text-sm text-slate-700 mt-1">{a.description}</div>
                    </div>

                    <div className="ml-4 flex flex-col items-end gap-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelected(a)}
                          className="text-xs px-3 py-1 rounded-md border hover:bg-slate-50"
                        >
                          Details
                        </button>
                        <button
                          onClick={() => openEdit(a)}
                          className="text-xs px-3 py-1 rounded-md border hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => togglePublish(a.id)}
                          className="text-xs px-3 py-1 rounded-md border hover:bg-slate-50"
                        >
                          {a.published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          onClick={() => removeAssignment(a.id)}
                          className="text-xs px-3 py-1 rounded-md border text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="text-xs text-slate-500">{a.published ? 'Published' : 'Draft'}</div>
                    </div>
                  </li>
                ))}

                {filtered.length === 0 && (
                  <li className="py-6 text-center text-slate-500">No assignments found.</li>
                )}
              </ul>
            </div>

            {/* pagination placeholder */}
            <div className="mt-4 flex justify-end">
              <div className="text-xs text-slate-500">Showing {filtered.length} items</div>
            </div>
          </div>

          {/* right: selected details */}
          <aside className="hidden md:block">
            <div className="sticky top-6 bg-white rounded-2xl shadow-sm p-4 w-72">
              <h4 className="text-sm font-semibold mb-2">Details</h4>
              {selected ? (
                <div>
                  <div className="font-medium">{selected.title}</div>
                  <div className="text-xs text-slate-500">{selected.course} • due {fmtDate(selected.due_date)}</div>
                  <p className="mt-3 text-sm text-slate-700">{selected.description}</p>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => togglePublish(selected.id)}
                      className="text-sm px-3 py-1 rounded-md border"
                    >
                      {selected.published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      onClick={() => openEdit(selected)}
                      className="text-sm px-3 py-1 rounded-md border"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeAssignment(selected.id)}
                      className="text-sm px-3 py-1 rounded-md border text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500">Select an assignment to see details</div>
              )}

              <hr className="my-3" />
              <div className="text-xs text-slate-500">Quick actions</div>
              <div className="mt-2 text-sm">
                <button className="w-full text-left text-sm px-3 py-2 rounded-md border">Export submissions</button>
                <button className="w-full text-left text-sm px-3 py-2 rounded-md border mt-2">View marks</button>
              </div>
            </div>
          </aside>
        </div>

        {/* Create drawer/modal (simple) */}
        {showCreate && (
          <div className="fixed inset-0 z-40 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => { setShowCreate(false); setEditPayload(null); }} />
            <div className="bg-white rounded-2xl shadow p-6 w-full max-w-2xl z-50">
              <CreateAssignmentForm
                initial={editPayload}
                onCancel={() => { setShowCreate(false); setEditPayload(null); }}
                onSave={createOrUpdateAssignment}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- CreateAssignmentForm (small) -----------------------------------------
function CreateAssignmentForm({ onCancel, onSave, initial = null }) {
  const [title, setTitle] = useState(initial ? initial.title : "");
  const [course, setCourse] = useState(initial ? initial.course : "");
  const [desc, setDesc] = useState(initial ? initial.description : "");
  const [due, setDue] = useState(initial ? new Date(initial.due_date).toISOString().slice(0,16) : "");
  const [published, setPublished] = useState(initial ? !!initial.published : false);

  useEffect(() => {
    // keep form in sync if initial changes while open
    if (initial) {
      setTitle(initial.title || "");
      setCourse(initial.course || "");
      setDesc(initial.description || "");
      setDue(initial.due_date ? new Date(initial.due_date).toISOString().slice(0,16) : "");
      setPublished(!!initial.published);
    }
  }, [initial]);

  function submit(e) {
    e.preventDefault();
    if (!title || !course || !due) {
      alert('Please provide title, course and due date.');
      return;
    }
    const payload = { title, course, description: desc, due_date: new Date(due).toISOString(), published };
    if (initial && initial.id) payload.id = initial.id; // preserve id for edits
    onSave(payload);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{initial ? 'Edit Assignment' : 'New Assignment'}</h3>
        <div className="text-sm text-slate-500">Fields marked * required</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title *" className="px-3 py-2 rounded-md border w-full" />
        <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Course code *" className="px-3 py-2 rounded-md border w-full" />
      </div>

      <div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className="w-full rounded-md border p-3" rows={4} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="px-3 py-2 rounded-md border w-full" />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <span className="text-sm">Publish immediately</span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-md border">Cancel</button>
        <button type="submit" className="px-4 py-2 rounded-md bg-slate-900 text-white">{initial ? 'Save changes' : 'Create'}</button>
      </div>
    </form>
  );
}

