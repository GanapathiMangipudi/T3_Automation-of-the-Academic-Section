// routes/courses.js
module.exports = function(pool) {
  const express = require('express');
  const router = express.Router();
  const DB_NAME = process.env.DB_NAME || process.env.MYSQL_DATABASE || null;

  router.get('/', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      if (DB_NAME) {
        await conn.query(`USE \`${DB_NAME}\``);
      }
      const [rows] = await conn.query(
        'SELECT course_id, code, title, term, seats_total, seats_available, schedule FROM courses ORDER BY course_id'
      );
      res.json({ data: rows });
    } catch (err) {
      console.error('GET /api/courses - DB error fetching courses:', err && (err.stack || err.message || err));
      res.status(500).json({ ok: false, error: 'DB error fetching courses' });
    } finally {
      if (conn) try { conn.release(); } catch (e) {}
    }
  });

  return router;
};
