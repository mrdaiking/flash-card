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
  // "Mature" = interval >= 21 days (Anki's threshold): words you truly retain.
  const mature_cards = db.prepare('SELECT COUNT(*) as c FROM cards WHERE interval >= 21').get().c;
  const words_this_week = db.prepare(
    "SELECT COUNT(*) as c FROM cards WHERE created_at >= unixepoch('now', '-6 days', 'start of day')"
  ).get().c;

  const days = db.prepare(`
    SELECT DISTINCT date(reviewed_at, 'unixepoch', 'localtime') as day
    FROM reviews ORDER BY day DESC LIMIT 365
  `).all();

  // A streak still counts until today is over: if nothing is reviewed yet
  // today, count back from yesterday.
  let streak_days = 0;
  const offset = days[0]?.day === new Date().toLocaleDateString('en-CA') ? 0 : 1;
  for (let i = 0; i < days.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i - offset);
    if (days[i].day === expected.toLocaleDateString('en-CA')) streak_days++;
    else break;
  }

  // Seconds per card, for "about N min": median gap between consecutive
  // reviews in the last 500, ignoring gaps over 2 min (breaks, new sessions).
  const times = db.prepare('SELECT reviewed_at FROM reviews ORDER BY reviewed_at DESC LIMIT 500').all().map(r => r.reviewed_at);
  const gaps = times.slice(1).map((t, i) => times[i] - t).filter(g => g > 0 && g <= 120).sort((a, b) => a - b);
  const sec_per_card = gaps.length >= 20 ? gaps[Math.floor(gaps.length / 2)] : 10;

  res.json({ total_cards, due_today, streak_days, reviewed_today, mature_cards, words_this_week, sec_per_card });
});

// Last-7-day recap: new cards (with their deck, for the language tag and a
// tap-to-edit link) and how the week's reviews went.
router.get('/recap', (req, res) => {
  const cutoff = "unixepoch('now', '-6 days', 'start of day')";
  const new_words = db.prepare(
    `SELECT c.id, c.front, c.back, c.type, c.created_at, c.deck_id, d.name AS deck_name
     FROM cards c JOIN decks d ON d.id = c.deck_id
     WHERE c.created_at >= ${cutoff} ORDER BY c.created_at DESC`
  ).all();
  const r = db.prepare(`
    SELECT COUNT(*) AS reviews, COALESCE(SUM(rating = 1), 0) AS forgot,
      COUNT(DISTINCT date(reviewed_at, 'unixepoch', 'localtime')) AS days
    FROM reviews WHERE reviewed_at >= ${cutoff}
  `).get();
  res.json({
    new_words,
    new_word_count: new_words.length,
    reviews_done: r.reviews,
    forgot: r.forgot,
    days_studied: r.days,
  });
});

// Cumulative vocabulary size per day (for growth line chart).
router.get('/stats/vocab-growth', (req, res) => {
  const days = Math.min(Number(req.query.days) || 90, 365);
  const rows = db.prepare(`
    SELECT date(created_at, 'unixepoch', 'localtime') as day, COUNT(*) as count
    FROM cards GROUP BY day ORDER BY day ASC
  `).all();

  // Build cumulative totals across the requested window.
  const result = [];
  let running = 0;
  const byDay = new Map(rows.map(r => [r.day, r.count]));
  // total that existed before the window start
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);
  for (const r of rows) {
    if (new Date(r.day + 'T12:00:00') < startDate) running += r.count;
  }
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toLocaleDateString('en-CA');
    running += byDay.get(day) || 0;
    result.push({ day, total: running });
  }
  res.json(result);
});

// Daily review activity for a GitHub-style heatmap.
router.get('/stats/heatmap', (req, res) => {
  const weeks = Math.min(Number(req.query.weeks) || 12, 53);
  const totalDays = weeks * 7;
  const reviews = db.prepare(`
    SELECT date(reviewed_at, 'unixepoch', 'localtime') as day, COUNT(*) as count
    FROM reviews GROUP BY day
  `).all();
  const map = new Map();
  for (const r of reviews) map.set(r.day, (map.get(r.day) || 0) + r.count);

  const result = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toLocaleDateString('en-CA');
    result.push({ day, count: map.get(day) || 0 });
  }
  res.json(result);
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
