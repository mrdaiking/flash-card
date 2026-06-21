function sm2(card, rating) {
  // rating: 1=Again, 2=Hard, 3=Good, 4=Easy
  if (rating === 1) {
    card.interval = 1;
    card.repetitions = 0;
    card.easeFactor = Math.max(1.3, card.easeFactor - 0.2);
  } else {
    if (card.repetitions === 0) card.interval = 1;
    else if (card.repetitions === 1) card.interval = 6;
    else card.interval = Math.round(card.interval * card.easeFactor);

    card.easeFactor += [0, -0.15, 0, 0.1][rating - 1];
    card.easeFactor = Math.max(1.3, card.easeFactor);
    card.repetitions += 1;
  }

  card.nextReview = Date.now() + card.interval * 86400000;
  return card;
}

module.exports = { sm2 };
