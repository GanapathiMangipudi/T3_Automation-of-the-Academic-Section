

const express = require("express");

module.exports = (pool, io) => {
  const router = express.Router();

  // POST /api/professors/assignments
  router.post('/', async (req, res) => {
  if (!(req.professor && req.professor.username)) {
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
const marksVal = Number(q.marks ?? q.points ?? 1);
if (!Number.isFinite(marksVal) || marksVal < 0) {
  return res.status(400).json({ error: 'invalid_marks', details: `bad marks for question ${i}` });
}

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
        const marks = Number.isFinite(Number(q.marks)) ? Number(q.marks) : 1;
        const [qr] = await conn.query(
          `INSERT INTO assignment_questions (assignment_id, position, question_text,marks) VALUES (?, ?, ?,?)`,
          [assignmentId, position, q.question_text,marks]
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
      try { conn.release(); } catch(_) {}
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

  // PUT /api/professors/assignments/:id
router.put('/:id', async (req, res) => {
  if (!(req.professor && req.professor.username)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const assignmentId = Number(req.params.id);
  if (!assignmentId) return res.status(400).json({ error: 'assignment_id required' });

  const payload = req.body || {};
  const { course_id, title, description = '', deadline, questions } = payload;
  if (!course_id || !title || !deadline || !Array.isArray(questions)) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (questions.length !== 5) {
    return res.status(400).json({ error: 'invalid_questions', details: 'require exactly 5 questions' });
  }

  // re-use the same validation you used in POST: check options, labels, exactly one is_correct, marks sanity
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q.question_text !== 'string' || !Array.isArray(q.options) || q.options.length !== 4) {
      return res.status(400).json({ error: 'invalid_question', details: `bad question ${i}` });
    }
    let correctCount = 0;
    const seen = new Set();
    for (const opt of q.options) {
      if (!opt || typeof opt.label !== 'string' || typeof opt.text !== 'string') return res.status(400).json({ error: 'invalid_option' });
      const L = opt.label.trim().toUpperCase();
      if (!['A','B','C','D'].includes(L)) return res.status(400).json({ error: 'invalid_option_label' });
      if (seen.has(L)) return res.status(400).json({ error: 'duplicate_option_label' });
      seen.add(L);
      if (opt.is_correct) correctCount++;
    }
    if (correctCount !== 1) return res.status(400).json({ error: 'invalid_correct_option' });

    const marksVal = Number.isFinite(Number(q.marks)) ? Number(q.marks) : 1;
    if (!Number.isFinite(marksVal) || marksVal < 0) return res.status(400).json({ error: 'invalid_marks', details: `bad marks for question ${i}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Update assignment metadata
    await conn.query(
      `UPDATE assignments SET course_id = ?, title = ?, description = ?, deadline = ?, updated_at = NOW() WHERE assignment_id = ?`,
      [course_id, title, description, new Date(deadline), assignmentId]
    );

    // Delete existing options then questions for this assignment
    // Delete options using join (safe)
    await conn.query(
      `DELETE ao FROM assignment_options ao JOIN assignment_questions aq ON ao.question_id = aq.question_id WHERE aq.assignment_id = ?`,
      [assignmentId]
    );
    await conn.query(`DELETE FROM assignment_questions WHERE assignment_id = ?`, [assignmentId]);

    // Reinsert questions and options (including marks)
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const position = typeof q.position === 'number' ? q.position : (i + 1);
      const marks = Number.isFinite(Number(q.marks)) ? Number(q.marks) : 1;

      const [qr] = await conn.query(
        `INSERT INTO assignment_questions (assignment_id, position, question_text, marks) VALUES (?, ?, ?, ?)`,
        [assignmentId, position, q.question_text, marks]
      );
      const questionId = qr.insertId;

      for (const optRaw of q.options) {
        const label = optRaw.label.trim().toUpperCase();
        const optionText = optRaw.text;
        const isCorrect = optRaw.is_correct ? 1 : 0;
        await conn.query(
          `INSERT INTO assignment_options (question_id, label, option_text, is_correct) VALUES (?, ?, ?, ?)`,
          [questionId, label, optionText, isCorrect]
        );
      }
    }

    await conn.commit();
    conn.release();

    // optional: notify students via io
    if (io) {
      try { io.emit('assignment:updated', { assignment_id: assignmentId, course_id }); } catch(e) {}
    }

        // Re-fetch the updated assignment (with questions + options)
    const [rows] = await conn.query(
      `SELECT a.assignment_id, a.course_id, a.title, a.description, a.deadline, a.updated_at,
              q.question_id, q.position, q.question_text, q.marks,
              o.option_id, o.label, o.option_text, o.is_correct
       FROM assignments a
       LEFT JOIN assignment_questions q ON q.assignment_id = a.assignment_id
       LEFT JOIN assignment_options o ON o.question_id = q.question_id
       WHERE a.assignment_id = ?
       ORDER BY q.position, o.label`,
      [assignmentId]
    );

     await conn.commit();
    conn.release();

    // Build assignment object
    let assignment = null;
    const questionsMap = new Map();
    for (const r of rows) {
      if (!assignment) {
        assignment = {
          id: r.assignment_id,
          course_id: r.course_id,
          title: r.title,
          description: r.description,
          deadline: r.deadline,
          updated_at: r.updated_at,
          questions: []
        };
      }
      if (r.question_id) {
        if (!questionsMap.has(r.question_id)) {
          const qObj = {
            id: r.question_id,
            position: r.position,
            question_text: r.question_text,
            marks: r.marks,
            options: []
          };
          questionsMap.set(r.question_id, qObj);
          assignment.questions.push(qObj);
        }
        const qObj = questionsMap.get(r.question_id);
        if (r.option_id) {
          qObj.options.push({
            id: r.option_id,
            label: r.label,
            text: r.option_text,
            is_correct: !!r.is_correct
          });
        }
      }
    }

    return res.json({ ok: true, assignment });


  } catch (err) {
    try { await conn.rollback(); } catch(_) {}
    try { conn.release(); } catch(_) {}
    console.error('prof update assignment error', err);
    return res.status(500).json({ error: 'db_error', details: err.message });
  }
});


  return router;
};
