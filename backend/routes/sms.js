const express = require('express');
const { db } = require('../db');
const sms = require('../services/sms');

const router = express.Router();

router.get('/:leadId', (req, res) => {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace = ?').get(req.params.leadId, req.workspace);
    if (!lead) return res.status(404).json({ error: 'Prospect introuvable.' });
    const messages = db.prepare('SELECT * FROM sms_messages WHERE lead_id = ? AND workspace = ? ORDER BY created_at ASC').all(lead.id, req.workspace);
    res.json({ lead, messages });
});

router.post('/:leadId/send', async (req, res) => {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace = ?').get(req.params.leadId, req.workspace);
    if (!lead) return res.status(404).json({ error: 'Prospect introuvable.' });
    if (!lead.contact) return res.status(400).json({ error: "Ce prospect n'a pas de numéro de téléphone dans le champ contact." });
    const { body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: 'Message requis.' });

    try {
        await sms.sendSms(lead.contact, body.trim());
        const info = db.prepare(`
            INSERT INTO sms_messages (lead_id, direction, body, status, ai_generated, created_at, workspace)
            VALUES (?, 'outbound', ?, 'sent', 0, ?, ?)
        `).run(lead.id, body.trim(), Date.now(), req.workspace);
        res.status(201).json(db.prepare('SELECT * FROM sms_messages WHERE id = ?').get(info.lastInsertRowid));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send an AI-drafted reply as-is (optionally edited first via PUT below).
router.post('/:leadId/drafts/:messageId/approve', async (req, res) => {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace = ?').get(req.params.leadId, req.workspace);
    if (!lead) return res.status(404).json({ error: 'Prospect introuvable.' });
    const draft = db.prepare("SELECT * FROM sms_messages WHERE id = ? AND lead_id = ? AND status = 'draft'").get(req.params.messageId, lead.id);
    if (!draft) return res.status(404).json({ error: 'Brouillon introuvable.' });

    try {
        await sms.sendSms(lead.contact, draft.body);
        db.prepare("UPDATE sms_messages SET status = 'sent' WHERE id = ?").run(draft.id);
        res.json(db.prepare('SELECT * FROM sms_messages WHERE id = ?').get(draft.id));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Edit a draft's text before approving it.
router.put('/:leadId/drafts/:messageId', (req, res) => {
    const { body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: 'Message requis.' });
    const draft = db.prepare("SELECT * FROM sms_messages WHERE id = ? AND lead_id = ? AND status = 'draft'").get(req.params.messageId, req.params.leadId);
    if (!draft) return res.status(404).json({ error: 'Brouillon introuvable.' });
    db.prepare('UPDATE sms_messages SET body = ? WHERE id = ?').run(body.trim(), draft.id);
    res.json(db.prepare('SELECT * FROM sms_messages WHERE id = ?').get(draft.id));
});

router.delete('/:leadId/drafts/:messageId', (req, res) => {
    db.prepare("DELETE FROM sms_messages WHERE id = ? AND lead_id = ? AND status = 'draft'").run(req.params.messageId, req.params.leadId);
    res.status(204).end();
});

module.exports = router;
