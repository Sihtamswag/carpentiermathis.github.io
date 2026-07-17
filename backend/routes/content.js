const express = require('express');
const { db } = require('../db');
const webhook = require('../services/webhook');

const router = express.Router();

router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM content_items ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
    const { title, channel, status, body } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'Titre requis.' });
    const info = db.prepare(`
        INSERT INTO content_items (title, channel, status, body, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(title.trim(), channel || 'reseaux-sociaux', status || 'brouillon', body || '', Date.now());
    res.status(201).json(db.prepare('SELECT * FROM content_items WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM content_items WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Contenu introuvable.' });
    const { title, channel, status, body } = req.body || {};
    db.prepare(`
        UPDATE content_items SET title = ?, channel = ?, status = ?, body = ? WHERE id = ?
    `).run(
        title?.trim() || existing.title,
        channel || existing.channel,
        status || existing.status,
        body ?? existing.body,
        req.params.id
    );
    res.json(db.prepare('SELECT * FROM content_items WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM content_items WHERE id = ?').run(req.params.id);
    res.status(204).end();
});

// Actually attempts to publish (via PUBLISH_WEBHOOK_URL) instead of just
// flipping a status flag, then records whether it really went out.
router.post('/:id/publish', async (req, res) => {
    const item = db.prepare('SELECT * FROM content_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Contenu introuvable.' });
    try {
        await webhook.publishContent(item);
        db.prepare("UPDATE content_items SET status = 'publie', published_at = ? WHERE id = ?").run(Date.now(), item.id);
        db.prepare(`
            INSERT INTO activity_log (agent_id, agent_name, color, text, model, status, timestamp)
            VALUES ('cmo', 'CMO', 'cmo', ?, 'webhook', 'COMPLETED', ?)
        `).run(`Contenu publié : ${item.title}`, Date.now());
        res.json(db.prepare('SELECT * FROM content_items WHERE id = ?').get(item.id));
    } catch (error) {
        db.prepare(`
            INSERT INTO activity_log (agent_id, agent_name, color, text, model, status, timestamp)
            VALUES ('cmo', 'CMO', 'cmo', ?, 'webhook', 'FAILED', ?)
        `).run(`Échec de publication : ${item.title}`, Date.now());
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
