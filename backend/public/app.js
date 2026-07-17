// backend/public/app.js
// Talks to the Business Agents OS backend API — nothing here calls OpenAI or
// stores data in localStorage directly (beyond the auth token); everything
// lives in the server's database so it works from any device and keeps
// running (scheduled pipeline, real emails, real publish webhook) even when
// this tab is closed.

const TOKEN_KEY = 'bao-token';

const AGENTS = [
    { id: 'researcher', emoji: '🔎', name: 'Researcher', subtitle: 'INTEL GATHERER', color: 'researcher', desc: 'Signaux de marché, briefs de recherche, sources, contexte stratégique.' },
    { id: 'cmo', emoji: '📣', name: 'CMO', subtitle: 'MARKET VOICE', color: 'cmo', desc: 'Angles de contenu, campagnes, drafts prêts à publier.' },
    { id: 'sales', emoji: '💼', name: 'Sales Rep', subtitle: 'REVENUE OPS', color: 'sales', desc: 'Qualification des leads, outreach, suivi des opportunités.' },
    { id: 'developer', emoji: '🛠️', name: 'Dev', subtitle: 'BUILD SYSTEMS', color: 'developer', desc: 'Dashboards, intégrations, scripts, vérification technique.' },
    { id: 'analyst', emoji: '📊', name: 'Data Analyst', subtitle: 'SIGNAL LAYER', color: 'analyst', desc: 'Analyse de performance, tendances, qualité des signaux.' }
];

const METRIC_LABELS = { leads: 'Nouveaux leads', sales: 'Ventes', revenue: 'Revenu', traffic: 'Trafic' };
const KANBAN_COLUMNS = ['pending', 'in_progress', 'done'];
const PRIORITY_LABELS = { haute: 'Haute', moyenne: 'Moyenne', basse: 'Basse' };
const LEAD_STATUS_LABELS = { nouveau: 'Nouveau', contacte: 'Contacté', qualifie: 'Qualifié', negociation: 'Négociation', gagne: 'Gagné', perdu: 'Perdu' };
const CONTENT_CHANNEL_LABELS = { 'reseaux-sociaux': 'Réseaux sociaux', email: 'Email', blog: 'Blog', autre: 'Autre' };

// ===================== API HELPER =====================

async function api(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const response = await fetch(`/api${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (response.status === 401) {
        logout();
        throw new Error('Session expirée, reconnecte-toi.');
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erreur serveur (${response.status})`);
    return data;
}

// ===================== AUTH =====================

const loginScreen = document.getElementById('login-screen');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

function showApp() {
    loginScreen.hidden = true;
    appShell.hidden = false;
    initApp();
}

function showLogin() {
    loginScreen.hidden = false;
    appShell.hidden = true;
}

function logout() {
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
}

document.getElementById('logout-btn')?.addEventListener('click', logout);

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError.hidden = true;
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Connexion refusée.');
        localStorage.setItem(TOKEN_KEY, data.token);
        showApp();
    } catch (error) {
        loginError.textContent = error.message;
        loginError.hidden = false;
    }
});

if (localStorage.getItem(TOKEN_KEY)) {
    api('/settings').then(showApp).catch(showLogin);
} else {
    showLogin();
}

// ===================== TAB SWITCHING =====================

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tabId}`));
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ===================== SHARED HELPERS =====================

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineFormat(str) {
    return escapeHtml(str).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdown(text) {
    if (!text) return '';
    const lines = text.split('\n');
    let html = '';
    let inList = false;
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) { closeList(); return; }
        const headerMatch = line.match(/^#{1,4}\s+(.*)/);
        if (headerMatch) { closeList(); html += `<h4>${escapeHtml(headerMatch[1])}</h4>`; return; }
        const bulletMatch = line.match(/^[-*]\s+(.*)/);
        if (bulletMatch) {
            if (!inList) { html += '<ul>'; inList = true; }
            html += `<li>${inlineFormat(bulletMatch[1])}</li>`;
            return;
        }
        closeList();
        html += `<p>${inlineFormat(line)}</p>`;
    });
    closeList();
    return html;
}

function relativeTime(timestamp) {
    if (!timestamp) return 'jamais';
    const mins = Math.floor((Date.now() - timestamp) / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}j`;
}

