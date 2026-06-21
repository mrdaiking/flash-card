const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/stats', (req, res) => {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartSec = Math.floor(todayStart.getTime() / 1000);

  const total_cards = db.prepare('SELECT COUNT(*) as c FROM cards').get().c;
  const due_today = db.prepare('SELECT COUNT(*) as c FROM cards WHERE next_review <= ?').get(now).c;
  const reviewed_today = db.prepare('SELECT COUNT(*) as c FROM reviews WHERE reviewed_at >= ?').get(todayStartSec).c;

  const days = db.prepare(`
    SELECT DISTINCT date(reviewed_at, 'unixepoch', 'localtime') as day
    FROM reviews ORDER BY day DESC LIMIT 365
  `).all();

  let streak_days = 0;
  for (let i = 0; i < days.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    if (days[i].day === expected.toLocaleDateString('en-CA')) streak_days++;
    else break;
  }

  res.json({ total_cards, due_today, streak_days, reviewed_today });
});

router.get('/stats/weekly', (req, res) => {
  const rows = db.prepare(`
    SELECT date(reviewed_at, 'unixepoch', 'localtime') as day, COUNT(*) as count
    FROM reviews
    WHERE reviewed_at >= unixepoch('now', '-6 days', 'start of day')
    GROUP BY day ORDER BY day ASC
  `).all();

  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toLocaleDateString('en-CA');
    const found = rows.find(r => r.day === day);
    result.push({ day, count: found ? found.count : 0 });
  }
  res.json(result);
});

module.exports = router;
