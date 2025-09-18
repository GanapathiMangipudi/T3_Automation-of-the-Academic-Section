// backend/routes/auth.js
console.log('[DEBUG] routes/auth.js loaded');

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // you can use bcrypt if you prefer
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
let pool; // assigned in module.exports

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const SALT_ROUNDS = Number(process.env.SALT_ROUNDS) || 10;

// Helper: sign token
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

// ---------------- LOGIN ----------------
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }

    // try admins first
    let [rows] = await pool.execute(
      'SELECT * FROM admins WHERE username = ? LIMIT 1',
      [username]
    );
    if (rows.length === 0) {
      // then professors
      [rows] = await pool.execute(
        'SELECT * FROM professors WHERE username = ? LIMIT 1',
        [username]
      );
    }
    if (rows.length === 0) {
      // then students (by student_id)
      [rows] = await pool.execute(
        'SELECT * FROM students WHERE student_id = ? LIMIT 1',
        [username]
      );
    }

    if (rows.length === 0) return res.status(401).json({ error: 'invalid_credentials' });

    const user = rows[0];
    const hash = user.password_hash || user.password;

    const ok = await bcrypt.compare(password, hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const role = user.admin_id ? 'admin' : user.department ? 'professor' : 'student';
    const token = signToken({ id: user.id || user.username || user.student_id, username, role });

    return res.json({ ok: true, token, role, username });
  } catch (err) {
    console.error('POST /auth/login error', err);
    return res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

// ---------------- CREATE ----------------
router.post('/create', async (req, res) => {
  try {
    const {
      student_id,   // for students
      username,     // for professors/admins
      password,
      full_name,
      email,
      department    // only for professors
    } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'missing_password' });
    }

    // STUDENT
    if (student_id) {
      console.log('[auth.create] detected STUDENT create for:', student_id);

      const [existing] = await pool.execute(
        'SELECT 1 FROM students WHERE student_id = ? LIMIT 1',
        [student_id]
      );
      if (existing.length > 0) return res.status(409).json({ error: 'student_exists' });

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await pool.execute(
        'INSERT INTO students (student_id, password_hash, full_name, email) VALUES (?, ?, ?, ?)',
        [student_id, hash, full_name || null, email || null]
      );

      return res.status(201).json({ ok: true, inserted: { table: 'students', id: student_id } });
    }

    // PROFESSOR
    if (username && department) {
      console.log('[auth.create] detected PROFESSOR create for:', username);

      const [existingProf] = await pool.execute(
        'SELECT 1 FROM professors WHERE username = ? LIMIT 1',
        [username]
      );
      if (existingProf.length > 0) return res.status(409).json({ error: 'professor_exists' });

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await pool.execute(
        'INSERT INTO professors (username, password_hash, full_name, department, email) VALUES (?, ?, ?, ?, ?)',
        [username, hash, full_name || null, department, email || null]
      );

      return res.status(201).json({ ok: true, inserted: { table: 'professors', id: username } });
    }

    // ADMIN
    if (username) {
      console.log('[auth.create] detected ADMIN create for:', username);

      const [existingAdmin] = await pool.execute(
        'SELECT 1 FROM admins WHERE username = ? LIMIT 1',
        [username]
      );
      if (existingAdmin.length > 0) return res.status(409).json({ error: 'admin_exists' });

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await pool.execute(
        'INSERT INTO admins (username, password_hash, full_name, email) VALUES (?, ?, ?, ?)',
        [username, hash, full_name || null, email || null]
      );

      return res.status(201).json({ ok: true, inserted: { table: 'admins', id: username } });
    }

    // Nothing matched
    return res.status(400).json({
      error: 'missing_identifier',
      details: 'provide student_id (for students), or username (for professors/admins)'
    });
  } catch (err) {
    console.error('[auth.create] ERROR', err.code, err.sqlMessage || err.message, err.sql);
    return res.status(500).json({ error: 'internal_error', details: err.sqlMessage || err.message });
  }
});

// ---------------- EXPORT ----------------
module.exports = (dbPool) => {
  pool = dbPool;
  return router;
};