function setGlobalStatus(message, type) {
    const el = document.getElementById('global-status');
    el.textContent = message;
    el.className = 'global-status ' + type;
    el.hidden = false;
}
function clearGlobalStatus() {
    const el = document.getElementById('global-status');
    el.hidden = true;
}

// ===================== INIT (once logged in) =====================

let appInitialized = false;

function initApp() {
    if (appInitialized) {
        refreshAll();
        return;
    }
    appInitialized = true;
    buildPipelineDom();
    wirePipeline();
    wireCrm();
    wireTasks();
    wireContent();
    wireMetrics();
    wireSchedule();
    refreshAll();
}

function refreshAll() {
    loadSettings();
    loadCommandStats();
    loadLog();
    loadLeads();
    loadTasks();
    loadContent();
    loadMetrics();
    loadReminders();
}

// ===================== PIPELINE =====================

function buildPipelineDom() {
    const pipelineEl = document.getElementById('pipeline');
    const stripEl = document.getElementById('agent-strip');
    pipelineEl.innerHTML = '';
    stripEl.innerHTML = '';
    AGENTS.forEach((agent) => {
        const chip = document.createElement('a');
        chip.className = 'strip-chip';
        chip.href = `#card-${agent.id}`;
        chip.dataset.color = agent.color;
        chip.innerHTML = `
            <span class="agent-emoji">${agent.emoji}</span>
            <span class="strip-name">${agent.name}</span>
            <span class="agent-status idle" id="strip-status-${agent.id}">idle</span>
        `;
        stripEl.appendChild(chip);

        const card = document.createElement('div');
        card.className = 'agent-card';
        card.id = `card-${agent.id}`;
        card.dataset.color = agent.color;
        card.innerHTML = `
            <div class="agent-card-header">
                <span class="agent-emoji">${agent.emoji}</span>
                <div><h3>${agent.name}</h3><p class="agent-subtitle">${agent.subtitle}</p></div>
                <span class="agent-status idle" id="status-${agent.id}">idle</span>
            </div>
            <p class="agent-desc">${agent.desc}</p>
            <div class="agent-output" id="output-${agent.id}"><p class="agent-placeholder">En attente du prochain run.</p></div>
            <div class="agent-actions">
                <button type="button" class="btn-secondary" data-copy="${agent.id}" disabled>Copier</button>
            </div>
        `;
        pipelineEl.appendChild(card);
    });
    pipelineEl.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const text = btn.dataset.text;
            if (text) navigator.clipboard.writeText(text);
        });
    });
}

function setAgentStatus(id, label, type) {
    ['status-', 'strip-status-'].forEach((prefix) => {
        const el = document.getElementById(`${prefix}${id}`);
        if (el) { el.textContent = label; el.className = 'agent-status ' + type; }
    });
}

function renderRunIntoDom(run) {
    const ceoOutput = document.getElementById('output-ceo');
    let ceoHtml = '';
    if (run.ceo_kickoff || run.ceoKickoff) ceoHtml += `<h4>Plan de routage</h4>${renderMarkdown(run.ceo_kickoff || run.ceoKickoff)}`;
    if (run.ceo_debrief || run.ceoDebrief) ceoHtml += `<h4>Debrief opérateur</h4>${renderMarkdown(run.ceo_debrief || run.ceoDebrief)}`;
    ceoOutput.innerHTML = ceoHtml || '<p class="agent-placeholder">Le plan de routage et la synthèse finale apparaîtront ici.</p>';
    setAgentStatus('ceo', run.status === 'error' ? 'error' : 'done', run.status === 'error' ? 'error' : 'done');

    AGENTS.forEach((agent) => {
        const text = run[agent.id];
        if (!text) return;
        const outputEl = document.getElementById(`output-${agent.id}`);
        outputEl.innerHTML = renderMarkdown(text);
        setAgentStatus(agent.id, 'done', 'done');
        const copyBtn = document.querySelector(`[data-copy="${agent.id}"]`);
        if (copyBtn) { copyBtn.disabled = false; copyBtn.dataset.text = text; }
    });

    const ceoCopyBtn = document.querySelector('[data-copy="ceo"]');
    // CEO card has no copy button in this build (kept minimal); skip if absent.
    if (ceoCopyBtn) ceoCopyBtn.disabled = false;
}

