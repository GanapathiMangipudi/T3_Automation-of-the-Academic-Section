import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiFetch from "../utils/apiFetch";

export default function StudentAssignmentsList() {
  const [assignments, setAssignments] = useState([]);
  const navigate = useNavigate();
  const studentId = 2022008; // hardcode for now (dev)

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch(`/api/student/assignments?student_id=${studentId}`);
        if (res && res.ok) setAssignments(res.assignments || []);
        else setAssignments([]);
      } catch (err) {
        console.error("Failed to load assignments", err);
        setAssignments([]);
      }
    }
    load();
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Assignments</h2>
      {assignments.length === 0 && <p>No assignments yet.</p>}
      <div className="space-y-4">
        {assignments.map((a) => (
          <div key={a.assignment_id} className="p-4 border rounded">
            <h3 className="font-semibold">{a.title}</h3>
            <p>Deadline: {a.deadline ? new Date(a.deadline).toLocaleString() : "—"}</p>
            <p>Status: {a.status}</p>
            <button
              className="btn small"
              disabled={a.status === "closed"}
              onClick={() => navigate(`/student/assignments/${a.assignment_id}`)}
            >
              {a.status === "submitted" ? "View" : "Attempt"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
