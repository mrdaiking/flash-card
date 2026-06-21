require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));
app.use(express.static(path.join(__dirname, 'public')));

const auth = require('./middleware/auth');

app.use('/api/auth', require('./routes/auth'));
app.use('/api', auth, require('./routes/decks'));
app.use('/api', auth, require('./routes/cards'));
app.use('/api', auth, require('./routes/stats'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
