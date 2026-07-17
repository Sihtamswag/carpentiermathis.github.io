const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');

const router = express.Router();

// Simple in-memory rate limiting: 10 attempts per IP per 15 minutes.
const attempts = new Map();
function isRateLimited(ip) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const record = attempts.get(ip) || { count: 0, resetAt: now + windowMs };
    if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + windowMs;
    }
    record.count += 1;
    attempts.set(ip, record);
    return record.count > 10;
}

router.post('/login', (req, res) => {
    const ip = req.ip;
    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans quelques minutes.' });
    }

    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
});

module.exports = router;
