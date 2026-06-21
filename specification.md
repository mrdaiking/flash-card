# PROMPT FOR CLAUDE CODE — Anki-like PWA (Self-hosted, Cloudflare Tunnel)

## Project Overview

Build a self-hosted **Anki-like Spaced Repetition PWA** running on a Linux server (currently AWS EC2),
exposed via **Cloudflare Tunnel** at `https://frosty-rain-6dee.cloudflareaccess.com`.

The app must:
- Work fully on **iPhone Safari** and be installable as a **PWA (Add to Home Screen)**
- Function **offline** with background sync when reconnected
- Be **portable** — easy to migrate to any other Linux server (Railway, Render, Fly.io, VPS, Raspberry Pi) by copying 1 SQLite file + running `npm install`

---

## Tech Stack

- **Backend:** Node.js + Express (REST API)
- **Database:** SQLite via `better-sqlite3` — entire data lives in a single `cards.db` file, zero infra dependency
- **Frontend:** Vanilla JS + HTML, styled with **Tailwind CSS via CDN**
  ```html
  <script src="https://cdn.tailwindcss.com"></script>
  ```
  Use Tailwind utility classes directly in HTML. No separate CSS file needed except for animations not covered by Tailwind.
- **PWA:** Service Worker + Web App Manifest
- **Auth:** Generate password stored in `.env`. Session token stored in `localStorage` after password entry.
- **Process:** Runs as a single Node.js process on port 3000 (configurable via ENV), behind Cloudflare Tunnel — no Nginx needed

- EC2: 
```
Host ec2-name
    HostName ********
    User ubuntu
    IdentityFile ******
```
---

## Core Features

### 1. SM-2 Spaced Repetition Algorithm

Implement the standard **SM-2 algorithm** accurately in a shared `sm2.js` module (used by both backend route and offline sync):

```js
// sm2.js
function sm2(card, rating) {
  // rating: 1=Again, 2=Hard, 3=Good, 4=Easy
  // card: { interval, easeFactor, repetitions }

  if (rating === 1) {
    card.interval = 1;
    card.repetitions = 0;
    card.easeFactor = Math.max(1.3, card.easeFactor - 0.2);
  } else {
    if (card.repetitions === 0) card.interval = 1;
    else if (card.repetitions === 1) card.interval = 6;
    else card.interval = Math.round(card.interval * card.easeFactor);

    card.easeFactor += [0, -0.15, 0, 0.1][rating - 1];
    card.easeFactor = Math.max(1.3, card.easeFactor);
    card.repetitions += 1;
  }

  card.nextReview = Date.now() + card.interval * 86400000;
  return card;
}

module.exports = { sm2 };
```

### 2. Card & Deck Management

- **Decks:** Create, rename, delete
- **Cards:** Each card has:
  - `front` (text, rendered as Markdown using `marked.js` CDN)
  - `back` (text, rendered as Markdown)
  - `deck_id`
  - `interval`, `ease_factor`, `repetitions`, `next_review` (SM-2 fields)
  - `created_at`, `updated_at`
- Full CRUD: add, edit, delete cards
- **Bulk import** via plain text format (one card per line):
  ```
  front text | back text
  ```
  Endpoint: `POST /api/decks/:id/import`

### 3. Study Session UI

- Show only cards where `next_review <= Date.now()`
- Tap/click card to flip and reveal answer (CSS 3D flip animation)
- After flip: show 4 rating buttons — **Again / Hard / Good / Easy**
  - Color: Again=red, Hard=orange, Good=blue, Easy=green (Tailwind colors)
- Progress bar + counter: "3 / 12 remaining"
- Session summary screen on completion: total reviewed, breakdown by rating
- Due count badge on each deck in home screen

### 4. PWA Requirements

**`manifest.json`:**
```json
{
  "name": "Felix Cards",
  "short_name": "FlashCards",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#6366f1",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Generate icons using Node.js canvas (`canvas` npm package) — indigo `#6366f1` background with white "FC" text.

