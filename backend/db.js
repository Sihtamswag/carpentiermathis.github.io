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

CREATE TABLE IF NOT EXISTS sms_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    direction TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    ai_generated INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT,
    price REAL,
    property_type TEXT NOT NULL DEFAULT 'autre',
    address TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at INTEGER NOT NULL
);
`);

// Migration: add a `workspace` column to every business-data table so the
// same backend can run two fully separate business units ("business" and
// "real_estate") side by side. Existing rows default to 'business' so
// nothing already in production gets lost or reassigned.
const WORKSPACE_TABLES = ['leads', 'tasks', 'content_items', 'metrics', 'reminders', 'agent_runs', 'activity_log', 'sms_messages', 'listings'];
WORKSPACE_TABLES.forEach((table) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    const hasWorkspace = columns.some((col) => col.name === 'workspace');
    if (!hasWorkspace) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN workspace TEXT NOT NULL DEFAULT 'business'`);
    }
});

// `metrics.date` was UNIQUE on its own (one snapshot per day, total). Now
// that a day can have one snapshot per workspace, that constraint has to
// move to (date, workspace) — SQLite can't drop a column constraint in
// place, so rebuild the table the standard way if the old constraint is
// still there.
const metricsTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'metrics'").get();
if (metricsTableSql && /date\s+TEXT\s+UNIQUE/i.test(metricsTableSql.sql)) {
    db.exec(`
        CREATE TABLE metrics_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            leads INTEGER NOT NULL DEFAULT 0,
            sales INTEGER NOT NULL DEFAULT 0,
            revenue REAL NOT NULL DEFAULT 0,
            traffic INTEGER NOT NULL DEFAULT 0,
            note TEXT,
            created_at INTEGER NOT NULL,
            workspace TEXT NOT NULL DEFAULT 'business'
        );
        INSERT INTO metrics_new (id, date, leads, sales, revenue, traffic, note, created_at, workspace)
            SELECT id, date, leads, sales, revenue, traffic, note, created_at, workspace FROM metrics;
        DROP TABLE metrics;
        ALTER TABLE metrics_new RENAME TO metrics;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_date_workspace ON metrics(date, workspace);
    `);
}

const WORKSPACES = ['business', 'real_estate'];
function normalizeWorkspace(value) {
    return WORKSPACES.includes(value) ? value : 'business';
}

function getSetting(key, fallback) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : fallback;
}

function setSetting(key, value) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

module.exports = { db, getSetting, setSetting, WORKSPACES, normalizeWorkspace };
