const express = require('express');
const { db } = require('../db');
const { sendEmail } = require('../services/email');

const router = express.Router();

router.get('/', (req, res) => {
    const leads = db.prepare('SELECT * FROM leads ORDER BY next_date IS NULL, next_date, created_at DESC').all();
    res.json(leads);
});

router.post('/', (req, res) => {
    const { name, contact, status, nextAction, nextDate, notes } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis.' });
    const info = db.prepare(`
        INSERT INTO leads (name, contact, status, next_action, next_date, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name.trim(), contact || '', status || 'nouveau', nextAction || '', nextDate || null, notes || '', Date.now());
    res.status(201).json(db.prepare('SELECT * FROM leads WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
    const { name, contact, status, nextAction, nextDate, notes } = req.body || {};
    const existing = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Prospect introuvable.' });
    db.prepare(`
        UPDATE leads SET name = ?, contact = ?, status = ?, next_action = ?, next_date = ?, notes = ?
        WHERE id = ?
    `).run(
        name?.trim() || existing.name,
        contact ?? existing.contact,
        status || existing.status,
        nextAction ?? existing.next_action,
        nextDate ?? existing.next_date,
        notes ?? existing.notes,
        req.params.id
    );
    res.json(db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
    res.status(204).end();
});

// Really sends an email to the lead's contact address (not just a draft).
router.post('/:id/send-email', async (req, res) => {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Prospect introuvable.' });
    if (!lead.contact || !lead.contact.includes('@')) {
        return res.status(400).json({ error: "Ce prospect n'a pas d'adresse email valide dans le champ contact." });
    }
    const { subject, body } = req.body || {};
    if (!subject || !body) return res.status(400).json({ error: 'Sujet et corps du message requis.' });

    try {
        await sendEmail({ to: lead.contact, subject, text: body });
        db.prepare('UPDATE leads SET last_emailed_at = ? WHERE id = ?').run(Date.now(), lead.id);
        db.prepare(`
            INSERT INTO activity_log (agent_id, agent_name, color, text, model, status, timestamp)
            VALUES ('sales', 'Sales Rep', 'sales', ?, 'smtp', 'COMPLETED', ?)
        `).run(`Email envoyé à ${lead.name} (${lead.contact})`, Date.now());
        res.json({ sent: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
