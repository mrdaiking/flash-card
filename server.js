require('dotenv').config();
const express = require('express');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const auth = require('./middleware/auth');

const git = args => { try { return execSync(`git ${args}`, { cwd: __dirname }).toString().trim(); } catch { return ''; } };
const versionInfo = { version: require('./package.json').version, commit: git('rev-parse --short HEAD') || 'dev', date: git('log -1 --format=%cs') };
app.get('/api/version', auth, (req, res) => res.json(versionInfo));

app.use('/api/auth', require('./routes/auth'));
app.use('/api', auth, require('./routes/decks'));
app.use('/api', auth, require('./routes/cards'));
app.use('/api', auth, require('./routes/stats'));
app.use('/api', auth, require('./routes/journal'));
const pushRoutes = require('./routes/push');
app.use('/api', auth, pushRoutes);
pushRoutes.scheduleDailyReminder();
const digestRoutes = require('./routes/digest');
app.use('/api', auth, digestRoutes);
digestRoutes.scheduleDigest();

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
