// agents-system/manage.js
// Persistent business management layer: CRM (leads), tasks, content calendar,
// and business metrics — all stored in localStorage, all local to this browser.
// Exposes window.ManageAPI so app.js (the agent pipeline) can read/write into it.

const LEADS_KEY = 'agents-system-leads';
const TASKS_KEY = 'agents-system-tasks';
const CONTENT_KEY = 'agents-system-content';
const METRICS_KEY = 'agents-system-metrics';

const LEAD_STATUS_LABELS = {
    nouveau: 'Nouveau',
    contacte: 'Contacté',
    qualifie: 'Qualifié',
    negociation: 'Négociation',
    gagne: 'Gagné',
    perdu: 'Perdu'
};

const CONTENT_STATUS_LABELS = {
    brouillon: 'Brouillon',
    pret: 'Prêt',
    publie: 'Publié'
};

const CONTENT_CHANNEL_LABELS = {
    'reseaux-sociaux': 'Réseaux sociaux',
    email: 'Email',
    blog: 'Blog',
    autre: 'Autre'
};

const METRIC_LABELS = {
    leads: 'Nouveaux leads',
    sales: 'Ventes',
    revenue: 'Revenu',
    traffic: 'Trafic'
};

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadArray(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
        return [];
    }
}

function saveArray(key, arr) {
    localStorage.setItem(key, JSON.stringify(arr));
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ===================== TAB SWITCHING =====================

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `tab-${tabId}`);
    });
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ===================== CRM (LEADS) =====================

let leads = loadArray(LEADS_KEY);

const leadAddBtn = document.getElementById('lead-add-btn');
const leadForm = document.getElementById('lead-form');
const leadEditingId = document.getElementById('lead-editing-id');
const leadName = document.getElementById('lead-name');
const leadContact = document.getElementById('lead-contact');
const leadStatus = document.getElementById('lead-status');
const leadNextAction = document.getElementById('lead-next-action');
const leadNextDate = document.getElementById('lead-next-date');
const leadNotes = document.getElementById('lead-notes');
const leadCancelBtn = document.getElementById('lead-cancel-btn');
const leadList = document.getElementById('lead-list');

function resetLeadForm() {
    leadEditingId.value = '';
    leadName.value = '';
    leadContact.value = '';
    leadStatus.value = 'nouveau';
    leadNextAction.value = '';
    leadNextDate.value = '';
    leadNotes.value = '';
}

leadAddBtn.addEventListener('click', () => {
    resetLeadForm();
    leadForm.hidden = false;
    leadName.focus();
});

leadCancelBtn.addEventListener('click', () => {
    leadForm.hidden = true;
    resetLeadForm();
});

leadForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!leadName.value.trim()) return;

    const editingId = leadEditingId.value;
    if (editingId) {
        const lead = leads.find((l) => l.id === editingId);
        if (lead) {
            lead.name = leadName.value.trim();
            lead.contact = leadContact.value.trim();
            lead.status = leadStatus.value;
            lead.nextAction = leadNextAction.value.trim();
            lead.nextDate = leadNextDate.value;
            lead.notes = leadNotes.value.trim();
        }
    } else {
        leads.push({
            id: uid(),
            name: leadName.value.trim(),
            contact: leadContact.value.trim(),
            status: leadStatus.value,
            nextAction: leadNextAction.value.trim(),
            nextDate: leadNextDate.value,
            notes: leadNotes.value.trim(),
            createdAt: Date.now()
        });
    }
    saveArray(LEADS_KEY, leads);
    leadForm.hidden = true;
    resetLeadForm();
    renderLeads();
});

function editLead(id) {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    leadEditingId.value = lead.id;
    leadName.value = lead.name;
    leadContact.value = lead.contact || '';
    leadStatus.value = lead.status;
    leadNextAction.value = lead.nextAction || '';
    leadNextDate.value = lead.nextDate || '';
    leadNotes.value = lead.notes || '';
    leadForm.hidden = false;
    leadName.focus();
}

function deleteLead(id) {
    leads = leads.filter((l) => l.id !== id);
    saveArray(LEADS_KEY, leads);
    renderLeads();
}