**Service Worker (`sw.js`):**
- Cache all static assets on install (HTML, JS, Tailwind CDN, manifest)
- Cache `GET /api/decks` and `GET /api/cards/due` responses (stale-while-revalidate)
- Offline fallback page when no cache hit
- **Background sync:** Queue `POST /api/cards/:id/review` when offline, replay when back online using `SyncManager` API

### 5. API Endpoints

```
GET    /api/decks                  — list all decks, each with { id, name, due_count, total_count }
POST   /api/decks                  — create deck { name }
PUT    /api/decks/:id              — rename deck { name }
DELETE /api/decks/:id              — delete deck + cascade delete its cards

GET    /api/decks/:id/cards        — list all cards in deck
POST   /api/decks/:id/cards        — create card { front, back }
PUT    /api/cards/:id              — update card { front, back }
DELETE /api/cards/:id              — delete card
POST   /api/decks/:id/import       — bulk import, body: plain text "front | back\n..."

GET    /api/cards/due              — all due cards across all decks (next_review <= now)
GET    /api/decks/:id/due          — due cards for one deck
POST   /api/cards/:id/review       — submit review { rating: 1|2|3|4 }, returns updated card

GET    /api/stats                  — { total_cards, due_today, streak_days, reviewed_today }

POST   /api/auth                   — { pin } → { token } (token = signed timestamp, verified via middleware)
```

All errors return `{ error: "message" }` with appropriate HTTP status code.

### 6. UI / UX

**Theme (configure Tailwind in `<script>` block):**
```js
tailwind.config = {
  theme: {
    extend: {
      colors: {
        surface: '#1e293b',
        base: '#0f172a',
      }
    }
  }
}
```

**5 Screens (hash-based SPA router: `window.location.hash`):**

1. **`#/`  Home / Deck List**
   - List all decks with due count badge (indigo pill)
   - "Study All" button if any cards due
   - FAB button bottom-right: "+ New Deck"

2. **`#/decks/:id`  Deck Detail**
   - Card list (front preview only)
   - "Study Now" CTA (disabled if 0 due)
   - "+ Add Card" button
   - "Import" button → opens textarea modal

3. **`#/study/:id`  Study Screen** (`:id` = deck id or `all`)
   - Large card centered, tap to flip
   - CSS 3D flip animation (see below)
   - 4 rating buttons appear after flip
   - Progress bar top of screen
   - Swipe left/right gesture = Again/Easy shortcut

4. **`#/cards/:id/edit`  Add / Edit Card**
   - Two `<textarea>` fields: Front, Back
   - Live Markdown preview below each field (using `marked.js`)
   - Save / Cancel buttons

5. **`#/stats`  Stats Screen**
   - Due today, total cards, streak days
   - Simple bar chart (pure SVG, no library) showing reviews per day last 7 days

