const express = require('express');
const { db } = require('../db');

const router = express.Router();

function advanceDate(dateStr, frequency) {
    const date = new Date(`${dateStr}T00:00:00`);
    if (frequency === 'mensuel') date.setMonth(date.getMonth() + 1);
    else if (frequency === 'quotidien') date.setDate(date.getDate() + 1);
    else date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
}

router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM reminders ORDER BY next_date ASC').all());
});

router.post('/', (req, res) => {
    const { label, frequency, nextDate, notes } = req.body || {};
    if (!label || !nextDate) return res.status(400).json({ error: 'Label et date requis.' });
    const info = db.prepare(`
        INSERT INTO reminders (label, frequency, next_date, notes, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(label.trim(), frequency || 'hebdomadaire', nextDate, notes || '', Date.now());
    res.status(201).json(db.prepare('SELECT * FROM reminders WHERE id = ?').get(info.lastInsertRowid));
});

router.post('/:id/done', (req, res) => {
    const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id);
    if (!reminder) return res.status(404).json({ error: 'Rappel introuvable.' });
    const today = new Date().toISOString().slice(0, 10);
    const nextDate = advanceDate(reminder.next_date, reminder.frequency);
    db.prepare('UPDATE reminders SET last_run = ?, next_date = ? WHERE id = ?').run(today, nextDate, reminder.id);
    res.json(db.prepare('SELECT * FROM reminders WHERE id = ?').get(reminder.id));
});

router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id);
    res.status(204).end();
});

module.exports = router;
