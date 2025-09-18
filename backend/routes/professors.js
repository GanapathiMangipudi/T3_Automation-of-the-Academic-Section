// routes/professors.js  (append or replace existing file contents as needed)
const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'replace_with_real_secret';

// quick auth middleware (non-fatal)
router.use((req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token || '');
  if (!token) { req.prof = null; return next(); }
  try { req.prof = jwt.verify(token, JWT_SECRET); } catch (e) { req.prof = null; }
  next();
});

function getDbOrThrow(req) {
  const db = req.app.get('db');
  if (!db) {
    const err = new Error('DB connection not configured');
    err.code = 'NO_DB';
    throw err;
  }
  return db;
}

/**
 * GET /students
 * Return ALL students (no filtering).
 */
router.get('/students', async (req, res) => {
  try {
    const db = getDbOrThrow(req);
    const sql = `SELECT student_id, name, email, /* add other columns you need */ 
                 FROM students
                 ORDER BY student_id;`;
    const [rows] = await db.query(sql);
    return res.json({ ok: true, students: rows });
  } catch (err) {
    if (err.code === 'NO_DB') {
      return res.status(500).json({ ok: false, error: 'DB connection not configured' });
    }
    console.error('[ERROR] GET /students failed:', err);
    return res.status(500).json({ ok: false, error: err.message || 'DB error' });
  }
});

// --- Replace your existing /api/professors/enrollments handler with this ---
// GET /api/professors/enrollments  -> grouped by course, students array included
router.get(['/enrollments', '/enrollments/all'], async (req, res) => {
  try {
    const db = req.app.get('db');
    if (!db) return res.status(500).json({ ok: false, error: 'DB connection not configured' });

    const isAll = req.path.endsWith('/all');
    // department from token (EE101)
    const dept = req.prof && req.prof.department;

    // Per-student query (returns one row per student enrollment)
    // We join professors via c.code = p.department per your schema
    let sql = `
      SELECT
        c.course_id,
        c.code   AS course_code,
        c.title  AS course_title,
        s.student_id,
        s.name   AS student_name,
        cr.selected_at
      FROM course_responses cr
      JOIN courses c ON cr.course_id = c.course_id
      JOIN students s ON cr.student_id = s.student_id
      JOIN professors p ON c.code = p.department
      WHERE cr.selected_at IS NOT NULL
    `;

    const params = [];
    if (!isAll) {
      if (!dept) return res.status(403).json({ ok: false, error: 'Department required' });
      sql += ` AND p.department = ?`;
      params.push(dept);
    }

    sql += ` ORDER BY c.course_id, s.student_id;`;

    const [rows] = await db.query(sql, params);

    // Group rows into course -> students structure
    const grouped = rows.reduce((acc, r) => {
      const key = r.course_id;
      if (!acc[key]) {
        acc[key] = {
          course_id: r.course_id,
          course_code: r.course_code,
          course_title: r.course_title,
          students: []
        };
      }
      acc[key].students.push({
        student_id: r.student_id,
        student_name: r.student_name,
        selected_at: r.selected_at
      });
      return acc;
    }, {});

    const courses = Object.values(grouped).map(c => ({
      ...c,
      student_count: c.students.length
    }));

    return res.json({ ok: true, courses });
  } catch (err) {
    console.error('[ERROR] GET /enrollments:', err);
    return res.status(500).json({ ok: false, error: err.message || 'DB error' });
  }
});



module.exports = router;
