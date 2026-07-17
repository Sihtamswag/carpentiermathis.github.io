const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
    const { text, source, priority } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: 'Texte requis.' });
    const info = db.prepare(`
        INSERT INTO tasks (text, source, priority, column_name, created_at)
        VALUES (?, ?, ?, 'pending', ?)
    `).run(text.trim(), source || 'manuel', priority || 'moyenne', Date.now());
    res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id/move', (req, res) => {
    const { column } = req.body || {};
    if (!['pending', 'in_progress', 'done'].includes(column)) {
        return res.status(400).json({ error: 'Colonne invalide.' });
    }
    db.prepare('UPDATE tasks SET column_name = ? WHERE id = ?').run(column, req.params.id);
    res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.status(204).end();
});

module.exports = router;
