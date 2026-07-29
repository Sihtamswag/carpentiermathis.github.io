require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const requireAuth = require('./middleware/requireAuth');
const workspaceMiddleware = require('./middleware/workspace');
const { startScheduler } = require('./scheduler');
const { bootstrapAdmin } = require('./bootstrap-admin');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-to-a-long-random-string') {
    console.error('JWT_SECRET manquant ou laissé à sa valeur par défaut — configure un vrai secret avant de déployer.');
    process.exit(1);
}

bootstrapAdmin();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', require('./routes/auth'));

app.use('/api/leads', requireAuth, workspaceMiddleware, require('./routes/leads'));
app.use('/api/tasks', requireAuth, workspaceMiddleware, require('./routes/tasks'));
app.use('/api/content', requireAuth, workspaceMiddleware, require('./routes/content'));
app.use('/api/metrics', requireAuth, workspaceMiddleware, require('./routes/metrics'));
app.use('/api/reminders', requireAuth, workspaceMiddleware, require('./routes/reminders'));
app.use('/api/listings', requireAuth, workspaceMiddleware, require('./routes/listings'));
app.use('/api/settings', requireAuth, workspaceMiddleware, require('./routes/settings'));
app.use('/api/pipeline', requireAuth, workspaceMiddleware, require('./routes/pipeline'));
app.use('/api/sms', requireAuth, workspaceMiddleware, require('./routes/sms'));

// Twilio calls this directly — no JWT, verified via X-Twilio-Signature instead.
app.use('/api/sms-webhook', require('./routes/sms-webhook'));

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Business Agents OS backend en écoute sur le port ${port}`);
    startScheduler();
});
