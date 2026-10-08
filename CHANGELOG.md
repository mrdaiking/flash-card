# Changelog

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
