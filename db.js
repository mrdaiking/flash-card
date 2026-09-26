require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './data/cards.db';
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS decks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS cards (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id      INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    front        TEXT NOT NULL,
    back         TEXT NOT NULL,
    interval     INTEGER DEFAULT 0,
    ease_factor  REAL    DEFAULT 2.5,
    repetitions  INTEGER DEFAULT 0,
    next_review  INTEGER DEFAULT 0,
    created_at   INTEGER DEFAULT (unixepoch()),
    updated_at   INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    rating      INTEGER NOT NULL,
    reviewed_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_cards_deck   ON cards(deck_id);
  CREATE INDEX IF NOT EXISTS idx_cards_due    ON cards(next_review);
  CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(reviewed_at);
`);

// ── Additive migrations (idempotent; never drop existing data) ──
const cardCols = db.prepare(`PRAGMA table_info(cards)`).all().map(c => c.name);
if (!cardCols.includes('example'))     db.exec(`ALTER TABLE cards ADD COLUMN example TEXT DEFAULT ''`);
if (!cardCols.includes('type'))        db.exec(`ALTER TABLE cards ADD COLUMN type TEXT DEFAULT 'vocab'`);
if (!cardCols.includes('is_favorite')) db.exec(`ALTER TABLE cards ADD COLUMN is_favorite INTEGER DEFAULT 0`);

// FSRS-6 memory state. Added and backfilled once, in one transaction, the
// first time this runs. next_review is never touched, so no card becomes due
// because of the migration. The SM-2 columns (interval/ease_factor/repetitions)
// stay; `interval` keeps being written as the current interval in days.
if (!cardCols.includes('stability')) {
  const { seedFromSm2, DAY } = require('./fsrs');
  db.transaction(() => {
    db.exec(`
      ALTER TABLE cards ADD COLUMN stability   REAL    DEFAULT 0;
      ALTER TABLE cards ADD COLUMN difficulty  REAL    DEFAULT 0;
      ALTER TABLE cards ADD COLUMN reps        INTEGER DEFAULT 0;
      ALTER TABLE cards ADD COLUMN lapses      INTEGER DEFAULT 0;
      ALTER TABLE cards ADD COLUMN state       INTEGER DEFAULT 0;  -- 0 New, 2 Review (ts-fsrs State)
      ALTER TABLE cards ADD COLUMN last_review INTEGER;            -- ms, like next_review
    `);
    const history = db.prepare('SELECT COUNT(*) AS reps, COALESCE(SUM(rating = 1), 0) AS lapses FROM reviews WHERE card_id = ?');
    const seed = db.prepare('UPDATE cards SET stability = ?, difficulty = ?, reps = ?, lapses = ?, state = 2, last_review = ? WHERE id = ?');
    // interval > 0 ⇔ reviewed at least once under SM-2; never-reviewed cards stay New.
    for (const c of db.prepare('SELECT id, interval, ease_factor, next_review FROM cards WHERE interval > 0').all()) {
      const { stability, difficulty } = seedFromSm2(c);
      const { reps, lapses } = history.get(c.id);
      seed.run(stability, difficulty, Math.max(reps, 1), lapses, c.next_review - c.interval * DAY, c.id);
    }
  })();
}

db.exec(`
  CREATE TABLE IF NOT EXISTS journal_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    content    TEXT NOT NULL,      -- user's own writing
    correction TEXT DEFAULT '',    -- ChatGPT correction (pasted)
    words      TEXT DEFAULT '',    -- comma-sep words practiced
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(created_at);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  -- Single-row table (id=1) for user-configurable settings.
  CREATE TABLE IF NOT EXISTS settings (
    id                 INTEGER PRIMARY KEY CHECK (id = 1),
    reminder_hour      INTEGER NOT NULL DEFAULT 0,  -- UTC
    reminder_minute    INTEGER NOT NULL DEFAULT 0,  -- UTC
    last_reminder_date TEXT    NOT NULL DEFAULT ''
  );
`);
db.prepare('INSERT OR IGNORE INTO settings (id, reminder_hour, reminder_minute) VALUES (1, ?, 0)')
  .run(Number(process.env.REMINDER_HOUR_UTC) || 0);

// Domain-silence reminder: when a deck was last nudged (ms), plus the global
// threshold / re-nudge interval in days.
const deckCols = db.prepare(`PRAGMA table_info(decks)`).all().map(c => c.name);
if (!deckCols.includes('silence_notified_at')) db.exec(`ALTER TABLE decks ADD COLUMN silence_notified_at INTEGER`);
// Per-deck FSRS target retention; NULL = the global default (fsrs.js DEFAULT_RETENTION).
if (!deckCols.includes('target_retention'))    db.exec(`ALTER TABLE decks ADD COLUMN target_retention REAL`);
const settingCols = db.prepare(`PRAGMA table_info(settings)`).all().map(c => c.name);
if (!settingCols.includes('silence_threshold_days')) db.exec(`ALTER TABLE settings ADD COLUMN silence_threshold_days INTEGER NOT NULL DEFAULT 21`);
if (!settingCols.includes('renotify_days'))          db.exec(`ALTER TABLE settings ADD COLUMN renotify_days INTEGER NOT NULL DEFAULT 14`);

// End-of-day email digest time (UTC; 12:00 UTC = 21:00 Tokyo) + once-a-day guard.
if (!settingCols.includes('digest_hour'))      db.exec(`ALTER TABLE settings ADD COLUMN digest_hour INTEGER NOT NULL DEFAULT 12`);
if (!settingCols.includes('digest_minute'))    db.exec(`ALTER TABLE settings ADD COLUMN digest_minute INTEGER NOT NULL DEFAULT 0`);
if (!settingCols.includes('last_digest_date')) db.exec(`ALTER TABLE settings ADD COLUMN last_digest_date TEXT NOT NULL DEFAULT ''`);

module.exports = db;