**Card Flip Animation (add in `<style>` tag, Tailwind doesn't cover 3D transforms):**
```css
.card-scene { perspective: 1000px; }
.card-inner {
  transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
  position: relative;
}
.card-inner.flipped { transform: rotateY(180deg); }
.card-front, .card-back {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.card-back { transform: rotateY(180deg); }
```

**Mobile UX rules:**
- All interactive elements minimum `h-12` (48px) Tailwind class
- Bottom navigation bar with 3 icons: Home, Study All, Stats
- Safe area insets: `pb-safe` pattern for iPhone home bar
- No horizontal scroll anywhere

---

## Project Structure

```
/
├── server.js              # Express entry — mounts routes, serves /public
├── db.js                  # SQLite init, migrations, db singleton
├── sm2.js                 # SM-2 algorithm (shared logic)
├── middleware/
│   └── auth.js            # PIN auth middleware
├── routes/
│   ├── auth.js
│   ├── decks.js
│   ├── cards.js
│   └── stats.js
├── scripts/
│   ├── seed.js            # Creates sample deck + 10 cards for testing
│   └── generate-icons.js  # Generates icon-192.png and icon-512.png via canvas
├── public/
│   ├── index.html         # Full SPA shell — includes Tailwind CDN, marked.js CDN
│   ├── app.js             # Router + all screen render functions
│   ├── sw.js              # Service Worker
│   └── manifest.json
├── data/                  # Created at runtime, gitignored
│   └── cards.db           # THE single file to backup/migrate
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Database Schema

```sql
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

CREATE INDEX IF NOT EXISTS idx_cards_deck    ON cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_cards_due     ON cards(next_review);
CREATE INDEX IF NOT EXISTS idx_reviews_date  ON reviews(reviewed_at);
```

The `reviews` table powers the streak calculation and the 7-day bar chart in Stats.

---

## ENV Configuration

**.env.example:**
```
PORT=3000
APP_PIN=1234
DB_PATH=./data/cards.db
TOKEN_SECRET=change_this_to_random_string
```

Auth flow:
1. User enters PIN on first open → `POST /api/auth` → receives `token`
2. Token stored in `localStorage`
3. All API requests send `Authorization: Bearer <token>` header
4. Backend middleware verifies token via `TOKEN_SECRET`
5. PIN screen shown again if token missing or expired (7 days)

---

## Deployment

### Current setup (EC2 + Cloudflare Tunnel)

```bash
# 1. Clone and install
git clone <repo> && cd anki-pwa
npm install

# 2. Configure
cp .env.example .env
# Edit .env: set APP_PIN, TOKEN_SECRET

# 3. Generate icons
node scripts/generate-icons.js

# 4. Seed sample data (optional)
node scripts/seed.js

# 5. Start with PM2
npm install -g pm2
pm2 start server.js --name anki-pwa
pm2 save
pm2 startup   # auto-start on reboot

# 6. Cloudflare Tunnel (already configured at frosty-rain-6dee.cloudflareaccess.com)
# Tunnel points to http://localhost:3000 — no Nginx needed
```

### Migrating to a new server (any Linux)

```bash
# On OLD server — backup the only file that matters
scp user@old-server:/path/to/data/cards.db ./cards.db

# On NEW server — restore
git clone <repo> && cd anki-pwa
npm install
cp .env.example .env   # re-set PIN and secrets
mkdir data
cp /path/to/cards.db data/cards.db   # restore data
node scripts/generate-icons.js
pm2 start server.js --name anki-pwa

# Update Cloudflare Tunnel to point to new server
# Dashboard → Zero Trust → Tunnels → edit tunnel → update connector
# Domain frosty-rain-6dee.cloudflareaccess.com stays the same
# iPhone PWA continues working with no reinstall needed
```

### Alternative deployment targets (all work without changes)

| Platform | Notes |
|---|---|
| **Railway / Render** | Push to git, set ENV vars, mount persistent volume for `data/` |
| **Fly.io** | `fly launch` + persistent volume for `data/` |
| **Any VPS** (DigitalOcean, Vultr, Hetzner) | Same steps as EC2 |
| **Raspberry Pi at home** | Same steps, tunnel via same Cloudflare token |

---

## Seed Script (`scripts/seed.js`)

Create 1 deck **"English Vocabulary"** with these 10 cards (business English, relevant for IT/startup context):

| Front | Back |
|---|---|
| leverage | To use something to maximum advantage. "We can leverage this data to improve UX." |
| bottleneck | A point of congestion slowing down a process. |
| stakeholder | Anyone with interest in a project's outcome. |
| iterate | To repeat a process to improve the result. |
| bandwidth | Capacity to handle work (also literal network term). |
| deliverable | A concrete output or result expected from a project. |
| pivot | To change business strategy based on new information. |
| traction | Early signs that a product/idea is gaining momentum. |
| due diligence | Thorough research before making a decision. |
| async | Short for asynchronous — not requiring real-time interaction. |

---

## What to Deliver

1. All source files matching the project structure above
2. `README.md` with copy-paste deployment commands
3. `scripts/generate-icons.js` that works without manual steps
4. `scripts/seed.js` ready to run immediately after setup
5. Verify PWA checklist before finishing:
   - [ ] `manifest.json` linked in `<head>`
   - [ ] Service worker registered in `app.js`
   - [ ] HTTPS served via Cloudflare Tunnel (already handled externally)
   - [ ] App installable on iPhone Safari ("Add to Home Screen")
   - [ ] Offline mode shows cached content, queues reviews