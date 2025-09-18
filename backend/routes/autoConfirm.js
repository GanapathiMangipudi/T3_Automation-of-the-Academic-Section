const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

// Run auto-confirm manually or via cron
router.post("/run", async (req, res) => {
  try {
    // Step 1: find pending > 2 hours
    const [rows] = await pool.query(
      `SELECT id FROM course_responses
       WHERE status = 'pending'
       AND TIMESTAMPDIFF(HOUR, selected_at, NOW()) >= 2`
    );

    let updatedCount = 0;
    for (const row of rows) {
      await pool.query(
        `UPDATE course_responses
         SET status = 'confirmed',
             confirmed_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [row.id]
      );
      updatedCount++;
    }

    res.json({ ok: true, checked: rows.length, confirmed: updatedCount });
  } catch (err) {
    console.error("AutoConfirm error:", err);
    res.status(500).json({ error: "auto_confirm_failed", details: err.message });
  }
});

module.exports = router;
