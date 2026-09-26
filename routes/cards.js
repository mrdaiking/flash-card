const express = require('express');
const db = require('../db');
const { review, newCardDue, studyOrder, DAY } = require('../fsrs');
const router = express.Router();

router.get('/decks/:id/cards', (req, res) => {
  const cards = db.prepare('SELECT * FROM cards WHERE deck_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(cards);
});

const CARD_TYPES = ['vocab', 'collocation', 'phrasal', 'idiom', 'sentence'];
const normType = t => CARD_TYPES.includes(t) ? t : 'vocab';

router.post('/decks/:id/cards', (req, res) => {
  const { front, back, example = '', type = 'vocab' } = req.body;
  if (!front || !back) return res.status(400).json({ error: 'Front and back required' });
  const unseenNew = db.prepare('SELECT COUNT(*) AS n FROM cards WHERE deck_id = ? AND state = 0').get(req.params.id).n;
  const nextReview = newCardDue(unseenNew);
  const result = db.prepare(
    'INSERT INTO cards (deck_id, front, back, example, type, next_review) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.params.id, front, back, example, normType(type), nextReview);
  res.status(201).json({ id: result.lastInsertRowid, deck_id: Number(req.params.id), front, back, example, type: normType(type), next_review: nextReview });
});

router.put('/cards/:id', (req, res) => {
  const { front, back, example = '', type = 'vocab' } = req.body;
  if (!front || !back) return res.status(400).json({ error: 'Front and back required' });
  const result = db.prepare(
    'UPDATE cards SET front = ?, back = ?, example = ?, type = ?, updated_at = unixepoch() WHERE id = ?'
  ).run(front, back, example, normType(type), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Card not found' });
  res.json({ id: Number(req.params.id), front, back, example, type: normType(type) });
});

router.delete('/cards/:id', (req, res) => {
  const result = db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Card not found' });
  res.status(204).end();
});

// Rows arrive already parsed + column-mapped by the import screen. The server
// still re-checks required fields and duplicates (same front in this deck),
// then optionally spreads due dates over `spreadDays` so a big import doesn't
// land as one giant backlog on day one.
router.post('/decks/:id/import-rows', (req, res) => {
  const { rows, spreadDays = 0 } = req.body || {};
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });
  if (!db.prepare('SELECT 1 FROM decks WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'Deck not found' });

  const key = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const seen = new Set(db.prepare('SELECT front FROM cards WHERE deck_id = ?').all(req.params.id).map(c => key(c.front)));
  const valid = [];
  for (const r of rows) {
    const front = String(r?.front ?? '').trim();
    const back = String(r?.back ?? '').trim();
    if (!front || !back || seen.has(key(front))) continue;
    seen.add(key(front));
    valid.push({ front, back, example: String(r.example ?? '').trim() });
  }

  const days = Math.min(Math.max(Math.floor(Number(spreadDays)) || 0, 0), 90);
  const perDay = days ? Math.ceil(valid.length / days) : valid.length;
  const now = Date.now();
  const insert = db.prepare('INSERT INTO cards (deck_id, front, back, example, next_review) VALUES (?, ?, ?, ?, ?)');
  db.transaction(() => valid.forEach((c, i) => {
    insert.run(req.params.id, c.front, c.back, c.example, days ? now + Math.floor(i / perDay) * 86400000 : 0);
  }))();

  res.json({ imported: valid.length, skipped: rows.length - valid.length });
});

// `?ahead=N` (days, max 7) also returns cards coming due soon, so the service
// worker's cached copy still has cards to study after hours offline. Callers
// using it filter by next_review themselves.
const dueUntil = req => Date.now() + Math.min(Math.max(Number(req.query.ahead) || 0, 0), 7) * 86400000;

// Must come before /decks/:id/due to avoid "due" matching as a deck id
router.get('/cards/due', (req, res) => {
  const cards = db.prepare('SELECT * FROM cards WHERE next_review <= ? ORDER BY next_review ASC').all(dueUntil(req));
  res.json(studyOrder(cards));
});

router.get('/decks/:id/due', (req, res) => {
  const cards = db.prepare(
    'SELECT * FROM cards WHERE deck_id = ? AND next_review <= ? ORDER BY next_review ASC'
  ).all(req.params.id, dueUntil(req));
  res.json(studyOrder(cards));
});

// Favorited cards — ignores next_review entirely (studyable on demand, not gated by SM-2 due-date).
router.get('/cards/favorites', (req, res) => {
  const cards = db.prepare('SELECT * FROM cards WHERE is_favorite = 1 ORDER BY next_review ASC').all();
  res.json(cards);
});

router.get('/decks/:id/favorites', (req, res) => {
  const cards = db.prepare(
    'SELECT * FROM cards WHERE deck_id = ? AND is_favorite = 1 ORDER BY next_review ASC'
  ).all(req.params.id);
  res.json(cards);
});

router.post('/cards/:id/favorite', (req, res) => {
  const favorite = req.body.favorite ? 1 : 0;
  const result = db.prepare('UPDATE cards SET is_favorite = ? WHERE id = ?').run(favorite, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Card not found' });
  res.json({ id: Number(req.params.id), is_favorite: favorite });
});

router.post('/cards/:id/review', (req, res) => {
  const rating = Number(req.body.rating);
  if (![1, 2, 3, 4].includes(rating)) return res.status(400).json({ error: 'Rating must be 1-4' });

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  // Offline-queued reviews carry `at` (ms) = when the card was actually rated,
  // so FSRS sees the real elapsed time, not the replay time. Ignore values in
  // the future or over 30 days old, and never go back before the last review.
  const at = Number(req.body.at);
  let now = Date.now();
  if (at && at <= now && at > now - 30 * DAY) now = at;
  if (card.last_review && now < card.last_review) now = card.last_review;

  const { target_retention } = db.prepare('SELECT target_retention FROM decks WHERE id = ?').get(card.deck_id);
  const next = review(card, rating, new Date(now), target_retention ?? undefined);
  db.transaction(() => {
    db.prepare(`
      UPDATE cards SET stability = ?, difficulty = ?, reps = ?, lapses = ?, state = ?, last_review = ?,
        next_review = ?, interval = ?, updated_at = unixepoch()
      WHERE id = ?
    `).run(next.stability, next.difficulty, next.reps, next.lapses, next.state, next.last_review, next.next_review, next.interval, card.id);
    db.prepare('INSERT INTO reviews (card_id, rating, reviewed_at) VALUES (?, ?, ?)').run(card.id, rating, Math.floor(now / 1000));
  })();

  res.json({ ...card, ...next });
});

module.exports = router;
