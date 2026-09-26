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

// ── Domain-silence reminder ──
// Targets the "forgot this deck exists" failure, not missed due cards: a deck
// is silent when its latest activity (newest review of any of its cards, or
// newest card added) is older than the threshold, due cards or not. Empty
// decks are excluded. After a nudge, the same deck isn't nudged again for
// renotify_days. Independent of sendDueReminder.
const DAY = 86400000;

function silentDecks({ ignoreRenotify = false } = {}) {
  const now = Date.now();
  const { silence_threshold_days, renotify_days } =
    db.prepare('SELECT silence_threshold_days, renotify_days FROM settings WHERE id = 1').get();
  return db.prepare(`
    SELECT d.id, d.name, d.silence_notified_at,
      MAX(COALESCE(MAX(r.reviewed_at), 0), MAX(c.created_at)) * 1000 AS last_activity
    FROM decks d
    JOIN cards c ON c.deck_id = d.id
    LEFT JOIN reviews r ON r.card_id = c.id
    GROUP BY d.id
  `).all()
    .filter(d => now - d.last_activity > silence_threshold_days * DAY)
    .filter(d => ignoreRenotify || !d.silence_notified_at || now - d.silence_notified_at > renotify_days * DAY)
    .map(d => ({ id: d.id, name: d.name, quietDays: Math.floor((now - d.last_activity) / DAY) }))
    .sort((a, b) => b.quietDays - a.quietDays);
}

function silencePush(decks) {
  const body = decks.length === 1
    ? `You haven't touched ${decks[0].name} in ${decks[0].quietDays} days.`
    : `Quiet for a while: ${decks.slice(0, 3).map(d => `${d.name} (${d.quietDays}d)`).join(', ')}` +
      (decks.length > 3 ? ` +${decks.length - 3} more` : '');
  return { title: 'Still learning these?', body };
}

async function sendSilenceReminder() {
  const decks = silentDecks();
  if (!decks.length) return;
  await broadcastPush(silencePush(decks));
  const mark = db.prepare('UPDATE decks SET silence_notified_at = ? WHERE id = ?');
  const now = Date.now();
  db.transaction(() => decks.forEach(d => mark.run(now, d.id)))();
}

router.get('/settings/silence', (req, res) => {
  const s = db.prepare('SELECT silence_threshold_days, renotify_days FROM settings WHERE id = 1').get();
  res.json({ thresholdDays: s.silence_threshold_days, renotifyDays: s.renotify_days });
});

router.put('/settings/silence', (req, res) => {
  const s = db.prepare('SELECT silence_threshold_days, renotify_days FROM settings WHERE id = 1').get();
  const thresholdDays = req.body.thresholdDays ?? s.silence_threshold_days;
  const renotifyDays = req.body.renotifyDays ?? s.renotify_days;
  const ok = n => Number.isInteger(n) && n >= 1 && n <= 365;
  if (!ok(thresholdDays) || !ok(renotifyDays)) return res.status(400).json({ error: 'thresholdDays and renotifyDays must be whole days, 1-365' });
  db.prepare('UPDATE settings SET silence_threshold_days = ?, renotify_days = ? WHERE id = 1').run(thresholdDays, renotifyDays);
  res.json({ thresholdDays, renotifyDays });
});

// Manual test: uses the threshold but ignores (and doesn't update) the re-nudge throttle.
router.post('/push/test-silence', async (req, res) => {
  const decks = silentDecks({ ignoreRenotify: true });
  if (!decks.length) return res.json({ decks, sent: 0, total: 0 });
  res.json({ decks, ...(await broadcastPush(silencePush(decks))) });
});

// Checked once a minute; fires at most once per UTC calendar day, at the
// user-configured reminder_hour/reminder_minute (settings table, editable via PUT /settings/reminder).
// The due and silence reminders share the slot but run (and fail) independently.
function checkReminderTick() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  if (row.last_reminder_date === today) return;
  if (now.getUTCHours() !== row.reminder_hour || now.getUTCMinutes() !== row.reminder_minute) return;

  db.prepare('UPDATE settings SET last_reminder_date = ? WHERE id = 1').run(today);
  sendDueReminder().catch(err => console.error('daily reminder failed:', err));
  sendSilenceReminder().catch(err => console.error('silence reminder failed:', err));
}

function scheduleDailyReminder() {
  setInterval(checkReminderTick, 60 * 1000);
}

module.exports = router;
module.exports.scheduleDailyReminder = scheduleDailyReminder;
module.exports.silentDecks = silentDecks;
module.exports.sendSilenceReminder = sendSilenceReminder;
