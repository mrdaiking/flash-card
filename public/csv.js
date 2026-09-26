// CSV/TSV/pipe parsing + per-row checks for the import screen.
// Plain script (window.CSV) in the browser, CommonJS for scripts/check-csv.js.
(function (root) {
  // Picks whichever of tab / pipe / comma appears most in the first line.
  function detectDelimiter(text) {
    const first = text.split(/\r?\n/, 1)[0] || '';
    const count = d => first.split(d).length - 1;
    return ['\t', '|', ','].reduce((best, d) => (count(d) > count(best) ? d : best), ',');
  }

  // RFC 4180-style: quoted cells may contain the delimiter, newlines and "" escapes.
  function parseDelimited(text, delim) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    const endRow = () => {
      row.push(cell);
      if (row.some(c => c.trim())) rows.push(row);
      row = []; cell = '';
    };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch !== '"') cell += ch;
        else if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else if (ch === '"' && cell.trim() === '') { cell = ''; quoted = true; }
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\r' || ch === '\n') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); }
      else cell += ch;
    }
    endRow();
    return rows;
  }

  const dedupKey = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
  const stripImages = s => String(s).replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim();

  // Heuristic hints for the minimum information principle — advisory only,
  // never blocks an import. ponytail: regex heuristics, swap for an LLM check
  // once card-quality scoring is its own feature.
  function ideaWarnings(front, back) {
    const warns = [];
    const b = stripImages(back);
    const parts = b.split(/;|\n|\s\/\s/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1 || /(^|\s)\d+[.)]\s.*\s\d+[.)]\s/.test(b)) warns.push('Answer has several items — split into separate cards?');
    else if (b.length > 150) warns.push('Long answer — could it be shorter?');
    if ((stripImages(front).match(/[?？]/g) || []).length > 1) warns.push('Several questions on the front');
    return warns;
  }

  const api = { detectDelimiter, parseDelimited, dedupKey, ideaWarnings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CSV = api;
})(this);
