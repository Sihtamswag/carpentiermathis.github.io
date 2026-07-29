const express = require('express');
const { getSetting, setSetting } = require('../db');
const email = require('../services/email');
const webhook = require('../services/webhook');

const router = express.Router();

// Only the "business" workspace falls back to the env var default — it
// existed before workspaces did, so PIPELINE_BUSINESS_CONTEXT stays tied to
// it rather than leaking into the real_estate workspace's first load.
function defaultContextFor(workspace) {
    return workspace === 'business' ? (process.env.PIPELINE_BUSINESS_CONTEXT || '') : '';
}

router.get('/', (req, res) => {
    // One-time migration: the "business" workspace used to store its context
    // under the plain "business_context" key, before real_estate existed.
    const scopedKey = `business_context:${req.workspace}`;
    let businessContext = getSetting(scopedKey, null);
    if (businessContext === null && req.workspace === 'business') {
        const legacy = getSetting('business_context', null);
        businessContext = legacy !== null ? legacy : defaultContextFor(req.workspace);
        setSetting(scopedKey, businessContext);
    } else if (businessContext === null) {
        businessContext = defaultContextFor(req.workspace);
    }

    res.json({
        workspace: req.workspace,
        businessContext,
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
        setSetting(`business_context:${req.workspace}`, businessContext);
    }
    res.json({ ok: true });
});

module.exports = router;
