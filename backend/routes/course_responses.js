// backend/routes/course_responses.js
// Exports a factory: module.exports = (pool) => router
const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  // Upsert selection: replace current selections for the student with provided courseIds
  router.post('/', async (req, res) => {
    // Prefer authenticated student id from middleware, fallback to body.student_id
    const studentId = (req.user && req.user.student_id) || req.body.student_id;
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'missing_student_id' });
    }

    const courseIds = Array.isArray(req.body.courseIds)
      ? req.body.courseIds.map((v) => Number(v)).filter(Boolean)
      : Array.isArray(req.body.course_ids)
      ? req.body.course_ids.map((v) => Number(v)).filter(Boolean)
      : req.body.course_id
      ? [Number(req.body.course_id)]
      : [];

    if (courseIds.length === 0) {
      // If the client wants to clear selections, we still accept an empty array.
      // Here we will delete existing rows and respond with enrolledCount = 0.
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Delete previous selections for this student
      await conn.query('DELETE FROM course_responses WHERE student_id = ?', [studentId]);

      let inserted = 0;
      if (courseIds.length > 0) {
        // Build bulk insert values: [[studentId, courseId], ...]
        const values = courseIds.map((cId) => [String(studentId), Number(cId)]);
        // mysql2 supports bulk insert with VALUES ?
        const [result] = await conn.query(
          'INSERT INTO course_responses (student_id, course_id) VALUES ?',
          [values]
        );
        inserted = result && typeof result.affectedRows === 'number' ? result.affectedRows : values.length;
      }

      await conn.commit();

      // Respond with a stable numeric field enrolledCount and echo courseIds for debugging
      return res.json({
        ok: true,
        enrolledCount: inserted,
        courseIds,
      });
    } catch (err) {
      try {
        await conn.rollback();
      } catch (e) {
        // ignore rollback errors
      }
      console.error('course_responses handler error:', err && err.stack ? err.stack : err);
      return res.status(500).json({ ok: false, error: 'db_error', details: String(err && err.message) });
    } finally {
      conn.release();
    }
  });

  // (Optional) a GET handler to return existing selections for the student
  router.get('/', async (req, res) => {
    const studentId = (req.user && req.user.student_id) || req.query.student_id;
    if (!studentId) return res.status(401).json({ ok: false, error: 'missing_student_id' });
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query('SELECT course_id FROM course_responses WHERE student_id = ?', [studentId]);
      const courseIds = (rows || []).map((r) => r.course_id);
      return res.json({ ok: true, data: courseIds });
    } catch (err) {
      console.error('course_responses GET error:', err);
      return res.status(500).json({ ok: false, error: 'db_error' });
    } finally {
      conn.release();
    }
  });

  return router;
};
