const express = require('express');
const db = require('../db');
const router = express.Router();

// List entries, newest first. Optional ?limit and ?before (created_at cursor).
router.get('/journal', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const before = Number(req.query.before);
  let rows;
  if (before) {
    rows = db.prepare(
      'SELECT * FROM journal_entries WHERE created_at < ? ORDER BY created_at DESC LIMIT ?'
    ).all(before, limit);
  } else {
    rows = db.prepare(
      'SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
  }
  res.json(rows);
});

router.get('/journal/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  res.json(row);
});

router.post('/journal', (req, res) => {
  const { content, correction = '', words = '' } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
  const result = db.prepare(
    'INSERT INTO journal_entries (content, correction, words) VALUES (?, ?, ?)'
  ).run(content, correction, words);
  res.status(201).json(db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/journal/:id', (req, res) => {
  const { content, correction = '', words = '' } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
  const result = db.prepare(
    'UPDATE journal_entries SET content = ?, correction = ?, words = ?, updated_at = unixepoch() WHERE id = ?'
  ).run(content, correction, words, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json(db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id));
});

router.delete('/journal/:id', (req, res) => {
  const result = db.prepare('DELETE FROM journal_entries WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.status(204).end();
});

module.exports = router;
