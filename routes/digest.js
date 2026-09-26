// End-of-day email digest (docs/architecture.md → Notification): one email
// that (1) reports the day and the cards that aren't solid yet, (2) lists
// decks gone quiet even when nothing is due, and (3) is the safety net for
// iOS web push, which can stop working without any error.
const express = require('express');
const nodemailer = require('nodemailer');
const db = require('../db');
const { silentDecks } = require('./push');
const router = express.Router();

const DAY = 86400000;
const SHAKY_LIST_MAX = 8;
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
// Card text for a one-line mention: drop images and markdown punctuation.
const plain = s => String(s).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || '(image)';

// "Not yet solid" (internal definition, not a setting): FSRS difficulty in the
// top 25% of reviewed cards, or rated Again at least once in the last 30 days.
function shakyCards(now = Date.now()) {
  const reviewed = db.prepare('SELECT COUNT(*) AS n FROM cards WHERE state != 0').get().n;
  if (!reviewed) return [];
  const cutoff = db.prepare('SELECT difficulty FROM cards WHERE state != 0 ORDER BY difficulty DESC LIMIT 1 OFFSET ?')
    .get(Math.ceil(reviewed / 4) - 1).difficulty;
  return db.prepare(`
    SELECT c.front, d.name AS deck,
      EXISTS (SELECT 1 FROM reviews r WHERE r.card_id = c.id AND r.rating = 1 AND r.reviewed_at > ?) AS lapsed
    FROM cards c JOIN decks d ON d.id = c.deck_id
    WHERE c.state != 0 AND (c.difficulty >= ? OR lapsed)
    ORDER BY lapsed DESC, c.difficulty DESC
  `).all(Math.floor((now - 30 * DAY) / 1000), cutoff);
}

function buildDigest(now = Date.now()) {
  const since = Math.floor((now - DAY) / 1000);
  return {
    newCards: db.prepare('SELECT COUNT(*) AS n FROM cards WHERE created_at > ?').get(since).n,
    reviews: db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE reviewed_at > ?').get(since).n,
    due: db.prepare('SELECT COUNT(*) AS n FROM cards WHERE next_review <= ?').get(now).n,
    dueTomorrow: db.prepare('SELECT COUNT(*) AS n FROM cards WHERE next_review > ? AND next_review <= ?').get(now, now + DAY).n,
    shaky: shakyCards(now),
    silent: silentDecks({ ignoreRenotify: true }),
    devices: db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,
  };
}

function renderDigest(d) {
  const s = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const subject = `Felix Cards — ${d.due} due · ${d.newCards} new` + (d.silent.length ? ` · ${s(d.silent.length, 'quiet deck')}` : '');
  const shakyShown = d.shaky.slice(0, SHAKY_LIST_MAX);
  const appUrl = process.env.APP_URL;

  const sections = [
    { title: 'Last 24 hours', lines: [`${s(d.newCards, 'new card')}, ${s(d.reviews, 'review')}.`,
      `Due now: ${d.due}` + (d.dueTomorrow ? ` (${d.dueTomorrow} more by this time tomorrow).` : '.')] },
    d.shaky.length && { title: `Not yet solid (${d.shaky.length})`,
      lines: [...shakyShown.map(c => `${plain(c.front)} — ${c.deck}${c.lapsed ? ' (forgot recently)' : ''}`),
        ...(d.shaky.length > shakyShown.length ? [`…and ${d.shaky.length - shakyShown.length} more`] : [])] },
    d.silent.length && { title: 'Quiet decks', lines: d.silent.map(x => `${x.name} — ${x.quietDays} days without activity`) },
    !d.devices && { title: 'Push is off', lines: ['No device is subscribed to push, so this email is your only reminder. Re-enable it in Stats → Notifications.'] },
  ].filter(Boolean);

  const text = sections.map(x => `${x.title}\n${x.lines.map(l => `  • ${l}`).join('\n')}`).join('\n\n') + (appUrl ? `\n\nOpen: ${appUrl}` : '');
  const html = `<div style="font-family:Georgia,serif;color:#3D2A1F;max-width:520px">` +
    sections.map(x => `<h3 style="margin:18px 0 6px;color:#C2410C">${esc(x.title)}</h3><ul style="margin:0;padding-left:20px">${x.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`).join('') +
    (appUrl ? `<p style="margin-top:20px"><a href="${esc(appUrl)}" style="color:#C2410C">Open Felix Cards</a></p>` : '') + '</div>';
  return { subject, text, html };
}

// Any SMTP provider (Gmail app password, SES SMTP, …) via .env; without
// SMTP_HOST + DIGEST_TO the digest is simply skipped.
async function sendDigest() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, DIGEST_TO, DIGEST_FROM } = process.env;
  if (!SMTP_HOST || !DIGEST_TO) return { sent: false, reason: 'Email not configured (set SMTP_HOST and DIGEST_TO in .env)' };
  const port = Number(SMTP_PORT) || 587;
  const transport = nodemailer.createTransport({
    host: SMTP_HOST, port, secure: port === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  const { subject, text, html } = renderDigest(buildDigest());
  await transport.sendMail({ from: DIGEST_FROM || SMTP_USER, to: DIGEST_TO, subject, text, html });
  return { sent: true, to: DIGEST_TO };
}

router.get('/digest/preview', (req, res) => res.json(renderDigest(buildDigest())));

router.post('/digest/test', async (req, res) => {
  try { res.json(await sendDigest()); }
  catch (err) { res.status(502).json({ sent: false, reason: err.message }); }
});

router.get('/settings/digest', (req, res) => {
  const { digest_hour, digest_minute } = db.prepare('SELECT digest_hour, digest_minute FROM settings WHERE id = 1').get();
  res.json({ hour: digest_hour, minute: digest_minute });
});

router.put('/settings/digest', (req, res) => {
  const hour = Number(req.body.hour), minute = Number(req.body.minute);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return res.status(400).json({ error: 'hour must be 0-23 and minute 0-59' });
  }
  db.prepare('UPDATE settings SET digest_hour = ?, digest_minute = ? WHERE id = 1').run(hour, minute);
  res.json({ hour, minute });
});

// Same once-a-minute / once-per-UTC-day pattern as the push reminder, own slot.
function checkDigestTick() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const row = db.prepare('SELECT digest_hour, digest_minute, last_digest_date FROM settings WHERE id = 1').get();
  if (row.last_digest_date === today) return;
  if (now.getUTCHours() !== row.digest_hour || now.getUTCMinutes() !== row.digest_minute) return;
  db.prepare('UPDATE settings SET last_digest_date = ? WHERE id = 1').run(today);
  sendDigest().then(r => { if (!r.sent) console.log('digest skipped:', r.reason); })
    .catch(err => console.error('digest failed:', err));
}

function scheduleDigest() {
  setInterval(checkDigestTick, 60 * 1000);
}

module.exports = router;
module.exports.scheduleDigest = scheduleDigest;
module.exports.buildDigest = buildDigest;
module.exports.renderDigest = renderDigest;
