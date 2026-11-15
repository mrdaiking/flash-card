# Changelog

## 1.7.0 - 2026-11-15

### Features
- Card search: 🔍 button on Today opens a search screen. Substring match over front, back, example and furigana readings (kanji, kana, ASCII; case-insensitive), results highlighted, filter by deck or favorites. The query stays in the URL, so Back from the card editor returns to the same search.
- `GET /api/cards/search` endpoint (`q`, `deck`, `favorites`, `limit`). Pasted base64 images are ignored for matching and stripped from results.

### Changes
- Search responses are not cached by the service worker (cache bumped to v62).
- `scripts/check-search.js` self-check.

## 1.6.0 - 2026-11-15

### Features
- Furigana button (ふ[]) in the format toolbar: select kanji (or leave the caret after them) and tap to get `漢字[]` with the caret inside the brackets. Tap again to remove the reading.
- Format toolbar in the quick-add sheet (the + button), applied to whichever field was focused last.
- YouGlish widget on study cards to hear real-video pronunciation examples.

### Changes
- Deploy script for the two-instance setup (`scripts/deploy.sh`).
- Service worker cache bumped to v61.

## 1.5.0 - 2026-10-16

### Features
- Move a card to another deck from the Edit Card screen (Deck picker). The card keeps its schedule and review history.
- Format toolbar under each card field: bold, italic, highlight, code, math, bulleted / numbered list, quote. Tap again to remove. ⌘B / ⌘I on a keyboard; ⌘Z undoes.

### Changes
- Service worker cache bumped to v58.

## 1.4.1 - 2026-10-09

### Fixes
- Streak, "Reviewed today", the Recap screen and the cards-added chart now cut days in the phone's timezone instead of the server's (UTC). A review at 1 am Tokyo time used to count for the previous day.

### Changes
- Service worker cache bumped to v56.

## 1.4.0 - 2026-10-09

### Features
- Progress: Week / Month / Year switch with reviews, average per day, days studied, estimated study time and retention.
- Progress: daily-goal calendar (ring fills toward the goal, check when reached). Goal in minutes, set in Settings (default 15).
- Progress: cards by deck, split Mature / Learning / New, with the deck language.

### Changes
- Replaces the 7-day chart and the 12-week heatmap. New Progress endpoints cut days in the phone's timezone (the server runs in UTC).
- Service worker cache bumped to v55.

## 1.3.2 - 2026-10-08

### Fixes
- Settings no longer loses the version line when the app is opened over plain HTTP (no Cache API there).

### Changes
- Service worker cache bumped to v54.

## 1.3.1 - 2026-10-08

### Features
- LaTeX math on cards via KaTeX: `$...$`, `$$...$$`, `\(...\)`, `\[...\]`.

### Changes
- Service worker cache bumped to v53.

## 1.3.0 - 2026-10-07

### Features
- Pull to refresh on Home, Deck detail, Stats, Recap and Settings. Also flushes offline-queued reviews. Not active on Study or the card forms.
- Furigana on cards, in both Anki (`漢字[かんじ]`) and Obsidian (`{漢字|かんじ}`) syntax.
- Furigana on/off switch on the study screen. Tap a word to peek at its reading while furigana is off.
- Obsidian-style Markdown on cards: bullets, numbered and task lists, highlights, bold, italic, quotes and headings.
- Card text boxes grow with their content.

### Changes
- Service worker cache bumped to v52.
- Recap screen restyled with day-grouped card lists; import screen restyled to match iOS.
- "New deck" button moved to the top of Today.

### Fixes
- Japanese text uses Hiragino Sans explicitly, avoiding hard-to-read fallback fonts.
- Deck setting split into language/font and a separate read-aloud toggle.
