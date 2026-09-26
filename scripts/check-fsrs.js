// Self-check for fsrs.js — run: node scripts/check-fsrs.js
const assert = require('assert');
const { review, seedFromSm2, newCardDue, studyOrder, NEW_PER_DAY, DAY } = require('../fsrs');

// Seeding: S = SM-2 interval; lower ease ⇒ higher difficulty; D stays in [1, 10].
const normal = seedFromSm2({ interval: 10, ease_factor: 2.5 });
assert.strictEqual(normal.stability, 10);
assert.ok(normal.difficulty > 5 && normal.difficulty < 8, `D=${normal.difficulty}`);
assert.ok(seedFromSm2({ interval: 10, ease_factor: 1.3 }).difficulty > normal.difficulty);
assert.ok(seedFromSm2({ interval: 10, ease_factor: 3.5 }).difficulty < normal.difficulty);
assert.strictEqual(seedFromSm2({ interval: 1, ease_factor: 1.3 }).difficulty, 10);
assert.strictEqual(seedFromSm2({ interval: 0, ease_factor: 2.5 }).stability, 0.1);

// A brand-new card rated Good moves to Review, due in whole days.
const now = new Date('2026-09-26T00:00:00Z');
const fresh = { next_review: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0, state: 0, last_review: null, interval: 0 };
const good = review(fresh, 3, now);
assert.strictEqual(good.state, 2);
assert.strictEqual(good.reps, 1);
assert.ok(good.interval >= 1 && good.next_review >= now.getTime() + DAY, `interval=${good.interval}`);
assert.strictEqual(good.last_review, now.getTime());

// A mature card reviewed on time: Again ⇒ lapse + much shorter interval; Good ⇒ longer.
const mature = { next_review: now.getTime(), stability: 30, difficulty: 5, reps: 5, lapses: 0, state: 2, last_review: now.getTime() - 30 * DAY, interval: 30 };
const again = review(mature, 1, now);
assert.strictEqual(again.lapses, 1);
assert.ok(again.interval < 30, `again interval=${again.interval}`);
assert.ok(review(mature, 3, now).interval > 30);

// New-card drip: the first NEW_PER_DAY are due now, the rest queue onto later days.
const t = now.getTime();
assert.strictEqual(newCardDue(0, t), 0);
assert.strictEqual(newCardDue(NEW_PER_DAY - 1, t), 0);
assert.strictEqual(newCardDue(NEW_PER_DAY, t), t + DAY);
assert.strictEqual(newCardDue(NEW_PER_DAY * 3 + 2, t), t + 3 * DAY);

// Session order: decks alternate, new cards spread between reviews, per-deck order kept.
const card = (id, deck_id, state) => ({ id, deck_id, state });
const order = studyOrder([
  card(1, 'A', 2), card(2, 'A', 2), card(3, 'A', 2), card(4, 'B', 2),
  card(5, 'A', 0), card(6, 'A', 0), card(7, 'B', 0),
]).map(c => c.id);
assert.strictEqual(order.length, 7);
assert.deepStrictEqual(order.filter(id => id <= 4), [1, 4, 2, 3]);    // reviews: A, B, A, A
assert.deepStrictEqual(order.filter(id => id >= 5), [5, 7, 6]);       // new: A, B, A
for (let i = 1; i < order.length; i++) assert.ok(!(order[i] >= 5 && order[i - 1] >= 5), `new cards adjacent: ${order}`);

console.log('fsrs checks passed');
