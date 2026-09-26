// FSRS-6 scheduling (ts-fsrs), mapped onto the `cards` table columns.
const { fsrs, generatorParameters, default_w } = require('ts-fsrs');

const DAY = 86400000;

// 85% default target retention (docs/architecture.md: a lighter initial
// review load than the usual 90%). Short-term steps off: the Study screen
// fetches its due list once per session, so a card never comes back within
// the same session anyway — every interval is whole days.
const DEFAULT_RETENTION = 0.85;
const schedulers = new Map();
function scheduler(retention = DEFAULT_RETENTION) {
  if (!schedulers.has(retention)) {
    schedulers.set(retention, fsrs(generatorParameters({ request_retention: retention, enable_short_term: false, enable_fuzz: true })));
  }
  return schedulers.get(retention);
}

function toFsrsCard(row) {
  return {
    due: new Date(row.next_review),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: 0,
    scheduled_days: row.interval || 0,
    learning_steps: 0,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

// rating 1-4 = Again/Hard/Good/Easy (same numbering as ts-fsrs's Rating).
// Returns the column values to write back. `interval` keeps meaning "current
// interval in days" so stats.js's mature-card count still works.
function review(row, rating, now = new Date(), retention = DEFAULT_RETENTION) {
  const next = scheduler(retention).next(toFsrsCard(row), now, rating).card;
  return {
    stability: next.stability,
    difficulty: next.difficulty,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state,
    last_review: now.getTime(),
    next_review: next.due.getTime(),
    interval: next.scheduled_days,
  };
}

// One-time seed from SM-2 state (the approach fsrs-rs uses for Anki's
// memory_state_from_sm2). SM-2 aims at ~90% recall at the interval and
// FSRS-6's curve gives R = 0.9 at t = S, so S = interval. D inverts FSRS's
// stability-increase formula so the card's growth factor ≈ its old ease.
function seedFromSm2({ interval, ease_factor }) {
  const w = default_w;
  const stability = Math.max(interval, 0.1);
  const growthPerEase = Math.exp(w[8]) * Math.pow(stability, -w[9]) * Math.expm1(0.1 * w[10]);
  const difficulty = Math.min(Math.max(11 - (ease_factor - 1) / growthPerEase, 1), 10);
  return { stability, difficulty };
}

// ── Combat interference (Wozniak rule 11) ──
// New cards from the same deck are the most likely to blur together, so:
//  1. at creation, each deck releases at most NEW_PER_DAY new cards per day —
//     extra ones are queued onto later days via next_review (done in the data,
//     so every due count in the app matches what a session actually shows);
//  2. within a session, decks are interleaved and new cards are spread evenly
//     between reviews instead of arriving as one same-deck block.
// ponytail: fixed global cap; make it per-deck if some domain wants more.
const NEW_PER_DAY = 10;

// Due time for a card added to a deck that already has `unseenNew` new cards waiting.
function newCardDue(unseenNew, now = Date.now()) {
  return unseenNew < NEW_PER_DAY ? 0 : now + Math.floor(unseenNew / NEW_PER_DAY) * DAY;
}

function roundRobinByDeck(cards) {
  const byDeck = new Map();
  for (const c of cards) (byDeck.get(c.deck_id) || byDeck.set(c.deck_id, []).get(c.deck_id)).push(c);
  const queues = [...byDeck.values()];
  const out = [];
  for (let i = 0; out.length < cards.length; i++) for (const q of queues) if (i < q.length) out.push(q[i]);
  return out;
}

// Evenly interleaves `b` into `a`, keeping each list's own order.
function spread(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && (i + 1) / (a.length + 1) <= (j + 1) / (b.length + 1))) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
}

// Session order for a due list (input: most overdue first).
function studyOrder(cards) {
  return spread(roundRobinByDeck(cards.filter(c => c.state !== 0)), roundRobinByDeck(cards.filter(c => c.state === 0)));
}

module.exports = { review, seedFromSm2, newCardDue, studyOrder, NEW_PER_DAY, DEFAULT_RETENTION, DAY };
