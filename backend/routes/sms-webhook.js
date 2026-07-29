// Receives inbound SMS from Twilio (configured as the phone number's "A
// MESSAGE COMES IN" webhook). Not behind requireAuth — Twilio can't send a
// Bearer token — so every request is checked against Twilio's own request
// signature instead, using the exact public URL this route is registered at.
const express = require('express');
const { db } = require('../db');
const sms = require('../services/sms');
const email = require('../services/email');
const { draftSmsReply } = require('../agents/pipeline');

const router = express.Router();

function normalizePhone(value) {
    return (value || '').replace(/\D/g, '').slice(-10);
}

function findLeadByPhone(fromNumber) {
    const wanted = normalizePhone(fromNumber);
    if (!wanted) return null;
    const leads = db.prepare('SELECT * FROM leads WHERE contact IS NOT NULL AND contact != ?').all('');
    return leads.find((lead) => normalizePhone(lead.contact) === wanted) || null;
}

router.post('/', express.urlencoded({ extended: false }), async (req, res) => {
    const publicUrl = process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, '')}/api/sms-webhook` : null;
    const signature = req.headers['x-twilio-signature'];

    if (publicUrl && !sms.verifyTwilioSignature(publicUrl, req.body, signature)) {
        console.error('[sms-webhook] Signature Twilio invalide — requête ignorée.');
        return res.status(403).send('Invalid signature');
    }
    if (!publicUrl) {
        console.warn('[sms-webhook] PUBLIC_URL non configuré — signature Twilio non vérifiée (mode non sécurisé).');
    }

    const fromNumber = req.body.From;
    const messageBody = req.body.Body || '';

    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>'); // Acknowledge Twilio immediately; draft happens after.

    const lead = findLeadByPhone(fromNumber);
    if (!lead) {
        console.log(`[sms-webhook] SMS reçu de ${fromNumber} mais aucun prospect correspondant trouvé.`);
        return;
    }

    const workspace = lead.workspace;
    db.prepare(`
        INSERT INTO sms_messages (lead_id, direction, body, status, ai_generated, created_at, workspace)
        VALUES (?, 'inbound', ?, 'received', 0, ?, ?)
    `).run(lead.id, messageBody, Date.now(), workspace);

    db.prepare(`
        INSERT INTO activity_log (agent_id, agent_name, color, text, model, status, timestamp, workspace)
        VALUES ('sales', 'Sales Rep', 'sales', ?, 'sms', 'COMPLETED', ?, ?)
    `).run(`SMS reçu de ${lead.name}`, Date.now(), workspace);

    try {
        const history = db.prepare('SELECT * FROM sms_messages WHERE lead_id = ? ORDER BY created_at ASC').all(lead.id);
        const draftText = await draftSmsReply({ workspace, lead, history });
        db.prepare(`
            INSERT INTO sms_messages (lead_id, direction, body, status, ai_generated, created_at, workspace)
            VALUES (?, 'outbound', ?, 'draft', 1, ?, ?)
        `).run(lead.id, draftText, Date.now(), workspace);

        if (process.env.NOTIFY_EMAIL && email.isConfigured()) {
            await email.sendEmail({
                to: process.env.NOTIFY_EMAIL,
                subject: `SMS de ${lead.name} — réponse à valider`,
                text: `${lead.name} a répondu : "${messageBody}"\n\nBrouillon de réponse proposé :\n${draftText}\n\nConnecte-toi à l'app pour l'approuver, la modifier, ou la rejeter.`
            }).catch(() => {});
        }
    } catch (error) {
        console.error('[sms-webhook] Échec de la génération du brouillon de réponse :', error.message);
    }
});

module.exports = router;
