const express = require('express');
const { db, getSetting } = require('../db');
const { runPipeline } = require('../agents/pipeline');
const { sendEmail } = require('../services/email');

const router = express.Router();

router.post('/run', async (req, res) => {
    const businessContext = (req.body && req.body.businessContext) || getSetting('business_context', process.env.PIPELINE_BUSINESS_CONTEXT || '');
    try {
        const run = await runPipeline({ businessContext, trigger: 'manual' });
        res.status(201).json(run);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/runs', (req, res) => {
    const runs = db.prepare('SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT 20').all();
    res.json(runs);
});

router.get('/runs/:id', (req, res) => {
    const run = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run introuvable.' });
    res.json(run);
});

router.get('/log', (req, res) => {
    res.json(db.prepare('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 50').all());
});

router.get('/stats', (req, res) => {
    const calls = db.prepare("SELECT COUNT(*) c FROM activity_log WHERE status = 'COMPLETED'").get().c;
    const errors = db.prepare("SELECT COUNT(*) c FROM activity_log WHERE status = 'FAILED'").get().c;
    const tokens = db.prepare('SELECT COALESCE(SUM(total_tokens), 0) t FROM agent_runs').get().t;
    const reports = db.prepare("SELECT COUNT(*) c FROM agent_runs WHERE status = 'completed'").get().c;
    const last = db.prepare('SELECT timestamp FROM activity_log ORDER BY timestamp DESC LIMIT 1').get();
    res.json({ calls, errors, tokens, reports, lastActivity: last ? last.timestamp : null });
});

// Manually test that the email summary would actually go out.
router.post('/test-email', async (req, res) => {
    try {
        await sendEmail({
            to: process.env.NOTIFY_EMAIL,
            subject: 'Business Agents OS — test',
            text: "Si tu reçois cet email, ta configuration SMTP fonctionne."
        });
        res.json({ sent: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
