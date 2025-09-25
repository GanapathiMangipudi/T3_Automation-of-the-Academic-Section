import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom'; // or pass assignmentId prop

export default function AssignmentForm({ assignmentIdProp }) {
  const params = useParams();
  const assignmentId = assignmentIdProp || params.id; // undefined for create
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('');
const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState([]); // array of {id, text, marks, options: [{id,text}] }
  const [loading, setLoading] = useState(false);

  // Load existing assignment when editing


  useEffect(() => {

    if (!assignmentId) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/assignments/${assignmentId}`);
        const payload = await res.json();
        if (!payload.success) throw new Error(payload.message || 'Failed');
        const a = payload.data;
        console.log("Loaded assignment", a);
        if (!mounted) return;
        setTitle(a.title || '');
setCourse(a.course_id || '');
setDeadline(a.deadline ? new Date(a.deadline).toISOString().slice(0,16) : '');
        setDescription(a.description || '');
        // IMPORTANT: ensure questions are in the shape you expect. Provide defaults.
        setQuestions((a.questions || []).map(q => ({
          id: q.id ?? null,
          text: q.text ?? q.question_text ?? '',
          marks: q.marks ?? 0,
          options: (q.options || []).map(o => ({
            id: o.id ?? null,
            text: o.text ?? o.option_text ?? ''
          }))
        })));
      } catch (err) {
        console.error('Load assignment failed', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [assignmentId]);

  // Example: render questions with stable keys
  return (
    <form /* onSubmit... */>
      <input value={title} onChange={e => setTitle(e.target.value)} />
      <textarea value={description} onChange={e => setDescription(e.target.value)} />

        <input 
      type="text"
      value={course}
      onChange={e => setCourse(e.target.value)}
      placeholder="Course ID"
    />

    <input
      type="datetime-local"
      value={deadline}
      onChange={e => setDeadline(e.target.value)}
    />

      <div>
        {questions.map((q, qi) => (
          <div key={q.id ?? `q-${qi}`} style={{ border: '1px solid #ddd', padding: 8 }}>
            <input
              value={q.text}
              onChange={e => {
                const newQs = [...questions];
                newQs[qi] = { ...newQs[qi], text: e.target.value };
                setQuestions(newQs);
              }}
            />
            <div>
              {(q.options || []).map((opt, oi) => (
                <input
                  key={opt.id ?? `opt-${qi}-${oi}`}
                  value={opt.text}
                  onChange={e => {
                    const newQs = [...questions];
                    const newOpts = [...(newQs[qi].options || [])];
                    newOpts[oi] = { ...newOpts[oi], text: e.target.value };
                    newQs[qi] = { ...newQs[qi], options: newOpts };
                    setQuestions(newQs);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </form>
  );
}
