require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const requireAuth = require('./middleware/requireAuth');
const { startScheduler } = require('./scheduler');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-to-a-long-random-string') {
    console.error('JWT_SECRET manquant ou laissé à sa valeur par défaut — configure un vrai secret avant de déployer.');
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', require('./routes/auth'));

app.use('/api/leads', requireAuth, require('./routes/leads'));
app.use('/api/tasks', requireAuth, require('./routes/tasks'));
app.use('/api/content', requireAuth, require('./routes/content'));
app.use('/api/metrics', requireAuth, require('./routes/metrics'));
app.use('/api/reminders', requireAuth, require('./routes/reminders'));
app.use('/api/settings', requireAuth, require('./routes/settings'));
app.use('/api/pipeline', requireAuth, require('./routes/pipeline'));

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Business Agents OS backend en écoute sur le port ${port}`);
    startScheduler();
});
