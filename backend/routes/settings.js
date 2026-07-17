const express = require('express');
const { getSetting, setSetting } = require('../db');
const email = require('../services/email');
const webhook = require('../services/webhook');

const router = express.Router();

router.get('/', (req, res) => {
    res.json({
        businessContext: getSetting('business_context', process.env.PIPELINE_BUSINESS_CONTEXT || ''),
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        cronSchedule: process.env.PIPELINE_CRON || '',
        notifyEmail: process.env.NOTIFY_EMAIL || '',
        emailConfigured: email.isConfigured(),
        webhookConfigured: webhook.isConfigured()
    });
});

router.put('/', (req, res) => {
    const { businessContext } = req.body || {};
    if (typeof businessContext === 'string') {
        setSetting('business_context', businessContext);
    }
    res.json({ ok: true });
});

module.exports = router;
