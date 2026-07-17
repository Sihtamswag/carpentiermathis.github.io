const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact TEXT,
    status TEXT NOT NULL DEFAULT 'nouveau',
    next_action TEXT,
    next_date TEXT,
    notes TEXT,
    last_emailed_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manuel',
    priority TEXT NOT NULL DEFAULT 'moyenne',
    column_name TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS content_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'reseaux-sociaux',
    status TEXT NOT NULL DEFAULT 'brouillon',
    body TEXT,
    published_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    leads INTEGER NOT NULL DEFAULT 0,
    sales INTEGER NOT NULL DEFAULT 0,
    revenue REAL NOT NULL DEFAULT 0,
    traffic INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'hebdomadaire',
    next_date TEXT NOT NULL,
    last_run TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger TEXT NOT NULL DEFAULT 'manual',
    business_context TEXT NOT NULL,
    ceo_kickoff TEXT,
    researcher TEXT,
    cmo TEXT,
    sales TEXT,
    developer TEXT,
    analyst TEXT,
    ceo_debrief TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    error TEXT,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT,
    agent_name TEXT NOT NULL,
    color TEXT,
    text TEXT NOT NULL,
    model TEXT,
    status TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);
`);

function getSetting(key, fallback) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : fallback;
}

function setSetting(key, value) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

module.exports = { db, getSetting, setSetting };
