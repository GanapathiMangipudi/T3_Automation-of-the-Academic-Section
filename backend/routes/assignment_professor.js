// backend/routes/assignment_professor.js
const express = require('express');

module.exports = (pool, io) => {
  const router = express.Router();

  // POST /api/professors/assignments
  router.post('/', async (req, res) => {
    if (!req.user || req.user.role !== 'professor') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const payload = req.body || {};
    const { course_id, title, description = '', deadline, questions } = payload;

    if (!course_id || !title || !deadline || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    if (questions.length !== 5) {
      return res.status(400).json({ error: 'invalid_questions', details: 'require exactly 5 questions' });
    }

    // validate question shapes (labels A-D, exactly one is_correct per question)
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q || typeof q.question_text !== 'string' || !Array.isArray(q.options) || q.options.length !== 4) {
        return res.status(400).json({ error: 'invalid_question', details: `bad question ${i}` });
      }
      let correctCount = 0;
      const seen = new Set();
      for (const opt of q.options) {
        if (!opt || typeof opt.label !== 'string' || typeof opt.text !== 'string') {
          return res.status(400).json({ error: 'invalid_option' });
        }
        const L = opt.label.trim().toUpperCase();
        if (!['A','B','C','D'].includes(L)) return res.status(400).json({ error: 'invalid_option_label' });
        if (seen.has(L)) return res.status(400).json({ error: 'duplicate_option_label' });
        seen.add(L);
        if (opt.is_correct) correctCount++;
      }
      if (correctCount !== 1) return res.status(400).json({ error: 'invalid_correct_option' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const dl = new Date(deadline);
      const [r] = await conn.query(
        `INSERT INTO assignments (course_id, title, description, created_by, deadline, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [course_id, title, description, req.user.id, dl]
      );
      const assignmentId = r.insertId;

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const position = typeof q.position === 'number' ? q.position : (i + 1);
        const [qr] = await conn.query(
          `INSERT INTO assignment_questions (assignment_id, position, question_text) VALUES (?, ?, ?)`,
          [assignmentId, position, q.question_text]
        );
        const questionId = qr.insertId;

        for (const optRaw of q.options) {
          const label = optRaw.label.trim().toUpperCase();
          const optionText = optRaw.text;
          const isCorrect = optRaw.is_correct ? 1 : 0;
          await conn.query(
            `INSERT INTO assignment_options (question_id, label, option_text, is_correct)
             VALUES (?, ?, ?, ?)`,
            [questionId, label, optionText, isCorrect]
          );
        }
      }

      await conn.commit();
      conn.release();

      // optional: notify students (if io present)
      if (io) {
        try { io.emit('assignment:created', { assignment_id: assignmentId, course_id }); } catch(e) { /* non-fatal */ }
      }

      return res.status(201).json({ ok: true, assignment_id: assignmentId });
    } catch (err) {
      try { await conn.rollback(); } catch(_) {}
      conn.release();
      console.error('prof create assignment error', err);
      return res.status(500).json({ error: 'db_error', details: err.message });
    }
  });

  // GET /api/professors/assignments/:assignmentId/submissions
  router.get('/:assignmentId/submissions', async (req, res) => {
    if (!req.user || req.user.role !== 'professor') return res.status(403).json({ error: 'forbidden' });
    const aid = Number(req.params.assignmentId);
    if (!aid) return res.status(400).json({ error: 'assignment_id required' });

    try {
      const [rows] = await pool.query(
        `SELECT s.submission_id, s.student_id, s.status, s.score, s.submitted_at, s.last_saved_at
         FROM assignment_submissions s
         WHERE s.assignment_id = ?
         ORDER BY s.submitted_at DESC, s.last_saved_at DESC`,
        [aid]
      );
      res.json({ ok: true, submissions: rows });
    } catch (err) {
      console.error('prof submissions error', err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  return router;
};
