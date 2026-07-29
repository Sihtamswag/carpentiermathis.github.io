const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM metrics WHERE workspace = ? ORDER BY date ASC').all(req.workspace));
});

router.post('/', (req, res) => {
    const { date, leads, sales, revenue, traffic, note } = req.body || {};
    if (!date) return res.status(400).json({ error: 'Date requise.' });
    db.prepare(`
        INSERT INTO metrics (date, leads, sales, revenue, traffic, note, created_at, workspace)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, workspace) DO UPDATE SET leads = excluded.leads, sales = excluded.sales,
            revenue = excluded.revenue, traffic = excluded.traffic, note = excluded.note
    `).run(date, Number(leads) || 0, Number(sales) || 0, Number(revenue) || 0, Number(traffic) || 0, note || '', Date.now(), req.workspace);
    res.status(201).json(db.prepare('SELECT * FROM metrics WHERE date = ? AND workspace = ?').get(date, req.workspace));
});

router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM metrics WHERE id = ? AND workspace = ?').run(req.params.id, req.workspace);
    res.status(204).end();
});

module.exports = router;
