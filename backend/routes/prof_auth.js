// backend/routes/prof_auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

module.exports = function (pool) {
  const router = express.Router();
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
  const JWT_EXPIRES = '6h';

  router.post('/professor/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ ok: false, error: 'username and password required' });

      const [rows] = await pool.query('SELECT * FROM professors WHERE username = ? LIMIT 1', [username]);
      if (!rows || rows.length === 0) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

      const prof = rows[0];
      const hash = prof.password_hash || prof.password || '';

      let match = false;
      if (hash && hash.startsWith('$2')) {
        match = await bcrypt.compare(password, hash);
      } else if (hash) {
        match = password === hash; // dev fallback only
        console.warn('[prof_auth] plaintext fallback used — hash passwords for production');
      }

      if (!match) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

      const payload = { prof_id: prof.username || prof.prof_id || prof.id, username: prof.username, department: prof.department || null };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

      return res.json({ ok: true, token, prof: { username: prof.username, full_name: prof.full_name, department: prof.department } });
    } catch (err) {
      console.error('POST /auth/professor/login error', err && (err.stack || err.message));
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  });

  return router;
};
