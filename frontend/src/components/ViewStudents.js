// src/pages/ViewStudents.js
import React, { useEffect, useState } from "react";

const API_BASE = process.env.REACT_APP_API || "http://localhost:4000/api";

export default function ViewStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/students`)
      .then((r) => {
        if (!r.ok) throw new Error("Network response not ok");
        return r.json();
      })
      .then((data) => {
        setStudents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setErr(e.message || "Fetch error");
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{padding:20}}>Loading students…</div>;
  if (err) return <div style={{padding:20, color:"red"}}>Error: {err}</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2>Students</h2>
      {students.length === 0 ? (
        <div>No students found.</div>
      ) : (
        <table border="1" cellPadding="8">
          <thead>
            <tr><th>ID</th><th>Name</th><th>Roll</th></tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id || s.student_id || Math.random()}>
                <td>{s.id ?? s.student_id}</td>
                <td>{s.name}</td>
                <td>{s.roll_no ?? s.roll}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
