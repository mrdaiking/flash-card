const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

router.post('/', (req, res) => {
  if (req.body.pin !== process.env.APP_PIN) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }
  const token = jwt.sign({ auth: true }, process.env.TOKEN_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

module.exports = router;
