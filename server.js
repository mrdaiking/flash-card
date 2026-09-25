require('dotenv').config();
const express = require('express');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.text({ type: 'text/plain' }));
app.use(express.static(path.join(__dirname, 'public')));

const auth = require('./middleware/auth');

let commitHash = 'dev';
try { commitHash = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch {}
app.get('/api/version', auth, (req, res) => res.json({ commit: commitHash }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api', auth, require('./routes/decks'));
app.use('/api', auth, require('./routes/cards'));
app.use('/api', auth, require('./routes/stats'));
app.use('/api', auth, require('./routes/journal'));
const pushRoutes = require('./routes/push');
app.use('/api', auth, pushRoutes);
pushRoutes.scheduleDailyReminder();

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
