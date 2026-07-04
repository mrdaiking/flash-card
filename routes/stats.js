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

  let streak_days = 0;
  for (let i = 0; i < days.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    if (days[i].day === expected.toLocaleDateString('en-CA')) streak_days++;
    else break;
  }

  res.json({ total_cards, due_today, streak_days, reviewed_today, mature_cards, words_this_week });
});

// Last-7-day recap: new words, reviews, journal entries.
router.get('/recap', (req, res) => {
  const cutoff = "unixepoch('now', '-6 days', 'start of day')";
  const new_words = db.prepare(
    `SELECT id, front, type, created_at FROM cards WHERE created_at >= ${cutoff} ORDER BY created_at DESC`
  ).all();
  const reviews_done = db.prepare(
    `SELECT COUNT(*) as c FROM reviews WHERE reviewed_at >= ${cutoff}`
  ).get().c;
  const journal_entries = db.prepare(
    `SELECT id, content, correction, words, created_at FROM journal_entries WHERE created_at >= ${cutoff} ORDER BY created_at DESC`
  ).all();
  res.json({
    new_words,
    new_word_count: new_words.length,
    reviews_done,
    journal_entries,
    journal_count: journal_entries.length,
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

// Daily activity (reviews + journal) for a GitHub-style heatmap.
router.get('/stats/heatmap', (req, res) => {
  const weeks = Math.min(Number(req.query.weeks) || 12, 53);
  const totalDays = weeks * 7;
  const reviews = db.prepare(`
    SELECT date(reviewed_at, 'unixepoch', 'localtime') as day, COUNT(*) as count
    FROM reviews GROUP BY day
  `).all();
  const journal = db.prepare(`
    SELECT date(created_at, 'unixepoch', 'localtime') as day, COUNT(*) as count
    FROM journal_entries GROUP BY day
  `).all();
  const map = new Map();
  for (const r of reviews) map.set(r.day, (map.get(r.day) || 0) + r.count);
  for (const j of journal) map.set(j.day, (map.get(j.day) || 0) + j.count);

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
