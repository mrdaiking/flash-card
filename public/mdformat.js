// Markdown formatting for the card editor's toolbar (bold, lists, …).
// Pure: takes the text + selection, returns the range to replace and the new selection.
// Plain script (window.MDFormat) in the browser, CommonJS for scripts/check-mdformat.js.
(function (root) {
  const WRAP = { bold: '**', italic: '*', highlight: '==', code: '`', math: '$' };
  const LIST = /^(\s*)(?:[-*+]|\d+[.)]) /;

  // Count of `ch` repeated right before / after index i.
  const runBefore = (v, i, ch) => { let n = 0; while (v[i - 1 - n] === ch) n++; return n; };
  const runAfter = (v, i, ch) => { let n = 0; while (v[i + n] === ch) n++; return n; };

  function wrap(v, s, e, m) {
    const L = m.length;
    // `**x**` is bold, not italic around `*x*`: the marker run must match exactly (3 = bold+italic).
    const fits = r => r === L || (m[0] === '*' && r === 3);
    if (fits(runBefore(v, s, m[0])) && fits(runAfter(v, e, m[0])) && v.slice(s - L, s) === m && v.slice(e, e + L) === m) {
      return { from: s - L, to: e + L, text: v.slice(s, e), selStart: s - L, selEnd: e - L };
    }
    const sel = v.slice(s, e);
    if (sel.length >= 2 * L + 1 && sel.startsWith(m) && sel.endsWith(m)) {
      const inner = sel.slice(L, -L);
      return { from: s, to: e, text: inner, selStart: s, selEnd: s + inner.length };
    }
    // Markdown ignores `** word **`, so keep surrounding spaces outside the markers.
    while (s < e && /\s/.test(v[s])) s++;
    while (e > s && /\s/.test(v[e - 1])) e--;
    const t = v.slice(s, e);
    return { from: s, to: e, text: m + t + m, selStart: s + L, selEnd: s + L + t.length };
  }

  function prefixLines(v, s, e, kind) {
    const from = v.lastIndexOf('\n', s - 1) + 1;
    let to = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e);
    if (to < 0) to = v.length;
    const lines = v.slice(from, to).split('\n');
    const has = kind === 'quote' ? l => /^> ?/.test(l)
      : kind === 'bullet' ? l => /^\s*[-*+] /.test(l) : l => /^\s*\d+[.)] /.test(l);
    const filled = lines.filter(l => l.trim());
    const off = filled.length > 0 && filled.every(has); // all already formatted → toggle off
    let n = 0;
    const text = lines.map(l => {
      if (!l.trim() && lines.length > 1) return l;
      if (kind === 'quote') return off ? l.replace(/^> ?/, '') : `> ${l}`;
      const bare = l.replace(LIST, '$1');
      if (off) return bare;
      const indent = bare.match(/^\s*/)[0];
      return `${indent}${kind === 'bullet' ? '-' : `${++n}.`} ${bare.slice(indent.length)}`;
    }).join('\n');
    const caret = from + text.length;
    return { from, to, text, selStart: s === e ? caret : from, selEnd: caret };
  }

  function apply(v, s, e, kind) {
    return WRAP[kind] ? wrap(v, s, e, WRAP[kind]) : prefixLines(v, s, e, kind);
  }

  const api = { apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MDFormat = api;
})(this);
