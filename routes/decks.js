const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/decks', (req, res) => {
  const now = Date.now();
  const decks = db.prepare(`
    SELECT d.id, d.name,
      COUNT(c.id) as total_count,
      SUM(CASE WHEN c.next_review <= ? THEN 1 ELSE 0 END) as due_count
    FROM decks d
    LEFT JOIN cards c ON c.deck_id = d.id
    GROUP BY d.id
    ORDER BY d.created_at DESC
  `).all(now);
  res.json(decks);
});

router.post('/decks', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare('INSERT INTO decks (name) VALUES (?)').run(name);
  res.status(201).json({ id: result.lastInsertRowid, name });
});

router.put('/decks/:id', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare('UPDATE decks SET name = ? WHERE id = ?').run(name, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Deck not found' });
  res.json({ id: Number(req.params.id), name });
});

router.delete('/decks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM decks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Deck not found' });
  res.status(204).end();
});

module.exports = router;