function renderLeads() {
    if (!leads.length) {
        leadList.innerHTML = '<p class="agent-placeholder">Aucun prospect pour l\'instant.</p>';
        return;
    }
    const sorted = [...leads].sort((a, b) => {
        if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
        if (a.nextDate) return -1;
        if (b.nextDate) return 1;
        return b.createdAt - a.createdAt;
    });
    leadList.innerHTML = sorted.map((lead) => `
        <div class="record-row">
            <div class="record-main">
                <div class="record-title-row">
                    <strong>${escapeHtml(lead.name)}</strong>
                    <span class="badge lead-status-${lead.status}">${LEAD_STATUS_LABELS[lead.status]}</span>
                </div>
                ${lead.contact ? `<p class="record-sub">${escapeHtml(lead.contact)}</p>` : ''}
                ${lead.nextAction ? `<p class="record-sub">Prochaine action : ${escapeHtml(lead.nextAction)}${lead.nextDate ? ` — ${escapeHtml(lead.nextDate)}` : ''}</p>` : ''}
                ${lead.notes ? `<p class="record-notes">${escapeHtml(lead.notes)}</p>` : ''}
            </div>
            <div class="record-actions">
                <button type="button" class="btn-secondary btn-tiny" data-lead-edit="${lead.id}">Modifier</button>
                <button type="button" class="btn-secondary btn-tiny" data-lead-delete="${lead.id}">Supprimer</button>
            </div>
        </div>
    `).join('');

    leadList.querySelectorAll('[data-lead-edit]').forEach((btn) => {
        btn.addEventListener('click', () => editLead(btn.dataset.leadEdit));
    });
    leadList.querySelectorAll('[data-lead-delete]').forEach((btn) => {
        btn.addEventListener('click', () => deleteLead(btn.dataset.leadDelete));
    });
}

function getLeadsSummary() {
    if (!leads.length) return "Aucun prospect enregistré pour l'instant dans le CRM.";
    const active = leads.filter((l) => l.status !== 'gagne' && l.status !== 'perdu');
    if (!active.length) return "Tous les prospects enregistrés sont clos (gagnés ou perdus).";
    return active.slice(0, 10).map((l) =>
        `- ${l.name} (${LEAD_STATUS_LABELS[l.status]})${l.nextAction ? `, prochaine action : ${l.nextAction}` : ''}${l.nextDate ? ` le ${l.nextDate}` : ''}`
    ).join('\n');
}

// ===================== TASKS =====================

let tasks = loadArray(TASKS_KEY);

const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('task-input');
const taskList = document.getElementById('task-list');

taskForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = taskInput.value.trim();
    if (!text) return;
    addTask(text, 'manuel');
    taskInput.value = '';
});

function addTask(text, source) {
    tasks.push({ id: uid(), text, source: source || 'manuel', done: false, createdAt: Date.now() });
    saveArray(TASKS_KEY, tasks);
    renderTasks();
}

function toggleTask(id) {
    const task = tasks.find((t) => t.id === id);
    if (task) task.done = !task.done;
    saveArray(TASKS_KEY, tasks);
    renderTasks();
}

function deleteTask(id) {
    tasks = tasks.filter((t) => t.id !== id);
    saveArray(TASKS_KEY, tasks);
    renderTasks();
}

function renderTasks() {
    if (!tasks.length) {
        taskList.innerHTML = '<p class="agent-placeholder">Aucune tâche pour l\'instant.</p>';
        return;
    }
    const sorted = [...tasks].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return b.createdAt - a.createdAt;
    });
    taskList.innerHTML = sorted.map((task) => `
        <div class="record-row task-row ${task.done ? 'task-done' : ''}">
            <label class="task-check">
                <input type="checkbox" data-task-toggle="${task.id}" ${task.done ? 'checked' : ''}>
                <span>${escapeHtml(task.text)}</span>
            </label>
            <div class="record-actions">
                <span class="task-source">${escapeHtml(task.source)}</span>
                <button type="button" class="btn-secondary btn-tiny" data-task-delete="${task.id}">Supprimer</button>
            </div>
        </div>
    `).join('');

    taskList.querySelectorAll('[data-task-toggle]').forEach((el) => {
        el.addEventListener('change', () => toggleTask(el.dataset.taskToggle));
    });
    taskList.querySelectorAll('[data-task-delete]').forEach((btn) => {
        btn.addEventListener('click', () => deleteTask(btn.dataset.taskDelete));
    });
}

// ===================== CONTENT CALENDAR =====================

let contentItems = loadArray(CONTENT_KEY);

