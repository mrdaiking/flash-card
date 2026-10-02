const express = require('express');
const db = require('../db');
const { DEFAULT_RETENTION } = require('../fsrs');
const router = express.Router();

router.get('/decks', (req, res) => {
  const now = Date.now();
  const decks = db.prepare(`
    SELECT d.id, d.name, COALESCE(d.target_retention, ${DEFAULT_RETENTION}) AS target_retention,
      COALESCE(d.front_label, 'Front') AS front_label, COALESCE(d.back_label, 'Back') AS back_label,
      COALESCE(d.example_label, 'Example') AS example_label, COALESCE(d.tts_lang, 'en-US') AS tts_lang,
      COUNT(c.id) as total_count,
      SUM(CASE WHEN c.next_review <= ? THEN 1 ELSE 0 END) as due_count
    FROM decks d
    LEFT JOIN cards c ON c.deck_id = d.id
    GROUP BY d.id
    ORDER BY due_count DESC, total_count DESC, d.created_at DESC
  `).all(now);
  res.json(decks);
});

// Template fields are optional; blank/missing falls back to the defaults at read time.
const label = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : null);
const lang = v => (typeof v === 'string' && /^(off|[a-z]{2,3}(-[A-Za-z]{2,4})?)$/.test(v) ? v : null);

router.post('/decks', (req, res) => {
  const { name, front_label, back_label, example_label, tts_lang } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare(
    'INSERT INTO decks (name, front_label, back_label, example_label, tts_lang) VALUES (?, ?, ?, ?, ?)'
  ).run(name, label(front_label), label(back_label), label(example_label), lang(tts_lang));
  res.status(201).json({ id: result.lastInsertRowid, name });
});

router.put('/decks/:id/template', (req, res) => {
  const { front_label, back_label, example_label, tts_lang } = req.body;
  const result = db.prepare(
    'UPDATE decks SET front_label = ?, back_label = ?, example_label = ?, tts_lang = ? WHERE id = ?'
  ).run(label(front_label), label(back_label), label(example_label), lang(tts_lang), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Deck not found' });
  res.json({ id: Number(req.params.id) });
});

router.put('/decks/:id', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare('UPDATE decks SET name = ? WHERE id = ?').run(name, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Deck not found' });
  res.json({ id: Number(req.params.id), name });
});

// Only affects future reviews: FSRS aims at this recall probability when it
// picks the next interval. Existing due dates are left as they are.
router.put('/decks/:id/retention', (req, res) => {
  const r = Number(req.body.targetRetention);
  if (!(r >= 0.7 && r <= 0.97)) return res.status(400).json({ error: 'targetRetention must be between 0.70 and 0.97' });
  const result = db.prepare('UPDATE decks SET target_retention = ? WHERE id = ?').run(r, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Deck not found' });
  res.json({ id: Number(req.params.id), target_retention: r });
});

router.delete('/decks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM decks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Deck not found' });
  res.status(204).end();
});

module.exports = router;
