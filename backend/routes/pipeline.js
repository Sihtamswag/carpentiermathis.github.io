const express = require('express');
const { db, getSetting } = require('../db');
const { runPipeline } = require('../agents/pipeline');
const { sendEmail } = require('../services/email');

const router = express.Router();

router.post('/run', async (req, res) => {
    const businessContext = (req.body && req.body.businessContext) || getSetting(`business_context:${req.workspace}`, '');
    try {
        const run = await runPipeline({ businessContext, trigger: 'manual', workspace: req.workspace });
        res.status(201).json(run);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/runs', (req, res) => {
    const runs = db.prepare('SELECT * FROM agent_runs WHERE workspace = ? ORDER BY started_at DESC LIMIT 20').all(req.workspace);
    res.json(runs);
});

router.get('/runs/:id', (req, res) => {
    const run = db.prepare('SELECT * FROM agent_runs WHERE id = ? AND workspace = ?').get(req.params.id, req.workspace);
    if (!run) return res.status(404).json({ error: 'Run introuvable.' });
    res.json(run);
});

router.get('/log', (req, res) => {
    res.json(db.prepare('SELECT * FROM activity_log WHERE workspace = ? ORDER BY timestamp DESC LIMIT 50').all(req.workspace));
});

router.get('/stats', (req, res) => {
    const calls = db.prepare("SELECT COUNT(*) c FROM activity_log WHERE status = 'COMPLETED' AND workspace = ?").get(req.workspace).c;
    const errors = db.prepare("SELECT COUNT(*) c FROM activity_log WHERE status = 'FAILED' AND workspace = ?").get(req.workspace).c;
    const tokens = db.prepare('SELECT COALESCE(SUM(total_tokens), 0) t FROM agent_runs WHERE workspace = ?').get(req.workspace).t;
    const reports = db.prepare("SELECT COUNT(*) c FROM agent_runs WHERE status = 'completed' AND workspace = ?").get(req.workspace).c;
    const last = db.prepare('SELECT timestamp FROM activity_log WHERE workspace = ? ORDER BY timestamp DESC LIMIT 1').get(req.workspace);
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
