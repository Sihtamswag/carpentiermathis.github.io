// Creates (or updates) the single admin user from ADMIN_EMAIL / ADMIN_PASSWORD
// in the environment. Run this once after first deploy, then remove
// ADMIN_PASSWORD from your environment variables — the hash is what's used
// to log in from then on, not the plaintext env var.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db } = require('../db');

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment.');
    process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

if (existing) {
    db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, email);
    console.log(`Updated password for ${email}.`);
} else {
    db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(email, hash, Date.now());
    console.log(`Created admin user ${email}.`);
}
