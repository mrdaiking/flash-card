// Self-check for GET /api/cards/search — run: node scripts/check-search.js
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'search-'));
process.env.DB_PATH = path.join(tmp, 'cards.db');
const express = require('express');
const db = require('../db');
const app = express().use(express.json()).use('/api', require('../routes/cards'));

const deck = n => db.prepare('INSERT INTO decks (name) VALUES (?)').run(n).lastInsertRowid;
const card = (d, front, back, example = '', fav = 0) =>
  db.prepare('INSERT INTO cards (deck_id, front, back, example, is_favorite) VALUES (?,?,?,?,?)').run(d, front, back, example, fav).lastInsertRowid;
const d1 = deck('Eng'), d2 = deck('日本語');
const apple = card(d1, 'Apple', 'a fruit');
const pct = card(d1, '100% sure', 'literal percent');
card(d1, 'under_score', 'x');
const kanji = card(d2, '漢字[かんじ]', 'chinese characters', '', 1);
const blob = card(d1, 'photo', 'pic ![](data:image/png;base64,QUJDabcDEF)');
card(d1, 'zzz', 'back mentions apple here');

const server = app.listen(0, async () => {
  const get = async qs => (await fetch(`http://127.0.0.1:${server.address().port}/api/cards/search?${qs}`)).json();
  try {
    assert.deepStrictEqual(await get('q='), []);
    assert.deepStrictEqual(await get('q=%20%20'), []);

    let r = await get('q=APPLE');                       // case-insensitive, front ranked first
    assert.strictEqual(r.length, 2);
    assert.strictEqual(r[0].id, apple);
    assert.strictEqual(r[0].deck_name, 'Eng');

    assert.strictEqual((await get('q=' + encodeURIComponent('%'))).length, 1);   // % is literal
    assert.strictEqual((await get('q=_')).length, 1);                             // _ is literal

    r = await get('q=' + encodeURIComponent('かんじ')); // reading inside [..]
    assert.deepStrictEqual(r.map(c => c.id), [kanji]);
    assert.strictEqual((await get('q=' + encodeURIComponent('漢字'))).length, 1);

    assert.strictEqual((await get('q=apple&deck=' + d2)).length, 0);              // deck filter
    assert.strictEqual((await get('q=apple&deck=' + d1)).length, 2);
    assert.strictEqual((await get('q=a&favorites=1')).length, 1);                 // favorites filter
    assert.strictEqual((await get('q=apple&limit=1')).length, 1);                 // limit

    assert.strictEqual((await get('q=abcdef')).length, 0);                        // no match inside base64
    r = await get('q=pic');
    assert.strictEqual(r[0].id, blob);
    assert.ok(!r[0].back.includes('base64'), r[0].back);                          // blob stripped

    console.log('search checks passed');
  } catch (e) { console.error(e); process.exitCode = 1; }
  server.close(); fs.rmSync(tmp, { recursive: true, force: true });
});
