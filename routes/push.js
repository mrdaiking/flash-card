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

async function broadcastPush(payload) {
  const subs = db.prepare('SELECT * FROM push_subscriptions').all();
  const results = await Promise.allSettled(subs.map(s =>
    webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify(payload)
    )
  ));

  // Prune subscriptions the push service says are gone.
  const dead = db.prepare('DELETE FROM push_subscriptions WHERE id = ?');
  results.forEach((r, i) => {
    if (r.status === 'rejected' && [404, 410].includes(r.reason?.statusCode)) {
      dead.run(subs[i].id);
    }
  });

  return { sent: results.filter(r => r.status === 'fulfilled').length, total: subs.length };
}

router.post('/push/test', async (req, res) => {
  res.json(await broadcastPush({ title: 'Felix Cards', body: 'Test notification 🔔' }));
});

router.get('/settings/reminder', (req, res) => {
  const { reminder_hour, reminder_minute } = db.prepare('SELECT reminder_hour, reminder_minute FROM settings WHERE id = 1').get();
  res.json({ hour: reminder_hour, minute: reminder_minute });
});

router.put('/settings/reminder', (req, res) => {
  const hour = Number(req.body.hour);
  const minute = Number(req.body.minute);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return res.status(400).json({ error: 'hour must be 0-23 and minute 0-59' });
  }
  db.prepare('UPDATE settings SET reminder_hour = ?, reminder_minute = ? WHERE id = 1').run(hour, minute);
  res.json({ hour, minute });
});

// Daily reminder: only pings if something is actually due.
async function sendDueReminder() {
  const due = db.prepare('SELECT COUNT(*) as c FROM cards WHERE next_review <= ?').get(Date.now()).c;
  if (!due) return;
  await broadcastPush({
    title: 'Felix Cards',
    body: `${due} card${due === 1 ? '' : 's'} due for review`,
  });
}

// Checked once a minute; fires at most once per UTC calendar day, at the
// user-configured reminder_hour/reminder_minute (settings table, editable via PUT /settings/reminder).
function checkReminderTick() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  if (row.last_reminder_date === today) return;
  if (now.getUTCHours() !== row.reminder_hour || now.getUTCMinutes() !== row.reminder_minute) return;

  db.prepare('UPDATE settings SET last_reminder_date = ? WHERE id = 1').run(today);
  sendDueReminder().catch(err => console.error('daily reminder failed:', err));
}

function scheduleDailyReminder() {
  setInterval(checkReminderTick, 60 * 1000);
}

module.exports = router;
module.exports.scheduleDailyReminder = scheduleDailyReminder;