function wirePipeline() {
    document.getElementById('test-email-btn').addEventListener('click', async () => {
        const resultEl = document.getElementById('test-email-result');
        const btn = document.getElementById('test-email-btn');
        btn.disabled = true;
        resultEl.textContent = 'Envoi en cours...';
        resultEl.className = 'record-sub';
        try {
            await api('/pipeline/test-email', { method: 'POST' });
            resultEl.textContent = 'Envoyé — vérifie ta boîte de réception.';
            resultEl.className = 'record-sub delta-up';
        } catch (error) {
            resultEl.textContent = `Échec : ${error.message}`;
            resultEl.className = 'record-sub delta-down';
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('config-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const businessContext = document.getElementById('context-input').value.trim();
        if (!businessContext) {
            setGlobalStatus('Merci de décrire ton contexte business.', 'error');
            return;
        }
        const runBtn = document.getElementById('run-btn');
        runBtn.disabled = true;
        AGENTS.forEach((a) => setAgentStatus(a.id, 'working', 'working'));
        setAgentStatus('ceo', 'working', 'working');
        setGlobalStatus('Pipeline en cours sur le serveur (peut prendre 30-90s pour les 7 appels)...', 'info');
        try {
            await api('/settings', { method: 'PUT', body: { businessContext } });
            const run = await api('/pipeline/run', { method: 'POST', body: { businessContext } });
            renderRunIntoDom(run);
            clearGlobalStatus();
            loadCommandStats();
            loadLog();
        } catch (error) {
            setGlobalStatus(`Erreur : ${error.message}`, 'error');
            AGENTS.forEach((a) => setAgentStatus(a.id, 'error', 'error'));
            setAgentStatus('ceo', 'error', 'error');
        } finally {
            runBtn.disabled = false;
        }
    });

    document.getElementById('save-context-btn').addEventListener('click', async () => {
        const businessContext = document.getElementById('context-input').value.trim();
        try {
            await api('/settings', { method: 'PUT', body: { businessContext } });
            setGlobalStatus('Contexte enregistré — utilisé pour le prochain run (manuel ou automatique).', 'info');
            setTimeout(clearGlobalStatus, 2500);
        } catch (error) {
            setGlobalStatus(`Erreur : ${error.message}`, 'error');
        }
    });
}

async function loadSettings() {
    try {
        const settings = await api('/settings');
        document.getElementById('context-input').value = settings.businessContext || '';
        const info = document.getElementById('schedule-info');
        if (settings.cronSchedule) {
            info.textContent = `Exécution automatique programmée : "${settings.cronSchedule}" (heure serveur). Notifications : ${settings.emailConfigured ? settings.notifyEmail || 'configurées' : 'email non configuré'}.`;
        } else {
            info.textContent = "Aucune exécution automatique programmée (PIPELINE_CRON non défini côté serveur).";
        }
    } catch (error) {
        // ignore on first load race
    }
}

async function loadCommandStats() {
    try {
        const stats = await api('/pipeline/stats');
        document.getElementById('command-stats').innerHTML = `
            <div class="stat-tile"><span class="stat-tile-label">Appels totaux</span><span class="stat-tile-value">${stats.calls.toLocaleString('fr-FR')}</span></div>
            <div class="stat-tile"><span class="stat-tile-label">Tokens utilisés</span><span class="stat-tile-value">${stats.tokens.toLocaleString('fr-FR')}</span></div>
            <div class="stat-tile"><span class="stat-tile-label">Erreurs</span><span class="stat-tile-value ${stats.errors > 0 ? 'delta-down' : ''}">${stats.errors}</span></div>
            <div class="stat-tile"><span class="stat-tile-label">Dernière activité</span><span class="stat-tile-value">${relativeTime(stats.lastActivity)}</span></div>
        `;
    } catch (error) { /* ignore */ }
}

async function loadLog() {
    try {
        const entries = await api('/pipeline/log');
        const logList = document.getElementById('log-list');
        if (!entries.length) {
            logList.innerHTML = '<p class="log-empty">Aucune activité pour l\'instant.</p>';
            return;
        }
        logList.innerHTML = entries.map((e) => `
            <div class="log-row">
                <span class="log-agent-tag" style="--agent-accent: var(--c-${e.color || 'ceo'})">${escapeHtml(e.agent_name)}</span>
                <span class="log-text">${escapeHtml(e.text)}</span>
                <span class="log-model">${escapeHtml(e.model || '')}</span>
                <span class="log-state ${e.status === 'COMPLETED' ? 'completed' : 'failed'}">${e.status}</span>
                <span class="log-time">${relativeTime(e.timestamp)}</span>
            </div>
        `).join('');
    } catch (error) { /* ignore */ }
}

// ===================== CRM =====================

let leadsCache = [];

function wireCrm() {
    const form = document.getElementById('lead-form');
    const addBtn = document.getElementById('lead-add-btn');
    const cancelBtn = document.getElementById('lead-cancel-btn');
    const editingId = document.getElementById('lead-editing-id');

    addBtn.addEventListener('click', () => {
        editingId.value = '';
        form.reset();
        form.hidden = false;
    });
    cancelBtn.addEventListener('click', () => { form.hidden = true; });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
            name: document.getElementById('lead-name').value.trim(),
            contact: document.getElementById('lead-contact').value.trim(),
            status: document.getElementById('lead-status').value,
            nextAction: document.getElementById('lead-next-action').value.trim(),
            nextDate: document.getElementById('lead-next-date').value,
            notes: document.getElementById('lead-notes').value.trim()
        };
        try {
            if (editingId.value) {
                await api(`/leads/${editingId.value}`, { method: 'PUT', body: payload });
            } else {
                await api('/leads', { method: 'POST', body: payload });
            }
            form.hidden = true;
            loadLeads();
        } catch (error) {
            alert(error.message);
        }
    });

    const emailForm = document.getElementById('lead-email-form');
    document.getElementById('email-cancel-btn').addEventListener('click', () => { emailForm.hidden = true; });
    document.getElementById('email-send-btn').addEventListener('click', async () => {
        const leadId = document.getElementById('email-lead-id').value;
        const subject = document.getElementById('email-subject').value.trim();
        const body = document.getElementById('email-body').value.trim();
        if (!subject || !body) { alert('Sujet et message requis.'); return; }
        try {
            await api(`/leads/${leadId}/send-email`, { method: 'POST', body: { subject, body } });
            emailForm.hidden = true;
            setGlobalStatus('Email envoyé.', 'info');
            setTimeout(clearGlobalStatus, 2000);
            loadLeads();
            loadLog();
        } catch (error) {
            alert(`Échec de l'envoi : ${error.message}`);
        }
    });
}

