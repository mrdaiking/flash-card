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
if (!cardCols.includes('example')) db.exec(`ALTER TABLE cards ADD COLUMN example TEXT DEFAULT ''`);
if (!cardCols.includes('type'))    db.exec(`ALTER TABLE cards ADD COLUMN type TEXT DEFAULT 'vocab'`);

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

module.exports = db;
