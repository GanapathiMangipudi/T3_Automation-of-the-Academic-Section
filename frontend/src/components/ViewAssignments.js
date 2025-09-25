import React, { useEffect, useState } from "react";

export default function ViewAssignments() {
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    // Replace with your API call
    async function fetchAssignments() {
      try {
        // Example:
        // const res = await apiFetch("/api/assignments");
        // setAssignments(res.data);
        setAssignments([
          { id: 1, title: "Math Assignment 1", dueDate: "2025-09-30" },
          { id: 2, title: "Science Assignment", dueDate: "2025-10-05" },
        ]);
      } catch (err) {
        console.error("Failed to fetch assignments", err);
      }
    }
    fetchAssignments();
  }, []);

  return (
    <div className="view-assignments">
      <h2>My Assignments</h2>
      <ul>
        {assignments.map((a) => (
          <li key={a.id}>
            {a.title} – Due: {a.dueDate}
          </li>
        ))}
      </ul>
    </div>
  );
}