async function loadLeads() {
    try {
        leadsCache = await api('/leads');
        renderLeads();
    } catch (error) { /* ignore */ }
}

function renderLeads() {
    const list = document.getElementById('lead-list');
    if (!leadsCache.length) { list.innerHTML = '<p class="agent-placeholder">Aucun prospect.</p>'; return; }
    list.innerHTML = leadsCache.map((lead) => `
        <div class="record-row">
            <div class="record-main">
                <div class="record-title-row">
                    <strong>${escapeHtml(lead.name)}</strong>
                    <span class="badge lead-status-${lead.status}">${LEAD_STATUS_LABELS[lead.status] || lead.status}</span>
                </div>
                ${lead.contact ? `<p class="record-sub">${escapeHtml(lead.contact)}</p>` : ''}
                ${lead.next_action ? `<p class="record-sub">Prochaine action : ${escapeHtml(lead.next_action)}${lead.next_date ? ` — ${lead.next_date}` : ''}</p>` : ''}
                ${lead.last_emailed_at ? `<p class="record-sub">Dernier email envoyé : ${relativeTime(lead.last_emailed_at)}</p>` : ''}
                ${lead.notes ? `<p class="record-notes">${escapeHtml(lead.notes)}</p>` : ''}
            </div>
            <div class="record-actions">
                <button type="button" class="btn-secondary btn-tiny" data-lead-edit="${lead.id}">Modifier</button>
                <button type="button" class="btn-secondary btn-tiny" data-lead-email="${lead.id}">Envoyer par email</button>
                <button type="button" class="btn-secondary btn-tiny" data-lead-delete="${lead.id}">Supprimer</button>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('[data-lead-edit]').forEach((btn) => btn.addEventListener('click', () => editLead(btn.dataset.leadEdit)));
    list.querySelectorAll('[data-lead-delete]').forEach((btn) => btn.addEventListener('click', () => deleteLead(btn.dataset.leadDelete)));
    list.querySelectorAll('[data-lead-email]').forEach((btn) => btn.addEventListener('click', () => openEmailForm(btn.dataset.leadEmail)));
}

function editLead(id) {
    const lead = leadsCache.find((l) => String(l.id) === String(id));
    if (!lead) return;
    document.getElementById('lead-editing-id').value = lead.id;
    document.getElementById('lead-name').value = lead.name;
    document.getElementById('lead-contact').value = lead.contact || '';
    document.getElementById('lead-status').value = lead.status;
    document.getElementById('lead-next-action').value = lead.next_action || '';
    document.getElementById('lead-next-date').value = lead.next_date || '';
    document.getElementById('lead-notes').value = lead.notes || '';
    document.getElementById('lead-form').hidden = false;
}

async function deleteLead(id) {
    await api(`/leads/${id}`, { method: 'DELETE' });
    loadLeads();
}

function openEmailForm(id) {
    const lead = leadsCache.find((l) => String(l.id) === String(id));
    if (!lead) return;
    if (!lead.contact || !lead.contact.includes('@')) {
        alert("Ce prospect n'a pas d'adresse email valide dans le champ contact.");
        return;
    }
    document.getElementById('email-lead-id').value = lead.id;
    document.getElementById('email-subject').value = `Suite à notre échange — ${lead.name}`;
    document.getElementById('email-body').value = '';
    document.getElementById('lead-email-form').hidden = false;
}

// ===================== TASKS (KANBAN) =====================

let tasksCache = [];

function wireTasks() {
    document.getElementById('task-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = document.getElementById('task-input');
        const text = input.value.trim();
        if (!text) return;
        const priority = document.getElementById('task-priority').value;
        await api('/tasks', { method: 'POST', body: { text, source: 'manuel', priority } });
        input.value = '';
        loadTasks();
    });
}

async function loadTasks() {
    try {
        tasksCache = await api('/tasks');
        renderTasks();
    } catch (error) { /* ignore */ }
}

function renderTasks() {
    KANBAN_COLUMNS.forEach((column) => {
        const columnEl = document.getElementById(`kanban-${column}`);
        const countEl = document.getElementById(`count-${column}`);
        const columnTasks = tasksCache.filter((t) => t.column_name === column);
        countEl.textContent = columnTasks.length;
        if (!columnTasks.length) { columnEl.innerHTML = '<p class="agent-placeholder">Vide</p>'; return; }
        columnEl.innerHTML = columnTasks.map((task) => {
            const index = KANBAN_COLUMNS.indexOf(task.column_name);
            return `
                <div class="kanban-card">
                    <div class="kanban-card-top">
                        <span class="badge priority-${task.priority}">${PRIORITY_LABELS[task.priority]}</span>
                        <button type="button" class="kanban-delete" data-task-delete="${task.id}">×</button>
                    </div>
                    <p class="kanban-card-text">${escapeHtml(task.text)}</p>
                    <div class="kanban-card-bottom">
                        <span class="task-source">${escapeHtml(task.source)}</span>
                        <div class="kanban-move">
                            <button type="button" class="btn-secondary btn-tiny" data-task-move="${task.id}" data-dir="-1" ${index === 0 ? 'disabled' : ''}>◀</button>
                            <button type="button" class="btn-secondary btn-tiny" data-task-move="${task.id}" data-dir="1" ${index === KANBAN_COLUMNS.length - 1 ? 'disabled' : ''}>▶</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    });

    document.querySelectorAll('[data-task-delete]').forEach((btn) => {
        btn.addEventListener('click', async () => { await api(`/tasks/${btn.dataset.taskDelete}`, { method: 'DELETE' }); loadTasks(); });
    });
    document.querySelectorAll('[data-task-move]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const task = tasksCache.find((t) => String(t.id) === String(btn.dataset.taskMove));
            const newIndex = KANBAN_COLUMNS.indexOf(task.column_name) + Number(btn.dataset.dir);
            if (newIndex < 0 || newIndex >= KANBAN_COLUMNS.length) return;
            await api(`/tasks/${task.id}/move`, { method: 'PUT', body: { column: KANBAN_COLUMNS[newIndex] } });
            loadTasks();
        });
    });
}

