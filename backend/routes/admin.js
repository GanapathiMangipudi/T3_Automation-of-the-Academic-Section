// backend/routes/admin.js
const express = require('express');
const bcrypt = require('bcrypt');

module.exports = function (pool) {
  const router = express.Router();

    

  // POST /admin/students
  router.post('/students', async (req, res) => {
    try {
      console.log('ADMIN /students body:', req.body || {});
      const { student_id, name, email, password, program, year } = req.body || {};

      // validation
      const missing = [];
      if (!student_id) missing.push('student_id');
      if (!name) missing.push('name');
      if (!email) missing.push('email');
      if (!password) missing.push('password');
      if (missing.length) return res.status(400).json({ error: 'Missing fields', missing });

      if (!pool || !pool.query) {
        console.error('DB pool not available');
        return res.status(500).json({ error: 'DB not available' });
      }

      // PROMISE-WRAP bcrypt.hash (works with callback-only or promise versions)
      const hashPassword = (plain) =>
        new Promise((resolve, reject) => {
          try {
            const p = bcrypt.hash(String(plain), 10, (err, hashed) => {
              if (err) return reject(err);
              resolve(hashed);
            });
            if (p && typeof p.then === 'function') {
              p.then(resolve).catch(reject);
            }
          } catch (e) {
            reject(e);
          }
        });

      // PROMISE-WRAP pool.query with a small timeout (in case driver is callback-only)
      const runQuery = (sql, params, msTimeout = 10_000) =>
        new Promise((resolve, reject) => {
          let finished = false;
          const timer = setTimeout(() => {
            if (!finished) {
              finished = true;
              const err = new Error('DB query timed out');
              err.code = 'DB_TIMEOUT';
              reject(err);
            }
          }, msTimeout);

          try {
            const maybe = pool.query(sql, params, (err, results) => {
              if (finished) return;
              finished = true;
              clearTimeout(timer);
              if (err) return reject(err);
              resolve(results);
            });

            if (maybe && typeof maybe.then === 'function') {
              maybe
                .then((r) => {
                  if (finished) return;
                  finished = true;
                  clearTimeout(timer);
                  resolve(r);
                })
                .catch((err) => {
                  if (finished) return;
                  finished = true;
                  clearTimeout(timer);
                  reject(err);
                });
            }
          } catch (e) {
            if (!finished) {
              finished = true;
              clearTimeout(timer);
              reject(e);
            }
          }
        });

      // hash the password (safe)
      const hashed = await hashPassword(password);

      const sql = `INSERT INTO students (student_id, name, email, password_hash, program, year)
                   VALUES (?, ?, ?, ?, ?, ?)`;
      const params = [String(student_id), String(name), String(email), hashed, program || null, year || null];

      // run the query with timeout (safe)
      await runQuery(sql, params, 10_000);

      return res.json({ success: true });
    } catch (err) {
      console.error('Insert student failed:', err && err.stack ? err.stack : err);
      return res.status(500).json({ error: 'DB insert failed', details: err && err.message });
    }
  });

  // return the configured router so the server can mount it
  return router;
};
