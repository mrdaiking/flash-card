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

// ── Progress screen ──
// Days are cut in the CLIENT's timezone (?tz = minutes east of UTC); the server runs in UTC.
const dayOf = (sec, tz) => new Date((sec + tz * 60) * 1000).toISOString().slice(0, 10);
const tzOf = req => { const n = Number(req.query.tz); return Number.isFinite(n) && Math.abs(n) <= 840 ? n : 0; };

// Per-day { count, minutes, good } since `fromSec`. Minutes are estimated: the gap between consecutive
// reviews counts as study time when it is <= 2 min (longer gaps are breaks), same rule as sec_per_card.
// ponytail: reads every review in range; add a per-day rollup table if the log reaches millions.
function dailyActivity(fromSec, tz) {
  const rows = db.prepare('SELECT reviewed_at t, rating r FROM reviews WHERE reviewed_at >= ? ORDER BY reviewed_at').all(fromSec - 120);
  const days = new Map();
  let prev = null;
  for (const { t, r } of rows) {
    const gap = prev === null ? 0 : t - prev;
    prev = t;
    if (t < fromSec) continue;
    const d = days.get(dayOf(t, tz)) || { count: 0, sec: 0, good: 0 };
    d.count++;
    if (r >= 2) d.good++;
    if (gap > 0 && gap <= 120) d.sec += gap;
    days.set(dayOf(t, tz), d);
  }
  return days;
}

const isoDays = (n, tz) => Array.from({ length: n }, (_, i) => dayOf(Math.floor(Date.now() / 1000) - (n - 1 - i) * 86400, tz));

// Bars + totals for the Progress screen. week = last 7 days, month = last 30 days, year = last 12 months.
router.get('/stats/overview', (req, res) => {
  const tz = tzOf(req);
  const range = ['week', 'month', 'year'].includes(req.query.range) ? req.query.range : 'week';
  const nDays = { week: 7, month: 30, year: 365 }[range];
  const days = isoDays(nDays, tz);
  const act = dailyActivity(Math.floor(Date.now() / 1000) - nDays * 86400 - 86400, tz);
  const per = days.map(day => ({ day, ...(act.get(day) || { count: 0, sec: 0, good: 0 }) }));

  let buckets = per.map(d => ({ key: d.day, count: d.count, minutes: Math.round(d.sec / 60) }));
  if (range === 'year') {
    const m = new Map();
    for (const d of per) {
      const k = d.day.slice(0, 7);
      const b = m.get(k) || { key: k, count: 0, minutes: 0 };
      b.count += d.count; b.minutes += d.sec / 60;
      m.set(k, b);
    }
    buckets = [...m.values()].map(b => ({ ...b, minutes: Math.round(b.minutes) }));
  }
  const reviews = per.reduce((n, d) => n + d.count, 0);
  const good = per.reduce((n, d) => n + d.good, 0);
  const days_studied = per.filter(d => d.count).length;
  res.json({
    range, buckets, reviews, days_studied,
    minutes: Math.round(per.reduce((n, d) => n + d.sec, 0) / 60),
    avg_per_day: Math.round(reviews / nDays),
    retention: reviews ? Math.round((good / reviews) * 100) : null, // % of reviews not rated Again
  });
});

// Habit calendar: one month, each day with its estimated study minutes vs the daily goal.
router.get('/stats/habit', (req, res) => {
  const tz = tzOf(req);
  const month = /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : dayOf(Math.floor(Date.now() / 1000), tz).slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const startSec = Math.floor(Date.UTC(y, m - 1, 1) / 1000) - tz * 60;
  const act = dailyActivity(startSec, tz);
  const days = Array.from({ length: nDays }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, '0')}`;
    const a = act.get(day);
    return { day, count: a?.count || 0, minutes: a ? Math.round(a.sec / 6) / 10 : 0 };
  });
  res.json({ month, goal_minutes: db.prepare('SELECT goal_minutes FROM settings WHERE id = 1').get().goal_minutes, days });
});

router.get('/settings/goal', (req, res) => {
  res.json({ minutes: db.prepare('SELECT goal_minutes FROM settings WHERE id = 1').get().goal_minutes });
});

router.put('/settings/goal', (req, res) => {
  const minutes = Number(req.body.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) return res.status(400).json({ error: 'minutes must be a whole number 1-240' });
  db.prepare('UPDATE settings SET goal_minutes = ? WHERE id = 1').run(minutes);
  res.json({ minutes });
});

// Cards per deck split New / Learning / Mature (interval >= 21 days), with the deck's language.
router.get('/stats/decks', (req, res) => {
  res.json(db.prepare(`
    SELECT d.id, d.name, d.tts_lang AS lang,
      COALESCE(SUM(c.state = 0), 0) AS new_cards,
      COALESCE(SUM(c.state != 0 AND c.interval < 21), 0) AS learning,
      COALESCE(SUM(c.state != 0 AND c.interval >= 21), 0) AS mature
    FROM decks d LEFT JOIN cards c ON c.deck_id = d.id
    GROUP BY d.id HAVING COUNT(c.id) > 0
    ORDER BY COUNT(c.id) DESC
  `).all());
});

module.exports = router;
