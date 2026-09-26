// Self-check for public/csv.js — run: node scripts/check-csv.js
const assert = require('assert');
const { detectDelimiter, parseDelimited, dedupKey, ideaWarnings } = require('../public/csv');

assert.strictEqual(detectDelimiter('front,back\na,b'), ',');
assert.strictEqual(detectDelimiter('apple | fruit'), '|');
assert.strictEqual(detectDelimiter('a\tb,c\td'), '\t');

assert.deepStrictEqual(
  parseDelimited('front,back\n"a, with comma","line1\nline2"\r\n"say ""hi""",x\n\n', ','),
  [['front', 'back'], ['a, with comma', 'line1\nline2'], ['say "hi"', 'x']],
);
assert.deepStrictEqual(parseDelimited('apple | fruit | an apple a day', '|'), [['apple ', ' fruit ', ' an apple a day']]);

assert.strictEqual(dedupKey('  Hello   World '), 'hello world');

assert.deepStrictEqual(ideaWarnings('dog', 'inu'), []);
assert.strictEqual(ideaWarnings('colors', 'red; blue; green').length, 1);
assert.strictEqual(ideaWarnings('steps', '1. mix 2. bake').length, 1);
assert.strictEqual(ideaWarnings('x', 'a'.repeat(151)).length, 1);
assert.deepStrictEqual(ideaWarnings('sign', 'stop\n\n![](data:image/png;base64,AAA)'), []);
assert.strictEqual(ideaWarnings('why? and how?', 'because').length, 1);

console.log('csv checks passed');
