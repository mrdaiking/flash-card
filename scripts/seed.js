require('dotenv').config();
const db = require('../db');

const deck = db.prepare('INSERT INTO decks (name) VALUES (?)').run('English Vocabulary');
const deckId = deck.lastInsertRowid;

const cards = [
  ['leverage', 'To use something to maximum advantage. "We can leverage this data to improve UX."'],
  ['bottleneck', 'A point of congestion slowing down a process.'],
  ['stakeholder', "Anyone with interest in a project's outcome."],
  ['iterate', 'To repeat a process to improve the result.'],
  ['bandwidth', 'Capacity to handle work (also literal network term).'],
  ['deliverable', 'A concrete output or result expected from a project.'],
  ['pivot', 'To change business strategy based on new information.'],
  ['traction', 'Early signs that a product/idea is gaining momentum.'],
  ['due diligence', 'Thorough research before making a decision.'],
  ['async', 'Short for asynchronous — not requiring real-time interaction.'],
];

const insert = db.prepare('INSERT INTO cards (deck_id, front, back) VALUES (?, ?, ?)');
for (const [front, back] of cards) insert.run(deckId, front, back);

console.log(`Seeded deck "English Vocabulary" with ${cards.length} cards`);
