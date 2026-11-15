// Self-check for public/mdformat.js — run: node scripts/check-mdformat.js
const assert = require('assert');
const { apply } = require('../public/mdformat');

// Applies a format to `text` where [ ] marks the selection; returns the result with [ ] re-marked.
function run(marked, kind) {
  const s = marked.indexOf('['), e = marked.indexOf(']') - 1;
  const v = marked.replace('[', '').replace(']', '');
  const r = apply(v, s, e, kind);
  const out = v.slice(0, r.from) + r.text + v.slice(r.to);
  return out.slice(0, r.selStart) + '[' + out.slice(r.selStart, r.selEnd) + ']' + out.slice(r.selEnd);
}

// Wrap / unwrap
assert.strictEqual(run('say [hello] now', 'bold'), 'say **[hello]** now');
assert.strictEqual(run('say **[hello]** now', 'bold'), 'say [hello] now');
assert.strictEqual(run('say [**hello**] now', 'bold'), 'say [hello] now');
assert.strictEqual(run('say [hello ]now', 'bold'), 'say **[hello]** now');
assert.strictEqual(run('a [] b', 'italic'), 'a *[]* b');
assert.strictEqual(run('**[x]**', 'italic'), '***[x]***'); // italic inside bold adds, not strips
assert.strictEqual(run('***[x]***', 'italic'), '**[x]**');
assert.strictEqual(run('***[x]***', 'bold'), '*[x]*');
assert.strictEqual(run('[x]', 'highlight'), '==[x]==');
assert.strictEqual(run('[E=mc^2]', 'math'), '$[E=mc^2]$');

// Line prefixes
assert.strictEqual(run('ab[]c', 'bullet'), '- abc[]');
assert.strictEqual(run('- ab[]c', 'bullet'), 'abc[]');
assert.strictEqual(run('[one\ntwo\n\nthree]', 'number'), '[1. one\n2. two\n\n3. three]');
assert.strictEqual(run('[1. one\n2. two]', 'bullet'), '[- one\n- two]');
assert.strictEqual(run('[- one\n- two]', 'bullet'), '[one\ntwo]');
assert.strictEqual(run('x\n  in[]dented\ny', 'bullet'), 'x\n  - indented[]\ny');
assert.strictEqual(run('[q]', 'quote'), '[> q]');
assert.strictEqual(run('> [q]', 'quote'), '[q]');
assert.strictEqual(run('[]', 'bullet'), '- []');

// Furigana: selection / kanji run before caret → 漢字[caret]; toggles off when [..] follows
const fg = (v, s, e) => { const r = apply(v, s, e, 'furigana'); return [v.slice(0, r.from) + r.text + v.slice(r.to), r.selStart]; };
assert.deepStrictEqual(fg('今日は本', 0, 2), ['今日[]は本', 3]);
assert.deepStrictEqual(fg('私は本', 3, 3), ['私は本[]', 4]);
assert.deepStrictEqual(fg('ab', 1, 1), ['a[]b', 2]);
assert.deepStrictEqual(fg('本[ほん]です', 0, 1), ['本です', 0]);

console.log('check-mdformat: ok');
