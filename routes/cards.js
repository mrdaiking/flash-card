const express = require('express');
const db = require('../db');
const { sm2 } = require('../sm2');
const router = express.Router();

router.get('/decks/:id/cards', (req, res) => {
  const cards = db.prepare('SELECT * FROM cards WHERE deck_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(cards);
});

router.post('/decks/:id/cards', (req, res) => {
  const { front, back } = req.body;
  if (!front || !back) return res.status(400).json({ error: 'Front and back required' });
  const result = db.prepare('INSERT INTO cards (deck_id, front, back) VALUES (?, ?, ?)').run(req.params.id, front, back);
  res.status(201).json({ id: result.lastInsertRowid, deck_id: Number(req.params.id), front, back });
});

router.put('/cards/:id', (req, res) => {
  const { front, back } = req.body;
  if (!front || !back) return res.status(400).json({ error: 'Front and back required' });
  const result = db.prepare(
    'UPDATE cards SET front = ?, back = ?, updated_at = unixepoch() WHERE id = ?'
  ).run(front, back, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Card not found' });
  res.json({ id: Number(req.params.id), front, back });
});

router.delete('/cards/:id', (req, res) => {
  const result = db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Card not found' });
  res.status(204).end();
});

router.post('/decks/:id/import', (req, res) => {
  const text = typeof req.body === 'string' ? req.body : '';
  const lines = text.split('\n').filter(l => l.includes('|'));
  const insert = db.prepare('INSERT INTO cards (deck_id, front, back) VALUES (?, ?, ?)');
  const insertMany = db.transaction((lines) => {
    let count = 0;
    for (const line of lines) {
      const [front, ...rest] = line.split('|');
      const back = rest.join('|').trim();
      if (front.trim() && back) {
        insert.run(req.params.id, front.trim(), back);
        count++;
      }
    }
    return count;
  });
  const count = insertMany(lines);
  res.json({ imported: count });
});

// Must come before /decks/:id/due to avoid "due" matching as a deck id
router.get('/cards/due', (req, res) => {
  const cards = db.prepare('SELECT * FROM cards WHERE next_review <= ? ORDER BY next_review ASC').all(Date.now());
  res.json(cards);
});

router.get('/decks/:id/due', (req, res) => {
  const cards = db.prepare(
    'SELECT * FROM cards WHERE deck_id = ? AND next_review <= ? ORDER BY next_review ASC'
  ).all(req.params.id, Date.now());
  res.json(cards);
});

router.post('/cards/:id/review', (req, res) => {
  const rating = Number(req.body.rating);
  if (![1, 2, 3, 4].includes(rating)) return res.status(400).json({ error: 'Rating must be 1-4' });

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const updated = sm2({
    interval: card.interval,
    easeFactor: card.ease_factor,
    repetitions: card.repetitions,
  }, rating);

  db.prepare(`
    UPDATE cards SET interval = ?, ease_factor = ?, repetitions = ?, next_review = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(updated.interval, updated.easeFactor, updated.repetitions, updated.nextReview, card.id);

  db.prepare('INSERT INTO reviews (card_id, rating) VALUES (?, ?)').run(card.id, rating);

  res.json({ ...card, interval: updated.interval, ease_factor: updated.easeFactor, repetitions: updated.repetitions, next_review: updated.nextReview });
});

module.exports = router;
