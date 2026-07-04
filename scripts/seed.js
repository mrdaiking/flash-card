require('dotenv').config();
const db = require('../db');

const deck = db.prepare('INSERT INTO decks (name) VALUES (?)').run('English Vocabulary');
const deckId = deck.lastInsertRowid;

// [front, back, example (chunk in context), type]
const cards = [
  ['leverage', 'To use something to maximum advantage.', 'We can leverage this data to improve UX.', 'vocab'],
  ['bottleneck', 'A point of congestion slowing down a process.', 'Code review became the bottleneck in our release.', 'vocab'],
  ['stakeholder', "Anyone with interest in a project's outcome.", 'We need buy-in from every stakeholder before launch.', 'vocab'],
  ['iterate', 'To repeat a process to improve the result.', 'Let’s iterate on the design based on user feedback.', 'vocab'],
  ['bandwidth', 'Capacity to handle work.', "I don't have the bandwidth to take that on this week.", 'collocation'],
  ['deliverable', 'A concrete output expected from a project.', 'The main deliverable is a working prototype by Friday.', 'vocab'],
  ['pivot', 'To change business strategy based on new information.', 'The startup decided to pivot to enterprise clients.', 'vocab'],
  ['traction', 'Early signs a product is gaining momentum.', 'The app is finally gaining traction with users.', 'collocation'],
  ['due diligence', 'Thorough research before making a decision.', 'We did our due diligence before signing the deal.', 'idiom'],
  ['async', 'Not requiring real-time interaction.', 'Let’s keep this async and update the doc instead of meeting.', 'vocab'],
];

const insert = db.prepare('INSERT INTO cards (deck_id, front, back, example, type) VALUES (?, ?, ?, ?, ?)');
for (const [front, back, example, type] of cards) insert.run(deckId, front, back, example, type);

console.log(`Seeded deck "English Vocabulary" with ${cards.length} cards`);