const contentAddBtn = document.getElementById('content-add-btn');
const contentForm = document.getElementById('content-form');
const contentEditingId = document.getElementById('content-editing-id');
const contentTitle = document.getElementById('content-title');
const contentChannel = document.getElementById('content-channel');
const contentStatus = document.getElementById('content-status');
const contentBody = document.getElementById('content-body');
const contentCancelBtn = document.getElementById('content-cancel-btn');
const contentList = document.getElementById('content-list');

function resetContentForm() {
    contentEditingId.value = '';
    contentTitle.value = '';
    contentChannel.value = 'reseaux-sociaux';
    contentStatus.value = 'brouillon';
    contentBody.value = '';
}

contentAddBtn.addEventListener('click', () => {
    resetContentForm();
    contentForm.hidden = false;
    contentTitle.focus();
});

contentCancelBtn.addEventListener('click', () => {
    contentForm.hidden = true;
    resetContentForm();
});

contentForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!contentTitle.value.trim()) return;

    const editingId = contentEditingId.value;
    if (editingId) {
        const item = contentItems.find((c) => c.id === editingId);
        if (item) {
            item.title = contentTitle.value.trim();
            item.channel = contentChannel.value;
            item.status = contentStatus.value;
            item.body = contentBody.value.trim();
        }
    } else {
        contentItems.push({
            id: uid(),
            title: contentTitle.value.trim(),
            channel: contentChannel.value,
            status: contentStatus.value,
            body: contentBody.value.trim(),
            createdAt: Date.now()
        });
    }
    saveArray(CONTENT_KEY, contentItems);
    contentForm.hidden = true;
    resetContentForm();
    renderContent();
});

function addContentFromText(title, body) {
    contentItems.push({
        id: uid(),
        title,
        channel: 'reseaux-sociaux',
        status: 'brouillon',
        body,
        createdAt: Date.now()
    });
    saveArray(CONTENT_KEY, contentItems);
    renderContent();
}

function editContent(id) {
    const item = contentItems.find((c) => c.id === id);
    if (!item) return;
    contentEditingId.value = item.id;
    contentTitle.value = item.title;
    contentChannel.value = item.channel;
    contentStatus.value = item.status;
    contentBody.value = item.body;
    contentForm.hidden = false;
    contentTitle.focus();
}

function deleteContent(id) {
    contentItems = contentItems.filter((c) => c.id !== id);
    saveArray(CONTENT_KEY, contentItems);
    renderContent();
}

function setContentStatus(id, status) {
    const item = contentItems.find((c) => c.id === id);
    if (item) item.status = status;
    saveArray(CONTENT_KEY, contentItems);
    renderContent();
}

function renderContent() {
    if (!contentItems.length) {
        contentList.innerHTML = '<p class="agent-placeholder">Aucun contenu pour l\'instant.</p>';
        return;
    }
    const sorted = [...contentItems].sort((a, b) => b.createdAt - a.createdAt);
    contentList.innerHTML = sorted.map((item) => `
        <div class="record-row">
            <div class="record-main">
                <div class="record-title-row">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span class="badge channel-badge">${CONTENT_CHANNEL_LABELS[item.channel] || item.channel}</span>
                </div>
                ${item.body ? `<p class="record-notes">${escapeHtml(item.body).slice(0, 220)}${item.body.length > 220 ? '…' : ''}</p>` : ''}
                <label class="status-select-row">
                    Statut :
                    <select data-content-status="${item.id}">
                        <option value="brouillon" ${item.status === 'brouillon' ? 'selected' : ''}>Brouillon</option>
                        <option value="pret" ${item.status === 'pret' ? 'selected' : ''}>Prêt</option>
                        <option value="publie" ${item.status === 'publie' ? 'selected' : ''}>Publié</option>
                    </select>
                </label>
            </div>
            <div class="record-actions">
                <button type="button" class="btn-secondary btn-tiny" data-content-edit="${item.id}">Modifier</button>
                <button type="button" class="btn-secondary btn-tiny" data-content-delete="${item.id}">Supprimer</button>
            </div>
        </div>
    `).join('');

    contentList.querySelectorAll('[data-content-edit]').forEach((btn) => {
        btn.addEventListener('click', () => editContent(btn.dataset.contentEdit));
    });
    contentList.querySelectorAll('[data-content-delete]').forEach((btn) => {
        btn.addEventListener('click', () => deleteContent(btn.dataset.contentDelete));
    });
    contentList.querySelectorAll('[data-content-status]').forEach((select) => {
        select.addEventListener('change', () => setContentStatus(select.dataset.contentStatus, select.value));
    });
}

