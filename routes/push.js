const express = require('express');
const webpush = require('web-push');
const db = require('../db');
const router = express.Router();

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

router.get('/push/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

router.post('/push/subscribe', (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  db.prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
  `).run(endpoint, keys.p256dh, keys.auth);
  res.status(201).json({ ok: true });
});

router.post('/push/test', async (req, res) => {
  const subs = db.prepare('SELECT * FROM push_subscriptions').all();
  const payload = JSON.stringify({ title: 'Felix Cards', body: 'Test notification 🔔' });

  const results = await Promise.allSettled(subs.map(s =>
    webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload
    )
  ));

  // Prune subscriptions the push service says are gone.
  const dead = db.prepare('DELETE FROM push_subscriptions WHERE id = ?');
  results.forEach((r, i) => {
    if (r.status === 'rejected' && [404, 410].includes(r.reason?.statusCode)) {
      dead.run(subs[i].id);
    }
  });

  res.json({ sent: results.filter(r => r.status === 'fulfilled').length, total: subs.length });
});

module.exports = router;
