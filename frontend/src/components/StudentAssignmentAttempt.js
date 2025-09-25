import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiFetch from "../utils/apiFetch";

export default function StudentAssignmentAttempt() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const studentId = 2022008; // hardcode for now (dev)

  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // pendingSaves holds question_id -> selected_label for answers waiting to be saved
  const pendingSaves = useRef(new Map());
  // timer handle for debounce
  const saveTimer = useRef(null);
  // avoid state updates after unmount
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    async function load() {
      try {
        const res = await apiFetch(`/api/student/assignments/${assignmentId}?student_id=${studentId}`);
        if (res && res.ok) {
          setData(res);
          const parsed = {};
          if (res.answers) {
            Object.entries(res.answers).forEach(([qid, sel]) => {
              parsed[Number(qid)] = sel;
            });
          }
          setAnswers(parsed);
        } else {
          setData(null);
          setAnswers({});
        }
      } catch (err) {
        console.error("Failed to load assignment detail", err);
      }
    }
    load();

    return () => {
      mounted.current = false;
      // flush any pending saves on unmount
      flushPendingSavesSync();
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  // push into pendingSaves and schedule debounce flush
  function scheduleSave(qid, selected) {
    pendingSaves.current.set(Number(qid), selected);

    // if there's already a timer, leave it — debounce will flush after interval
    if (saveTimer.current) return;

    setSaving(true);
    saveTimer.current = setTimeout(() => {
      flushPendingSaves();
    }, 1500); // 1.5s debounce
  }

  // flush pendingSaves (async)
  async function flushPendingSaves() {
    if (!pendingSaves.current.size) {
      saveTimer.current = null;
      setSaving(false);
      return;
    }
    // create payload and clear pending map (optimistic)
    const items = Array.from(pendingSaves.current.entries()).map(([qid, sel]) => ({
      question_id: Number(qid),
      selected: sel
    }));
    pendingSaves.current.clear();
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    try {
      await apiFetch(
        `/api/student/assignments/${assignmentId}/autosave?student_id=${studentId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: items }),
        }
      );
    } catch (err) {
      // If autosave fails, requeue items so we don't lose them
      console.warn("Autosave batch failed — will retry on next change", err);
      for (const it of items) {
        pendingSaves.current.set(it.question_id, it.selected);
      }
      // schedule next attempt
      if (!saveTimer.current) {
        saveTimer.current = setTimeout(flushPendingSaves, 2000);
      }
    } finally {
      // small delay so saving indicator is visible briefly even on quick responses
      setTimeout(() => {
        if (mounted.current) setSaving(pendingSaves.current.size > 0);
      }, 250);
    }
  }

  // flush pending saves synchronously on unmount/submit (fire & forget but attempt)
  function flushPendingSavesSync() {
    if (!pendingSaves.current.size) return;
    const items = Array.from(pendingSaves.current.entries()).map(([qid, sel]) => ({
      question_id: Number(qid),
      selected: sel
    }));
    pendingSaves.current.clear();
    // best effort: send without awaiting (avoid blocking)
    try {
      navigator.sendBeacon(
        `/api/student/assignments/${assignmentId}/autosave?student_id=${studentId}`,
        JSON.stringify({ answers: items })
      );
    } catch (e) {
      // ignore: fallback to normal fetch if sendBeacon unsupported
      fetch(`/api/student/assignments/${assignmentId}/autosave?student_id=${studentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: items }),
        keepalive: true
      }).catch(() => {});
    }
  }

  function handleChange(qid, val) {
    const q = Number(qid);
    const updated = { ...answers, [q]: val };
    setAnswers(updated);
    scheduleSave(q, val);
  }

  async function handleSubmit() {
    if (!data || !data.assignment) return;
    if (submitting) return;

    // guard: deadline
    const now = new Date();
    if (data.assignment.deadline && new Date(data.assignment.deadline) < now) {
      alert("Deadline already passed. Cannot submit.");
      return;
    }

    // flush pending saves before submitting
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    // do a final attempt to flush to server and wait for it
    setSaving(true);
    await flushPendingSaves();
    setSaving(false);

    setSubmitting(true);
    try {
      const payload = {
        answers: Object.entries(answers).map(([qid, sel]) => ({
          question_id: Number(qid),
          selected: sel
        }))
      };

      const res = await apiFetch(
        `/api/student/assignments/${assignmentId}/submit?student_id=${studentId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

      if (res && res.ok) {
        alert(`Submitted! Score: ${res.score} (${res.correct_count}/${res.total_q})`);
        navigate("/student/assignments");
      } else {
        alert("Submit failed: " + (res?.error || "unknown"));
      }
    } catch (err) {
      console.error("Submit error", err);
      alert("Submit failed: network or server error.");
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  if (!data) return <p>Loading...</p>;

  const assignment = data.assignment || {};
  const questions = Array.isArray(data.questions) ? data.questions : [];

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">{assignment.title || "Assignment"}</h2>
      <p className="mb-4">{assignment.description}</p>
      <p className="text-sm text-gray-500 mb-4">
        Deadline: {assignment.deadline ? new Date(assignment.deadline).toLocaleString() : "—"}
      </p>

      <div className="mb-4">
        {saving ? <span className="text-sm text-gray-600">Saving…</span> : <span className="btn small">All changes saved</span>}
      </div>

      {questions.map((q) => (
        <div key={q.question_id} className="mb-4 p-3 border rounded">
          <p className="font-semibold">
            {q.position ?? ""}. {q.question_text}
          </p>

          {Array.isArray(q.options) && q.options.length ? (
            q.options.map((opt) => {
              const label = opt.label ?? opt.option_id ?? opt.option_label;
              const text = opt.text ?? opt.option_text ?? opt.option_text;
              return (
                <label key={label} className="block cursor-pointer">
                  <input
                    type="radio"
                    name={`q${q.question_id}`}
                    value={label}
                    checked={answers[q.question_id] === label}
                    onChange={() => handleChange(q.question_id, label)}
                  />
                  <span className="ml-2">{label}. {text}</span>
                </label>
              );
            })
          ) : (
            <p className="text-sm text-gray-500">No options for this question.</p>
          )}
        </div>
      ))}

      <button
        onClick={handleSubmit}
        className="btn small"
        disabled={submitting || (assignment.deadline && new Date(assignment.deadline) < new Date())}
      >
        {submitting ? "Submitting…" : "Submit"}
      </button>
    </div>
  );
}
