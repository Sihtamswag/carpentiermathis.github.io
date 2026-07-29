const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM listings WHERE workspace = ? ORDER BY created_at DESC').all(req.workspace));
});

router.post('/', (req, res) => {
    const { title, url, price, propertyType, address, status, notes } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'Titre requis.' });
    const info = db.prepare(`
        INSERT INTO listings (title, url, price, property_type, address, status, notes, created_at, workspace)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        title.trim(),
        url || '',
        Number(price) || 0,
        propertyType || 'autre',
        address || '',
        status || 'active',
        notes || '',
        Date.now(),
        req.workspace
    );
    res.status(201).json(db.prepare('SELECT * FROM listings WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM listings WHERE id = ? AND workspace = ?').get(req.params.id, req.workspace);
    if (!existing) return res.status(404).json({ error: 'Annonce introuvable.' });
    const { title, url, price, propertyType, address, status, notes } = req.body || {};
    db.prepare(`
        UPDATE listings SET title = ?, url = ?, price = ?, property_type = ?, address = ?, status = ?, notes = ?
        WHERE id = ?
    `).run(
        title?.trim() || existing.title,
        url ?? existing.url,
        price !== undefined ? Number(price) || 0 : existing.price,
        propertyType || existing.property_type,
        address ?? existing.address,
        status || existing.status,
        notes ?? existing.notes,
        req.params.id
    );
    res.json(db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM listings WHERE id = ? AND workspace = ?').run(req.params.id, req.workspace);
    res.status(204).end();
});

module.exports = router;
