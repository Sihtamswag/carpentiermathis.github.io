// Shared by server.js (auto-run at boot) and scripts/seed-admin.js (manual run).
// Creates the single admin user from ADMIN_EMAIL/ADMIN_PASSWORD if the users
// table is empty, or updates the password if that email already exists.
// Safe to call on every boot: if the users table already has someone AND it's
// not the configured admin email, it does nothing (never silently overwrites
// a different account).
const bcrypt = require('bcryptjs');
const { db } = require('./db');

function bootstrapAdmin() {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;

    if (!email || !password) {
        if (userCount === 0) {
            console.warn('Aucun utilisateur en base et ADMIN_EMAIL/ADMIN_PASSWORD non définis — personne ne pourra se connecter.');
        }
        return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const hash = bcrypt.hashSync(password, 12);

    if (existing) {
        db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, email);
        console.log(`[bootstrap] Mot de passe mis à jour pour ${email}.`);
    } else if (userCount === 0) {
        db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(email, hash, Date.now());
        console.log(`[bootstrap] Compte admin créé pour ${email}.`);
    }
    // If userCount > 0 and this email doesn't match any existing user, do
    // nothing — avoids silently adding a second account on every boot.
}

module.exports = { bootstrapAdmin };
