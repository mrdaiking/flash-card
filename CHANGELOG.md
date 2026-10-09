# Changelog

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
