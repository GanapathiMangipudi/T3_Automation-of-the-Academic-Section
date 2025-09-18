// backend/routes/assignment_student.js
const express = require('express');

module.exports = (pool, io) => {
  const router = express.Router();

  // GET /api/student/assignments  -> list
  router.get('/', async (req, res) => {
    try {
      const studentId = req.user?.id || req.query.student_id;
      if (!studentId) return res.status(400).json({ error: 'student_id required' });

      const [rows] = await pool.query(
        `SELECT a.assignment_id, a.title, a.deadline,
                CASE WHEN s.submission_id IS NOT NULL THEN 'submitted'
                     WHEN NOW() > a.deadline THEN 'closed'
                     ELSE 'open' END AS status,
                s.score, s.submitted_at
         FROM assignments a
         LEFT JOIN assignment_submissions s ON s.assignment_id = a.assignment_id AND s.student_id = ?
         ORDER BY a.created_at DESC`,
        [studentId]
      );

      res.json({ ok: true, assignments: rows });
    } catch (err) {
      console.error('GET /api/student/assignments error', err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  // GET /api/student/assignments/:assignmentId -> details (no is_correct)
  router.get('/:assignmentId', async (req, res) => {
    try {
      const aid = Number(req.params.assignmentId);
      const studentId = req.user?.id || req.query.student_id;
      if (!aid || !studentId) return res.status(400).json({ error: 'assignment_id & student required' });

      const [arow] = await pool.query('SELECT assignment_id, title, description, deadline FROM assignments WHERE assignment_id = ?', [aid]);
      if (!arow.length) return res.status(404).json({ error: 'not_found' });
      const assignment = arow[0];

      const [questions] = await pool.query(
        `SELECT q.question_id, q.position, q.question_text,
                JSON_ARRAYAGG(JSON_OBJECT('label', o.label, 'text', o.option_text) ORDER BY o.label) AS options
         FROM assignment_questions q
         JOIN assignment_options o ON o.question_id = q.question_id
         WHERE q.assignment_id = ?
         GROUP BY q.question_id, q.position, q.question_text
         ORDER BY q.position`,
        [aid]
      );

      const qRows = questions.map(q => ({ question_id: q.question_id, position: q.position, question_text: q.question_text, options: JSON.parse(q.options) }));

      const [srows] = await pool.query('SELECT submission_id, status, last_saved_at, submitted_at, score FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?', [aid, studentId]);
      const submission = srows[0] || null;
      let answers = {};
      if (submission) {
        const [ans] = await pool.query('SELECT question_id, selected_label FROM assignment_answers WHERE submission_id = ?', [submission.submission_id]);
        answers = ans.reduce((acc, r) => { acc[r.question_id] = r.selected_label; return acc; }, {});
      }

      res.json({ ok: true, assignment, questions: qRows, submission, answers });
    } catch (err) {
      console.error('GET assignment details error', err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  // POST autosave
  router.post('/:assignmentId/autosave', async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const aid = Number(req.params.assignmentId);
      const studentId = req.user?.id || req.body.student_id || req.query.student_id;
      const answers = req.body.answers || [];
      if (!aid || !studentId) { conn.release(); return res.status(400).json({ error: 'assignment_id & student required' }); }

      const [arow] = await pool.query('SELECT deadline FROM assignments WHERE assignment_id = ?', [aid]);
      if (!arow.length) { conn.release(); return res.status(404).json({ error: 'not_found' }); }
      const deadline = new Date(arow[0].deadline);
      if (new Date() > deadline) { conn.release(); return res.status(400).json({ error: 'deadline_passed' }); }

      await conn.beginTransaction();

      await conn.query(`
        INSERT INTO assignment_submissions (assignment_id, student_id, status, last_saved_at)
        VALUES (?, ?, 'in_progress', NOW())
        ON DUPLICATE KEY UPDATE last_saved_at = NOW(), status = 'in_progress'
      `, [aid, studentId]);

      const [srows] = await conn.query('SELECT submission_id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?', [aid, studentId]);
      const subId = srows[0].submission_id;

      for (const a of answers) {
        await conn.query(`
          INSERT INTO assignment_answers (submission_id, question_id, selected_label)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE selected_label = VALUES(selected_label)
        `, [subId, a.question_id, a.selected]);
      }

      await conn.commit();
      conn.release();
      res.json({ ok: true, last_saved_at: new Date().toISOString() });
    } catch (err) {
      await conn.rollback().catch(()=>{});
      conn.release();
      console.error('autosave failed', err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  // POST submit (grade)
  router.post('/:assignmentId/submit', async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const aid = Number(req.params.assignmentId);
      const studentId = req.user?.id || req.body.student_id || req.query.student_id;
      if (!aid || !studentId) { conn.release(); return res.status(400).json({ error: 'assignment_id & student required' }); }

      const [arow] = await conn.query('SELECT deadline FROM assignments WHERE assignment_id = ?', [aid]);
      if (!arow.length) { conn.release(); return res.status(404).json({ error: 'not_found' }); }
      const deadline = new Date(arow[0].deadline);
      if (new Date() > deadline) { conn.release(); return res.status(400).json({ error: 'deadline_passed' }); }

      await conn.beginTransaction();

      await conn.query(`
        INSERT INTO assignment_submissions (assignment_id, student_id, status, last_saved_at)
        VALUES (?, ?, 'in_progress', NOW())
        ON DUPLICATE KEY UPDATE last_saved_at = NOW()
      `, [aid, studentId]);

      const [srows] = await conn.query('SELECT submission_id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?', [aid, studentId]);
      const subId = srows[0].submission_id;

      const answers = req.body.answers || [];
      for (const a of answers) {
        await conn.query(`
          INSERT INTO assignment_answers (submission_id, question_id, selected_label)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE selected_label = VALUES(selected_label)
        `, [subId, a.question_id, a.selected]);
      }

      // grade correctness
      await conn.query(`
        UPDATE assignment_answers aa
        JOIN assignment_options ao ON ao.question_id = aa.question_id AND ao.label = aa.selected_label
        SET aa.correct = 1
        WHERE aa.submission_id = ? AND ao.is_correct = 1
      `, [subId]);

      await conn.query(`
        UPDATE assignment_answers aa
        SET aa.correct = 0
        WHERE aa.submission_id = ? AND (aa.selected_label IS NULL OR aa.correct IS NULL)
      `, [subId]);

      const [agg] = await conn.query(`
        SELECT SUM(COALESCE(correct,0)) AS correct_count, COUNT(q.question_id) AS total_q
        FROM assignment_questions q
        LEFT JOIN assignment_answers aa ON aa.question_id = q.question_id AND aa.submission_id = ?
        WHERE q.assignment_id = ?
      `, [subId, aid]);

      const correct_count = Number(agg[0].correct_count || 0);
      const total_q = Number(agg[0].total_q || 0);
      const score = total_q ? Math.round((correct_count / total_q) * 10000) / 100 : 0;

      await conn.query('UPDATE assignment_submissions SET score = ?, status = "submitted", submitted_at = NOW(), updated_at = NOW() WHERE submission_id = ?', [score, subId]);

      await conn.commit();
      conn.release();

      // optional real-time notify prof
      if (io) {
        try { io.to(`assignment-${aid}`).emit('submission', { student_id: studentId, score, submitted_at: new Date().toISOString() }); } catch(e) {}
      }

      return res.json({ ok: true, score, correct_count, total_q });
    } catch (err) {
      await conn.rollback().catch(()=>{});
      conn.release();
      console.error('submit error', err);
      res.status(500).json({ error: 'db_error' });
    }
  });

  return router;
};
