// src/components/AdminViewProfessorsPage.jsx
import React, { useEffect, useState } from 'react';
import api from '../api'; // your axios instance (same as students)

export default function AdminViewProfessorsPage() {
  const [professors, setProfessors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/api/professors'); // same endpoint shape as students
        if (!mounted) return;
        setProfessors(res.data || []);
      } catch (err) {
        console.error('Failed to fetch professors', err);
        if (mounted) setError('Failed to load professors');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="container py-4">Loading professors…</div>;
  if (error) return <div className="container py-4"><div className="alert alert-danger">{error}</div></div>;

  return (
    <div className="container py-4">
      <h3 className="mb-3">Professors</h3>
      {professors.length === 0 ? (
        <p>No professors found.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-bordered table-striped">
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Department</th>
              </tr>
            </thead>
            <tbody>
              {professors.map((p) => (
                <tr key={p.username}>
                  <td>{p.username}</td>
                  <td>{p.full_name}</td>
                  <td>{p.email}</td>
                  <td>{p.department}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