// ===================== METRICS =====================

let metrics = loadArray(METRICS_KEY);

const metricForm = document.getElementById('metric-form');
const metricDate = document.getElementById('metric-date');
const metricLeads = document.getElementById('metric-leads');
const metricSales = document.getElementById('metric-sales');
const metricRevenue = document.getElementById('metric-revenue');
const metricTraffic = document.getElementById('metric-traffic');
const metricNote = document.getElementById('metric-note');
const metricTiles = document.getElementById('metric-tiles');
const metricSelect = document.getElementById('metric-select');
const metricChart = document.getElementById('metric-chart');
const metricTable = document.getElementById('metric-table');

metricDate.value = new Date().toISOString().slice(0, 10);

metricForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const entry = {
        date: metricDate.value,
        leads: Number(metricLeads.value) || 0,
        sales: Number(metricSales.value) || 0,
        revenue: Number(metricRevenue.value) || 0,
        traffic: Number(metricTraffic.value) || 0,
        note: metricNote.value.trim(),
        createdAt: Date.now()
    };
    const existingIndex = metrics.findIndex((m) => m.date === entry.date);
    if (existingIndex >= 0) {
        entry.id = metrics[existingIndex].id;
        metrics[existingIndex] = entry;
    } else {
        entry.id = uid();
        metrics.push(entry);
    }
    saveArray(METRICS_KEY, metrics);
    metricNote.value = '';
    renderMetrics();
});

metricSelect.addEventListener('change', renderMetricChart);

function deleteMetric(id) {
    metrics = metrics.filter((m) => m.id !== id);
    saveArray(METRICS_KEY, metrics);
    renderMetrics();
}

function formatMetricValue(key, value) {
    if (key === 'revenue') return `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $`;
    return Number(value).toLocaleString('fr-FR');
}

function niceCeiling(value) {
    if (value <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / magnitude;
    let niceNormalized;
    if (normalized <= 1) niceNormalized = 1;
    else if (normalized <= 2) niceNormalized = 2;
    else if (normalized <= 5) niceNormalized = 5;
    else niceNormalized = 10;
    return niceNormalized * magnitude;
}

function renderMetricTiles() {
    const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];

    if (!last) {
        metricTiles.innerHTML = '<p class="agent-placeholder">Ajoute un relevé pour voir tes indicateurs.</p>';
        return;
    }

    metricTiles.innerHTML = Object.keys(METRIC_LABELS).map((key) => {
        const value = last[key];
        let deltaHtml = '';
        if (prev) {
            const delta = value - prev[key];
            const deltaClass = delta > 0 ? 'delta-up' : (delta < 0 ? 'delta-down' : 'delta-flat');
            const sign = delta > 0 ? '+' : '';
            deltaHtml = `<span class="stat-delta ${deltaClass}">${sign}${formatMetricValue(key, delta)}</span>`;
        }
        return `
            <div class="stat-tile">
                <span class="stat-tile-label">${METRIC_LABELS[key]}</span>
                <span class="stat-tile-value">${formatMetricValue(key, value)}</span>
                ${deltaHtml}
            </div>
        `;
    }).join('');
}

