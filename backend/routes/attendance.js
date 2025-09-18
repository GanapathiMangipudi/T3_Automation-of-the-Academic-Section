// routes/attendance.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth'); 
const db = require('../db/pool'); // mysql2/promise pool

// DEBUG: ping endpoint to confirm router is mounted at whatever prefix
router.get('/attendance/__ping__', (req, res) => {
  res.json({ ok: true, msg: 'attendance router alive', baseUrl: req.baseUrl || null });
});

// Async handler: insert/update attendance
async function upsertAttendanceHandler(req, res) {
  try {
    // debug log to inspect incoming request and auth
    console.log('[attendance POST] body=', req.body, 'user=', req.user);

    // prefer numeric prof_id when available; otherwise use NULL (avoids inserting 'unknown' into INT column)
    const by = req.user && req.user.prof_id ? Number(req.user.prof_id) : null;
    const { course_id, student_id, date, status } = req.body || {};

    if (!course_id || !student_id || !date || !status) {
      return res.status(400).json({ error: 'Missing course_id, student_id, date or status' });
    }

    const s = String(status).toLowerCase() === 'present' ? 'present' : 'absent';

    // UPSERT into MySQL
    const insertSql = `
      INSERT INTO attendance (course_id, student_id, date, status, marked_by, marked_at)
      VALUES (?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        marked_by = VALUES(marked_by),
        marked_at = NOW()
    `;
    await db.query(insertSql, [course_id, student_id, date, s, by]);

    // Fetch the row back
    const [rows] = await db.query(
      `SELECT a.id, a.course_id, a.student_id, a.date, a.status, a.marked_by, a.marked_at, s.name AS student_name
       FROM attendance a
       LEFT JOIN students s ON s.student_id = a.student_id
       WHERE a.course_id = ? AND a.student_id = ? AND a.date = ? LIMIT 1`,
      [course_id, student_id, date]
    );

    return res.json({ ok: true, record: rows[0] || null });
  } catch (err) {
    console.error('[attendance POST] error', err);
    return res.status(500).json({ error: 'Failed to mark attendance' });
  }
}

// GET /api/professors/attendance?course_id=...&date=YYYY-MM-DD
router.get('/attendance', requireAuth, async (req, res) => {
  try {
    const course_id = req.query.course_id;
    const date = req.query.date;
    if (!course_id || !date) {
      return res.status(400).json({ error: 'Missing course_id or date' });
    }

    // Query attendance rows for the given course + date
    const [rows] = await db.query(
      `SELECT a.id, a.course_id, a.student_id, s.name AS student_name, a.date, a.status, a.marked_by, a.marked_at
       FROM attendance a
       LEFT JOIN students s ON s.student_id = a.student_id
       WHERE a.course_id = ? AND a.date = ?`,
      [course_id, date]
    );

    // Normalize output your frontend expects: { rows: [...] }
    return res.json({ ok: true, rows: rows || [] });
  } catch (err) {
    console.error('[attendance GET] error', err);
    return res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Wire up the handler
router.post('/attendance', requireAuth, upsertAttendanceHandler);

module.exports = router;