// ===================== CONTENT =====================

let contentCache = [];

function wireContent() {
    const form = document.getElementById('content-form');
    const addBtn = document.getElementById('content-add-btn');
    const cancelBtn = document.getElementById('content-cancel-btn');
    const editingId = document.getElementById('content-editing-id');

    addBtn.addEventListener('click', () => { editingId.value = ''; form.reset(); form.hidden = false; });
    cancelBtn.addEventListener('click', () => { form.hidden = true; });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
            title: document.getElementById('content-title').value.trim(),
            channel: document.getElementById('content-channel').value,
            body: document.getElementById('content-body').value.trim()
        };
        if (editingId.value) {
            await api(`/content/${editingId.value}`, { method: 'PUT', body: payload });
        } else {
            await api('/content', { method: 'POST', body: payload });
        }
        form.hidden = true;
        loadContent();
    });
}

async function loadContent() {
    try {
        contentCache = await api('/content');
        renderContent();
    } catch (error) { /* ignore */ }
}

function renderContent() {
    const list = document.getElementById('content-list');
    if (!contentCache.length) { list.innerHTML = '<p class="agent-placeholder">Aucun contenu.</p>'; return; }
    list.innerHTML = contentCache.map((item) => `
        <div class="record-row">
            <div class="record-main">
                <div class="record-title-row">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span class="badge channel-badge">${CONTENT_CHANNEL_LABELS[item.channel] || item.channel}</span>
                    <span class="badge">${item.status}</span>
                </div>
                ${item.body ? `<p class="record-notes">${escapeHtml(item.body).slice(0, 220)}</p>` : ''}
            </div>
            <div class="record-actions">
                <button type="button" class="btn-secondary btn-tiny" data-content-edit="${item.id}">Modifier</button>
                ${item.status !== 'publie' ? `<button type="button" class="btn-secondary btn-tiny" data-content-publish="${item.id}">Publier</button>` : ''}
                <button type="button" class="btn-secondary btn-tiny" data-content-delete="${item.id}">Supprimer</button>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('[data-content-edit]').forEach((btn) => btn.addEventListener('click', () => editContent(btn.dataset.contentEdit)));
    list.querySelectorAll('[data-content-delete]').forEach((btn) => btn.addEventListener('click', async () => { await api(`/content/${btn.dataset.contentDelete}`, { method: 'DELETE' }); loadContent(); }));
    list.querySelectorAll('[data-content-publish]').forEach((btn) => btn.addEventListener('click', async () => {
        try {
            await api(`/content/${btn.dataset.contentPublish}/publish`, { method: 'POST' });
            loadContent();
            loadLog();
        } catch (error) {
            alert(`Échec de publication : ${error.message}`);
        }
    }));
}

function editContent(id) {
    const item = contentCache.find((c) => String(c.id) === String(id));
    if (!item) return;
    document.getElementById('content-editing-id').value = item.id;
    document.getElementById('content-title').value = item.title;
    document.getElementById('content-channel').value = item.channel;
    document.getElementById('content-body').value = item.body || '';
    document.getElementById('content-form').hidden = false;
}

// ===================== METRICS =====================

let metricsCache = [];

function wireMetrics() {
    document.getElementById('metric-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('metric-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
            date: document.getElementById('metric-date').value,
            leads: Number(document.getElementById('metric-leads').value) || 0,
            sales: Number(document.getElementById('metric-sales').value) || 0,
            revenue: Number(document.getElementById('metric-revenue').value) || 0,
            traffic: Number(document.getElementById('metric-traffic').value) || 0,
            note: document.getElementById('metric-note').value.trim()
        };
        await api('/metrics', { method: 'POST', body: payload });
        document.getElementById('metric-note').value = '';
        loadMetrics();
    });
    document.getElementById('metric-select').addEventListener('change', renderMetricChart);
}

async function loadMetrics() {
    try {
        metricsCache = await api('/metrics');
        renderMetricTiles();
        renderMetricChart();
        renderMetricTable();
    } catch (error) { /* ignore */ }
}

function formatMetricValue(key, value) {
    if (key === 'revenue') return `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $`;
    return Number(value).toLocaleString('fr-FR');
}

function niceCeiling(value) {
    if (value <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / magnitude;
    let n;
    if (normalized <= 1) n = 1; else if (normalized <= 2) n = 2; else if (normalized <= 5) n = 5; else n = 10;
    return n * magnitude;
}

function renderMetricTiles() {
    const tiles = document.getElementById('metric-tiles');
    const last = metricsCache[metricsCache.length - 1];
    const prev = metricsCache[metricsCache.length - 2];
    if (!last) { tiles.innerHTML = '<p class="agent-placeholder">Ajoute un relevé pour voir tes indicateurs.</p>'; return; }
    tiles.innerHTML = Object.keys(METRIC_LABELS).map((key) => {
        const value = last[key];
        let deltaHtml = '';
        if (prev) {
            const delta = value - prev[key];
            const cls = delta > 0 ? 'delta-up' : (delta < 0 ? 'delta-down' : 'delta-flat');
            deltaHtml = `<span class="stat-delta ${cls}">${delta > 0 ? '+' : ''}${formatMetricValue(key, delta)}</span>`;
        }
        return `<div class="stat-tile"><span class="stat-tile-label">${METRIC_LABELS[key]}</span><span class="stat-tile-value">${formatMetricValue(key, value)}</span>${deltaHtml}</div>`;
    }).join('');
}

function renderMetricChart() {
    const key = document.getElementById('metric-select').value;
    const chartWrap = document.getElementById('metric-chart');
    if (!metricsCache.length) { chartWrap.innerHTML = '<p class="agent-placeholder">Ajoute au moins un relevé pour voir la tendance.</p>'; return; }

    const values = metricsCache.map((m) => Number(m[key]) || 0);
    const dates = metricsCache.map((m) => m.date);
    const width = 680, height = 220;
    const padding = { top: 20, right: 20, bottom: 28, left: 56 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;
    const niceMax = niceCeiling(Math.max(...values, 1));
    const xStep = values.length > 1 ? innerW / (values.length - 1) : 0;
    const xAt = (i) => padding.left + (values.length > 1 ? i * xStep : innerW / 2);
    const yAt = (v) => padding.top + innerH - (v / niceMax) * innerH;
    const points = values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');

    let gridlines = '';
    for (let g = 0; g <= 4; g++) {
        const val = (niceMax / 4) * g;
        const y = yAt(val);
        gridlines += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-grid-line"/><text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" class="chart-tick">${formatMetricValue(key, val)}</text>`;
    }
    const dots = values.map((v, i) => `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="4" class="chart-dot" data-i="${i}"/>`).join('');
    const lastIndex = values.length - 1;
    const endLabel = `<text x="${xAt(lastIndex)}" y="${yAt(values[lastIndex]) - 12}" text-anchor="end" class="chart-end-label">${formatMetricValue(key, values[lastIndex])}</text>`;

    chartWrap.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Tendance ${METRIC_LABELS[key]}">
            ${gridlines}<polyline points="${points}" class="chart-line"/>${dots}${endLabel}
        </svg>
        <div class="chart-tooltip" id="chart-tooltip" hidden></div>
    `;
    const tooltip = document.getElementById('chart-tooltip');
    chartWrap.querySelectorAll('.chart-dot').forEach((dot) => {
        dot.addEventListener('mouseenter', () => {
            const i = Number(dot.dataset.i);
            tooltip.textContent = `${dates[i]} — ${formatMetricValue(key, values[i])}`;
            tooltip.hidden = false;
            const rect = dot.getBoundingClientRect();
            const wrapRect = chartWrap.getBoundingClientRect();
            tooltip.style.left = `${rect.left - wrapRect.left + 10}px`;
            tooltip.style.top = `${rect.top - wrapRect.top - 30}px`;
        });
        dot.addEventListener('mouseleave', () => { tooltip.hidden = true; });
    });
}

function renderMetricTable() {
    const table = document.getElementById('metric-table');
    if (!metricsCache.length) { table.innerHTML = '<p class="agent-placeholder">Aucun relevé enregistré.</p>'; return; }
    const sorted = [...metricsCache].sort((a, b) => b.date.localeCompare(a.date));
    table.innerHTML = sorted.map((m) => `
        <div class="record-row">
            <div class="record-main">
                <div class="record-title-row"><strong>${m.date}</strong></div>
                <p class="record-sub">Leads: ${m.leads} · Ventes: ${m.sales} · Revenu: ${formatMetricValue('revenue', m.revenue)} · Trafic: ${m.traffic}</p>
                ${m.note ? `<p class="record-notes">${escapeHtml(m.note)}</p>` : ''}
            </div>
            <div class="record-actions"><button type="button" class="btn-secondary btn-tiny" data-metric-delete="${m.id}">Supprimer</button></div>
        </div>
    `).join('');
    table.querySelectorAll('[data-metric-delete]').forEach((btn) => btn.addEventListener('click', async () => { await api(`/metrics/${btn.dataset.metricDelete}`, { method: 'DELETE' }); loadMetrics(); }));
}

// ===================== SCHEDULE (reminders) =====================

function wireSchedule() {
    document.getElementById('schedule-next-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('schedule-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
            label: document.getElementById('schedule-label').value.trim(),
            frequency: document.getElementById('schedule-frequency').value,
            nextDate: document.getElementById('schedule-next-date').value,
            notes: document.getElementById('schedule-notes').value.trim()
        };
        await api('/reminders', { method: 'POST', body: payload });
        document.getElementById('schedule-label').value = '';
        document.getElementById('schedule-notes').value = '';
        loadReminders();
    });
}

async function loadReminders() {
    try {
        const reminders = await api('/reminders');
        renderReminders(reminders);
    } catch (error) { /* ignore */ }
}

function renderReminders(reminders) {
    const list = document.getElementById('schedule-list');
    if (!reminders.length) { list.innerHTML = '<p class="agent-placeholder">Aucun rappel programmé.</p>'; return; }
    const today = new Date().toISOString().slice(0, 10);
    list.innerHTML = reminders.map((r) => {
        let dueBadge;
        if (r.next_date < today) dueBadge = '<span class="badge due-late">En retard</span>';
        else if (r.next_date === today) dueBadge = '<span class="badge due-today">Aujourd\'hui</span>';
        else dueBadge = `<span class="badge due-upcoming">${r.next_date}</span>`;
        return `
            <div class="record-row">
                <div class="record-main">
                    <div class="record-title-row">
                        <strong>${escapeHtml(r.label)}</strong>
                        <span class="badge">${r.frequency}</span>
                        ${dueBadge}
                    </div>
                    ${r.notes ? `<p class="record-notes">${escapeHtml(r.notes)}</p>` : ''}
                    ${r.last_run ? `<p class="record-sub">Dernière fois : ${r.last_run}</p>` : ''}
                </div>
                <div class="record-actions">
                    <button type="button" class="btn-secondary btn-tiny" data-reminder-done="${r.id}">Marquer fait</button>
                    <button type="button" class="btn-secondary btn-tiny" data-reminder-delete="${r.id}">Supprimer</button>
                </div>
            </div>
        `;
    }).join('');
    list.querySelectorAll('[data-reminder-done]').forEach((btn) => btn.addEventListener('click', async () => { await api(`/reminders/${btn.dataset.reminderDone}/done`, { method: 'POST' }); loadReminders(); }));
    list.querySelectorAll('[data-reminder-delete]').forEach((btn) => btn.addEventListener('click', async () => { await api(`/reminders/${btn.dataset.reminderDelete}`, { method: 'DELETE' }); loadReminders(); }));
}
