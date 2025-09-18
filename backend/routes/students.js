// backend/routes/students.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/students
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT student_id,name, email FROM students LIMIT 200'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/students db error', err);
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

// GET /api/students/:id
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await pool.query(
      'SELECT student_id, name, email FROM students WHERE student_id = ? LIMIT 1',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/students/:id db error', err);
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});




module.exports = router;
