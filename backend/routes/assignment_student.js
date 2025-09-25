// backend/routes/assignment_student.js
const express = require('express');

console.log('[ROUTER LOAD] assignment_student router loaded');


module.exports = (pool, io) => {
  const router = express.Router();

  // ---------- helper ----------
  function resolveStudentId(req) {
    // Prefer explicit query param (matches your PowerShell tests)
    if (req.query?.student_id) {
      const n = Number(req.query.student_id);
      return Number.isFinite(n) ? n : null;
    }
    // Fallback to req.user if you later add auth middleware
    if (req.user?.id) {
      const n = Number(req.user.id);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

// LIST: GET /api/student/assignments  (DEBUG VERSION - paste exactly)
router.get('/', async (req, res) => {
  console.log('[DBG ROUTE START] /api/student/assignments', {
    time: new Date().toISOString(),
    baseUrl: req.baseUrl,
    path: req.path,
    originalUrl: req.originalUrl,
    query: req.query,
    user: req.user
  });

  try {
    const studentId = resolveStudentId(req);
    console.log('[DBG ROUTE] resolved studentId =', studentId);

    if (!studentId) {
      console.log('[DBG ROUTE] missing studentId -> 400');
      return res.status(400).json({ ok: false, error: 'student_id_required' });
    }

    const [rows] = await pool.query(
      `SELECT DISTINCT a.assignment_id,
       a.title,
       a.description,
       a.deadline,
       CASE WHEN s.submission_id IS NOT NULL THEN 'submitted'
            WHEN NOW() > a.deadline THEN 'closed'
            ELSE 'open' END AS status,
       s.score,
       s.submitted_at
FROM assignments a
JOIN courses c ON LOWER(c.code) = LOWER(a.course_id)
JOIN course_responses cr ON cr.course_id = c.course_id
LEFT JOIN assignment_submissions s
       ON s.assignment_id = a.assignment_id AND s.student_id = cr.student_id
WHERE cr.student_id = ?
  AND cr.response_status = 'selected'
ORDER BY a.deadline DESC`,
      [studentId]
    );

    console.log('[DBG ROUTE] assignments rows count =', Array.isArray(rows) ? rows.length : typeof rows);
    return res.json({ ok: true, assignments: rows || [] });
  } catch (err) {
    console.error('[DBG ROUTE] error', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: 'db_error' });
  }
});




  // ---------- DETAIL: GET /api/student/assignments/:assignmentId ----------
  router.get('/:assignmentId', async (req, res) => {
    try {
      const aid = Number(req.params.assignmentId);
      const studentId = resolveStudentId(req);

      console.log('--- DBG assignment detail request ---', {
        params: req.params,
        query: req.query,
        user: req.user,
        resolvedStudentId: studentId,
        aid
      });

      if (!aid) return res.status(400).json({ ok: false, error: 'invalid_assignment_id' });
      if (!studentId) return res.status(400).json({ ok: false, error: 'student_id_required' });

      const [arow] = await pool.query(
        'SELECT assignment_id, title, description, deadline FROM assignments WHERE assignment_id = ?',
        [aid]
      );
      if (!arow.length) return res.status(404).json({ ok: false, error: 'not_found' });
      const assignment = arow[0];

      // fetch questions
      const [qrows] = await pool.query(
        `SELECT question_id, position, question_text
         FROM assignment_questions
         WHERE assignment_id = ?
         ORDER BY position`,
        [aid]
      );

      const qRows = qrows.map(q => ({
        question_id: q.question_id,
        position: q.position,
        question_text: q.question_text,
        options: []
      }));

      // fetch options for these questions
      if (qRows.length > 0) {
        const qids = qRows.map(q => q.question_id);
        const [optsRows] = await pool.query(
          `SELECT question_id, label, option_text
           FROM assignment_options
           WHERE question_id IN (?)
           ORDER BY question_id, label`,
          [qids]
        );

        const optsByQ = {};
        for (const o of optsRows) {
          if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
          optsByQ[o.question_id].push({ label: o.label, text: o.option_text });
        }

        for (const q of qRows) {
          q.options = optsByQ[q.question_id] || [];
        }
      }

      // fetch submission (if any)
      const [srows] = await pool.query(
        'SELECT submission_id, status, last_saved_at, submitted_at, score FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?',
        [aid, studentId]
      );
      const submission = srows[0] || null;

      let answers = {};
      if (submission) {
        const [ans] = await pool.query(
          'SELECT question_id, selected_label FROM assignment_answers WHERE submission_id = ?',
          [submission.submission_id]
        );
        answers = ans.reduce((acc, r) => {
          acc[r.question_id] = r.selected_label;
          return acc;
        }, {});
      }

      const annotatedQuestions = qRows.map(q => ({ ...q, selected: answers[q.question_id] ?? null }));

      return res.json({ ok: true, assignment, questions: annotatedQuestions, submission, answers });
    } catch (err) {
      console.error('GET assignment details error', err);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }
  });

  // ---------- AUTOSAVE: POST /:assignmentId/autosave ----------
  router.post('/:assignmentId/autosave', async (req, res) => {
    let conn;
    try {
      const aid = Number(req.params.assignmentId);
      const studentId = resolveStudentId(req);
      const answers = Array.isArray(req.body.answers) ? req.body.answers : [];

      if (!aid || !studentId) return res.status(400).json({ ok: false, error: 'assignment_id & student required' });

      const [arow] = await pool.query('SELECT deadline FROM assignments WHERE assignment_id = ?', [aid]);
      if (!arow.length) return res.status(404).json({ ok: false, error: 'not_found' });
      const deadline = new Date(arow[0].deadline);
      if (new Date() > deadline) return res.status(400).json({ ok: false, error: 'deadline_passed' });

      conn = await pool.getConnection();
      await conn.beginTransaction();

      // create or update submission row
      await conn.query(`
        INSERT INTO assignment_submissions (assignment_id, student_id, status, last_saved_at)
        VALUES (?, ?, 'in_progress', NOW())
        ON DUPLICATE KEY UPDATE last_saved_at = NOW(), status = 'in_progress'
      `, [aid, studentId]);

      const [srows] = await conn.query('SELECT submission_id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?', [aid, studentId]);
      const subId = srows[0].submission_id;

      // validate and upsert answers
      for (const a of answers) {
        const qid = Number(a.question_id);
        const sel = a.selected ?? null;
        if (!Number.isFinite(qid)) continue; // skip invalid question ids
        await conn.query(`
          INSERT INTO assignment_answers (submission_id, question_id, selected_label)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE selected_label = VALUES(selected_label)
        `, [subId, qid, sel]);
      }

      await conn.commit();
      return res.json({ ok: true, last_saved_at: new Date().toISOString() });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch (e) {}
      }
      console.error('autosave failed', err);
      return res.status(500).json({ ok: false, error: 'db_error' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ---------- SUBMIT: POST /:assignmentId/submit ----------
  router.post('/:assignmentId/submit', async (req, res) => {
    let conn;
    try {
      const aid = Number(req.params.assignmentId);
      const studentId = resolveStudentId(req);
      if (!aid || !studentId) return res.status(400).json({ ok: false, error: 'assignment_id & student required' });

      const [arow] = await pool.query('SELECT deadline FROM assignments WHERE assignment_id = ?', [aid]);
      if (!arow.length) return res.status(404).json({ ok: false, error: 'not_found' });
      const deadline = new Date(arow[0].deadline);
      if (new Date() > deadline) return res.status(400).json({ ok: false, error: 'deadline_passed' });

      conn = await pool.getConnection();
      await conn.beginTransaction();

      // ensure submission row exists (keeps last_saved_at)
      await conn.query(`
        INSERT INTO assignment_submissions (assignment_id, student_id, status, last_saved_at)
        VALUES (?, ?, 'in_progress', NOW())
        ON DUPLICATE KEY UPDATE last_saved_at = NOW()
      `, [aid, studentId]);

      const [srows] = await conn.query('SELECT submission_id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?', [aid, studentId]);
      const subId = srows[0].submission_id;

      // store answers
      const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
      for (const a of answers) {
        const qid = Number(a.question_id);
        const sel = a.selected ?? null;
        if (!Number.isFinite(qid)) continue;
        await conn.query(`
          INSERT INTO assignment_answers (submission_id, question_id, selected_label)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE selected_label = VALUES(selected_label)
        `, [subId, qid, sel]);
      }

      // mark correct answers (assumes assignment_options.has is_correct flag)
      await conn.query(`
        UPDATE assignment_answers aa
        JOIN assignment_options ao ON ao.question_id = aa.question_id AND ao.label = aa.selected_label
        SET aa.correct = 1
        WHERE aa.submission_id = ? AND ao.is_correct = 1
      `, [subId]);

      // set remaining answers to incorrect (or 0)
      await conn.query(`
        UPDATE assignment_answers aa
        SET aa.correct = 0
        WHERE aa.submission_id = ? AND (aa.selected_label IS NULL OR aa.correct IS NULL)
      `, [subId]);

      // aggregate score
      const [agg] = await conn.query(`
        SELECT COALESCE(SUM(CASE WHEN aa.correct = 1 THEN 1 ELSE 0 END),0) AS correct_count,
               COUNT(q.question_id) AS total_q
        FROM assignment_questions q
        LEFT JOIN assignment_answers aa ON aa.question_id = q.question_id AND aa.submission_id = ?
        WHERE q.assignment_id = ?
      `, [subId, aid]);

      const correct_count = Number(agg[0].correct_count || 0);
      const total_q = Number(agg[0].total_q || 0);
      const score = total_q ? Math.round((correct_count / total_q) * 10000) / 100 : 0;

      await conn.query('UPDATE assignment_submissions SET score = ?, status = "submitted", submitted_at = NOW(), updated_at = NOW() WHERE submission_id = ?', [score, subId]);

      await conn.commit();

      // notify via socket.io if available
      if (io) {
        try {
          io.to(`assignment-${aid}`).emit('submission', { student_id: studentId, score, submitted_at: new Date().toISOString() });
        } catch (e) {}
      }

      return res.json({ ok: true, score, correct_count, total_q });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch (e) {}
      }
      console.error('submit error', err);
      return res.status(500).json({ ok: false, error: 'db_error' });
    } finally {
      if (conn) conn.release();
    }
  });

  return router;
};