function renderMetricChart() {
    const key = metricSelect.value;
    const label = METRIC_LABELS[key];
    const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));

    if (!sorted.length) {
        metricChart.innerHTML = '<p class="agent-placeholder">Ajoute au moins un relevé pour voir la tendance.</p>';
        return;
    }

    const values = sorted.map((m) => Number(m[key]) || 0);
    const dates = sorted.map((m) => m.date);

    const width = 680;
    const height = 220;
    const padding = { top: 20, right: 20, bottom: 28, left: 56 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const niceMax = niceCeiling(Math.max(...values, 1));
    const xStep = values.length > 1 ? innerW / (values.length - 1) : 0;
    const xAt = (i) => padding.left + (values.length > 1 ? i * xStep : innerW / 2);
    const yAt = (v) => padding.top + innerH - (v / niceMax) * innerH;

    const points = values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');

    const gridCount = 4;
    let gridlines = '';
    for (let g = 0; g <= gridCount; g++) {
        const val = (niceMax / gridCount) * g;
        const y = yAt(val);
        gridlines += `
            <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-grid-line"/>
            <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" class="chart-tick">${formatMetricValue(key, val)}</text>
        `;
    }

    const dots = values.map((v, i) => `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="4" class="chart-dot" data-i="${i}"/>`).join('');
    const lastIndex = values.length - 1;
    const endLabel = `<text x="${xAt(lastIndex)}" y="${yAt(values[lastIndex]) - 12}" text-anchor="end" class="chart-end-label">${formatMetricValue(key, values[lastIndex])}</text>`;

    metricChart.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Tendance ${label}">
            ${gridlines}
            <polyline points="${points}" class="chart-line"/>
            ${dots}
            ${endLabel}
        </svg>
        <div class="chart-tooltip" id="chart-tooltip" hidden></div>
    `;

    const tooltip = document.getElementById('chart-tooltip');
    metricChart.querySelectorAll('.chart-dot').forEach((dot) => {
        dot.addEventListener('mouseenter', () => {
            const i = Number(dot.dataset.i);
            tooltip.textContent = `${dates[i]} — ${formatMetricValue(key, values[i])}`;
            tooltip.hidden = false;
            const rect = dot.getBoundingClientRect();
            const wrapRect = metricChart.getBoundingClientRect();
            tooltip.style.left = `${rect.left - wrapRect.left + 10}px`;
            tooltip.style.top = `${rect.top - wrapRect.top - 30}px`;
        });
        dot.addEventListener('mouseleave', () => {
            tooltip.hidden = true;
        });
    });
}

function renderMetricTable() {
    if (!metrics.length) {
        metricTable.innerHTML = '<p class="agent-placeholder">Aucun relevé enregistré.</p>';
        return;
    }
    const sorted = [...metrics].sort((a, b) => b.date.localeCompare(a.date));
    metricTable.innerHTML = sorted.map((m) => `
        <div class="record-row">
            <div class="record-main">
                <div class="record-title-row"><strong>${escapeHtml(m.date)}</strong></div>
                <p class="record-sub">Leads: ${m.leads} · Ventes: ${m.sales} · Revenu: ${formatMetricValue('revenue', m.revenue)} · Trafic: ${m.traffic}</p>
                ${m.note ? `<p class="record-notes">${escapeHtml(m.note)}</p>` : ''}
            </div>
            <div class="record-actions">
                <button type="button" class="btn-secondary btn-tiny" data-metric-delete="${m.id}">Supprimer</button>
            </div>
        </div>
    `).join('');

    metricTable.querySelectorAll('[data-metric-delete]').forEach((btn) => {
        btn.addEventListener('click', () => deleteMetric(btn.dataset.metricDelete));
    });
}

function renderMetrics() {
    renderMetricTiles();
    renderMetricChart();
    renderMetricTable();
}

function getMetricsSummary() {
    if (!metrics.length) return "Aucun relevé de métriques enregistré pour l'instant.";
    const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date)).slice(-5);
    return sorted.map((m) =>
        `- ${m.date} : ${m.leads} leads, ${m.sales} ventes, ${formatMetricValue('revenue', m.revenue)} de revenu, ${m.traffic} visites${m.note ? ` (${m.note})` : ''}`
    ).join('\n');
}

// ===================== OVERVIEW (for CEO debrief) =====================

function getOverviewSummary() {
    const openTasks = tasks.filter((t) => !t.done).length;
    const activeLeads = leads.filter((l) => l.status !== 'gagne' && l.status !== 'perdu').length;
    const pendingContent = contentItems.filter((c) => c.status !== 'publie').length;
    return `État opérationnel actuel : ${openTasks} tâche(s) ouverte(s), ${activeLeads} prospect(s) actif(s) dans le CRM, ${pendingContent} contenu(s) en attente de publication.`;
}

function openLeadForm() {
    switchTab('crm');
    resetLeadForm();
    leadForm.hidden = false;
    leadName.focus();
}

window.ManageAPI = {
    addTask,
    addContentFromText,
    getLeadsSummary,
    getMetricsSummary,
    getOverviewSummary,
    switchTab,
    openLeadForm
};

// ===================== INIT =====================

renderLeads();
renderTasks();
renderContent();
renderMetrics();
