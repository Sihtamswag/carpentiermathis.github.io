// agents-system/app.js
// Calls the OpenAI API directly from the browser to run a business agent
// pipeline coordinated by a CEO/Orchestrator: the CEO drafts a routing plan,
// hands off to 5 specialists in sequence (each fed the prior outputs), then
// the CEO returns a final operator debrief synthesizing everything.

const KEY_STORAGE = 'agents-system-openai-key';
const LOG_STORAGE = 'agents-system-log';
const CALLS_STORAGE = 'agents-system-call-count';
const REPORTS_STORAGE = 'agents-system-report-count';
const ERRORS_STORAGE = 'agents-system-error-count';
const TOKENS_STORAGE = 'agents-system-token-count';
const LOG_LIMIT = 50;

const CEO = {
    id: 'ceo',
    name: 'CEO',
    color: 'ceo',
    kickoffSystem: `Tu es le CEO/Orchestrator d'un système multi-agents business.
Ton rôle : recevoir le contexte business et produire un court plan de routage pour l'équipe de spécialistes
qui va intervenir dans cet ordre : Researcher (Intel Gatherer), CMO (Market Voice), Sales Rep (Revenue Ops),
Developer (Build Systems), Data Analyst (Signal Layer). Pour chaque spécialiste, précise en 1-2 phrases sur
quoi il doit se concentrer en priorité compte tenu du contexte donné. Reste bref et actionnable.
Réponds en français.`,
    debriefSystem: `Tu es le CEO/Orchestrator d'un système multi-agents business.
On te donne le contexte business initial, ton plan de routage initial, et les sorties complètes des 5 agents
spécialistes qui ont travaillé (Researcher, CMO, Sales Rep, Developer, Data Analyst). Ton rôle : produire une
synthèse finale ("operator debrief") à destination du dirigeant humain. Résume les points clés de chaque
volet, mets en évidence les priorités et les prochaines actions concrètes à court terme, et signale les
éventuelles tensions ou incohérences entre les recommandations des agents. Structure ta réponse avec des
sections claires. Réponds en français.`
};

const AGENTS = [
    {
        id: 'researcher',
        emoji: '🔎',
        name: 'Researcher',
        subtitle: 'INTEL GATHERER',
        color: 'researcher',
        desc: 'Signaux de marché, briefs de recherche, sources, contexte stratégique.',
        system: `Tu es le Researcher (Intel Gatherer) d'un système multi-agents business.
Ton rôle : à partir du contexte business et du plan de routage du CEO, produis un brief de recherche structuré.
Inclus : les signaux de marché clés à surveiller, les tendances pertinentes, un aperçu du paysage concurrentiel,
les opportunités et risques stratégiques, et les types de sources fiables à consulter pour approfondir (études,
rapports sectoriels, données publiques, forums de niche...). Structure ta réponse avec des sections claires
(titres courts) et reste concret et actionnable. Réponds en français.`
    },
    {
        id: 'cmo',
        emoji: '📣',
        name: 'CMO',
        subtitle: 'MARKET VOICE',
        color: 'cmo',
        desc: 'Angles de contenu, campagnes, drafts prêts à publier.',
        system: `Tu es le CMO (Market Voice) d'un système multi-agents business.
On te donne le contexte business initial, le plan de routage du CEO, ainsi que le brief de recherche produit
par le Researcher. Ton rôle : transformer cette stratégie en angles de contenu concrets. Propose 3 à 5 angles
marketing distincts, une mini-campagne (canaux, séquence, message clé), et rédige au moins un draft prêt à
publier (post réseau social ou email marketing) entièrement rédigé, pas juste un résumé. Structure ta réponse
avec des sections claires. Réponds en français.`
    },
    {
        id: 'sales',
        emoji: '💼',
        name: 'Sales Rep',
        subtitle: 'REVENUE OPS',
        color: 'sales',
        desc: 'Qualification des leads, outreach, suivi des opportunités.',
        system: `Tu es le Sales Rep (Revenue Ops) d'un système multi-agents business.
On te donne le contexte business initial, le plan de routage du CEO, le brief de recherche, et les angles
marketing produits par le CMO. Ton rôle : qualifier les prospects et faire avancer le pipeline commercial.
Décris le profil client idéal (ICP) et les critères de qualification, rédige un email de prospection complet
et prêt à envoyer basé sur les angles marketing fournis, ajoute un message de relance (follow-up), et propose
un plan de suivi concret (cadence, prochaines actions, signaux d'intérêt à surveiller). Structure ta réponse
avec des sections claires. Réponds en français.`
    },
    {
        id: 'developer',
        emoji: '🛠️',
        name: 'Dev',
        subtitle: 'BUILD SYSTEMS',
        color: 'developer',
        desc: 'Dashboards, intégrations, scripts, vérification technique.',
        system: `Tu es le Developer (Build Systems) d'un système multi-agents business.
On te donne le contexte business initial, le plan de routage du CEO, et les besoins exprimés par la recherche,
le marketing et les ventes jusqu'ici. Ton rôle : proposer l'architecture technique nécessaire pour supporter
ces opérations (dashboards, intégrations, automatisations, scripts). Donne une stack suggérée, un plan de mise
en œuvre par étapes concrètes, et un plan de vérification/tests pour s'assurer que chaque changement technique
fonctionne réellement. Structure ta réponse avec des sections claires. Réponds en français.`
    },
    {
        id: 'analyst',
        emoji: '📊',
        name: 'Data Analyst',
        subtitle: 'SIGNAL LAYER',
        color: 'analyst',
        desc: 'Analyse de performance, tendances, qualité des signaux.',
        system: `Tu es le Data Analyst (Signal Layer) d'un système multi-agents business.
On te donne l'ensemble du pipeline précédent : contexte business, plan de routage du CEO, recherche, marketing,
ventes et plan technique. Ton rôle : définir les indicateurs clés (KPIs) à suivre pour chaque volet, proposer
un plan d'analyse de performance et de tendances, et évaluer la qualité des signaux opérationnels actuellement
disponibles (fiabilité des données, angles morts, recommandations concrètes pour améliorer la mesure).
Structure ta réponse avec des sections claires. Réponds en français.`
    }
];

const apiKeyInput = document.getElementById('api-key');
const rememberKeyInput = document.getElementById('remember-key');
const modelInput = document.getElementById('model-input');
const contextInput = document.getElementById('context-input');
const configForm = document.getElementById('config-form');
const runBtn = document.getElementById('run-btn');
const resetBtn = document.getElementById('reset-btn');
const globalStatus = document.getElementById('global-status');
const pipelineEl = document.getElementById('pipeline');
const stripEl = document.getElementById('agent-strip');
const reportActions = document.getElementById('report-actions');
const copyReportBtn = document.getElementById('copy-report-btn');
const downloadReportBtn = document.getElementById('download-report-btn');
const statCalls = document.getElementById('stat-calls');
const statReports = document.getElementById('stat-reports');
const logList = document.getElementById('log-list');
const logEmpty = document.getElementById('log-empty');
const clearLogBtn = document.getElementById('clear-log-btn');
const commandStatsEl = document.getElementById('command-stats');

const outputs = {};
let ceoKickoff = '';
let ceoDebrief = '';
let logEntries = [];

const savedKey = localStorage.getItem(KEY_STORAGE);
if (savedKey) {
    apiKeyInput.value = savedKey;
    rememberKeyInput.checked = true;
}

let callCount = parseInt(localStorage.getItem(CALLS_STORAGE) || '0', 10);
let reportCount = parseInt(localStorage.getItem(REPORTS_STORAGE) || '0', 10);
let errorCount = parseInt(localStorage.getItem(ERRORS_STORAGE) || '0', 10);
let tokenCount = parseInt(localStorage.getItem(TOKENS_STORAGE) || '0', 10);
statCalls.textContent = callCount;
statReports.textContent = reportCount;

try {
    logEntries = JSON.parse(localStorage.getItem(LOG_STORAGE) || '[]');
} catch (e) {
    logEntries = [];
}

function recordError() {
    errorCount += 1;
    localStorage.setItem(ERRORS_STORAGE, String(errorCount));
    renderCommandStats();
}

function renderCommandStats() {
    const lastActivity = logEntries.length ? relativeTime(logEntries[0].timestamp) : 'jamais';
    commandStatsEl.innerHTML = `
        <div class="stat-tile">
            <span class="stat-tile-label">Appels totaux</span>
            <span class="stat-tile-value">${callCount.toLocaleString('fr-FR')}</span>
        </div>
        <div class="stat-tile">
            <span class="stat-tile-label">Tokens utilisés</span>
            <span class="stat-tile-value">${tokenCount.toLocaleString('fr-FR')}</span>
        </div>
        <div class="stat-tile">
            <span class="stat-tile-label">Erreurs</span>
            <span class="stat-tile-value ${errorCount > 0 ? 'delta-down' : ''}">${errorCount}</span>
        </div>
        <div class="stat-tile">
            <span class="stat-tile-label">Dernière activité</span>
            <span class="stat-tile-value">${lastActivity}</span>
        </div>
    `;
}

function buildPipelineDom() {
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
                <div>
                    <h3>${agent.name}</h3>
                    <p class="agent-subtitle">${agent.subtitle}</p>
                </div>
                <span class="agent-status idle" id="status-${agent.id}">idle</span>
            </div>
            <p class="agent-desc">${agent.desc}</p>
            <div class="agent-model-row">
                <span class="stat-label">MODEL</span>
                <span class="stat-value model-tag" id="model-tag-${agent.id}">—</span>
            </div>
            <div class="agent-output" id="output-${agent.id}">
                <p class="agent-placeholder">En attente du plan de routage du CEO.</p>
            </div>
            <div class="agent-actions">
                <button type="button" class="btn-secondary" data-copy="${agent.id}" disabled>Copier</button>
                <button type="button" class="btn-secondary" data-rerun="${agent.id}" disabled>Relancer cet agent</button>
                ${agent.id === 'cmo' ? '<button type="button" class="btn-secondary" data-save-content="cmo" disabled>Enregistrer comme contenu</button>' : ''}
                ${agent.id === 'sales' ? '<button type="button" class="btn-secondary" data-add-lead="sales">+ Ajouter un prospect</button>' : ''}
            </div>
        `;
        pipelineEl.appendChild(card);
    });

    pipelineEl.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', () => copyAgentOutput(btn.dataset.copy));
    });
    pipelineEl.querySelectorAll('[data-rerun]').forEach((btn) => {
        btn.addEventListener('click', () => rerunAgent(btn.dataset.rerun));
    });
    pipelineEl.querySelectorAll('[data-save-content]').forEach((btn) => {
        btn.addEventListener('click', saveCmoAsContent);
    });
    pipelineEl.querySelectorAll('[data-add-lead]').forEach((btn) => {
        btn.addEventListener('click', () => window.ManageAPI && window.ManageAPI.openLeadForm());
    });

    updateModelTags();
}

function saveCmoAsContent() {
    if (!outputs.cmo) {
        setGlobalStatus("Lance d'abord le CMO avant d'enregistrer un draft.", 'error');
        return;
    }
    if (window.ManageAPI) {
        window.ManageAPI.addContentFromText(`Draft CMO — ${new Date().toLocaleDateString('fr-FR')}`, outputs.cmo);
        setGlobalStatus('Draft enregistré dans le calendrier de contenu.', 'info');
    }
}

function updateModelTags() {
    const model = modelInput.value;
    document.querySelectorAll('.model-tag').forEach((el) => {
        el.textContent = model;
    });
}

modelInput.addEventListener('change', updateModelTags);

function setGlobalStatus(message, type) {
    globalStatus.textContent = message;
    globalStatus.className = 'global-status ' + type;
    globalStatus.hidden = false;
}

function clearGlobalStatus() {
    globalStatus.hidden = true;
    globalStatus.textContent = '';
}

function setAgentStatus(id, label, type) {
    ['status-', 'strip-status-'].forEach((prefix) => {
        const el = document.getElementById(`${prefix}${id}`);
        if (el) {
            el.textContent = label;
            el.className = 'agent-status ' + type;
        }
    });
}

// Minimal markdown-lite renderer: headers (### / ##), bold (**text**), bullet lists (- item), paragraphs.
function renderMarkdown(text) {
    const lines = text.split('\n');
    let html = '';
    let inList = false;

    function closeList() {
        if (inList) {
            html += '</ul>';
            inList = false;
        }
    }

    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
            closeList();
            return;
        }
        const headerMatch = line.match(/^#{1,4}\s+(.*)/);
        if (headerMatch) {
            closeList();
            html += `<h4>${escapeHtml(headerMatch[1])}</h4>`;
            return;
        }
        const bulletMatch = line.match(/^[-*]\s+(.*)/);
        if (bulletMatch) {
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            const plainText = escapeHtml(stripMarkdown(bulletMatch[1]));
            html += `<li><span>${inlineFormat(bulletMatch[1])}</span><button type="button" class="li-add-task" data-task-text="${plainText}">+ tâche</button></li>`;
            return;
        }
        closeList();
        html += `<p>${inlineFormat(line)}</p>`;
    });
    closeList();
    return html;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function stripMarkdown(str) {
    return str.replace(/\*\*(.+?)\*\*/g, '$1');
}

function inlineFormat(str) {
    return escapeHtml(str).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function wireTaskButtons(container, sourceLabel) {
    container.querySelectorAll('.li-add-task').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (!window.ManageAPI) return;
            window.ManageAPI.addTask(btn.dataset.taskText, sourceLabel);
            btn.textContent = 'Ajouté ✓';
            btn.disabled = true;
        });
    });
}

function renderAgentOutput(id, text, sourceLabel) {
    const el = document.getElementById(`output-${id}`);
    el.innerHTML = renderMarkdown(text);
    wireTaskButtons(el, sourceLabel);
    document.querySelector(`[data-copy="${id}"]`).disabled = false;
    const rerunBtn = document.querySelector(`[data-rerun="${id}"]`);
    if (rerunBtn) rerunBtn.disabled = false;
    if (id === 'cmo') {
        const saveContentBtn = document.querySelector('[data-save-content="cmo"]');
        if (saveContentBtn) saveContentBtn.disabled = false;
    }
}

function renderCeoOutput() {
    const el = document.getElementById('output-ceo');
    let html = '';
    if (ceoKickoff) {
        html += `<h4>Plan de routage</h4>${renderMarkdown(ceoKickoff)}`;
    }
    if (ceoDebrief) {
        html += `<h4>Debrief opérateur</h4>${renderMarkdown(ceoDebrief)}`;
    }
    el.innerHTML = html || '<p class="agent-placeholder">Le plan de routage et la synthèse finale apparaîtront ici.</p>';
    wireTaskButtons(el, 'CEO');
    document.querySelector('[data-copy="ceo"]').disabled = !(ceoKickoff || ceoDebrief);
}

function buildUserMessage(agentIndex, businessContext, agentId) {
    let message = `Contexte business initial :\n${businessContext}\n`;
    if (ceoKickoff) {
        message += `\n--- Plan de routage du CEO ---\n${ceoKickoff}\n`;
    }
    for (let i = 0; i < agentIndex; i++) {
        const prevAgent = AGENTS[i];
        if (outputs[prevAgent.id]) {
            message += `\n--- Sortie de l'agent ${prevAgent.name} (${prevAgent.subtitle}) ---\n${outputs[prevAgent.id]}\n`;
        }
    }
    if (window.ManageAPI) {
        if (agentId === 'sales') {
            message += `\n--- CRM actuel (prospects enregistrés) ---\n${window.ManageAPI.getLeadsSummary()}\n`;
        }
        if (agentId === 'analyst') {
            message += `\n--- Relevés de métriques récents ---\n${window.ManageAPI.getMetricsSummary()}\n`;
        }
        if (agentId === 'ceo-debrief') {
            message += `\n--- ${window.ManageAPI.getOverviewSummary()} ---\n`;
        }
    }
    return message;
}

async function callModel(apiKey, model, systemPrompt, userMessage) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.7
        })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || `Erreur OpenAI (${response.status})`);
    }

    callCount += 1;
    localStorage.setItem(CALLS_STORAGE, String(callCount));
    statCalls.textContent = callCount;

    if (data.usage?.total_tokens) {
        tokenCount += data.usage.total_tokens;
        localStorage.setItem(TOKENS_STORAGE, String(tokenCount));
    }
    renderCommandStats();

    return data.choices[0].message.content.trim();
}

function addLogEntry(agentId, agentName, color, text, model, status) {
    logEntries.unshift({
        agentId,
        agentName,
        color,
        text,
        model,
        status,
        timestamp: Date.now()
    });
    logEntries = logEntries.slice(0, LOG_LIMIT);
    localStorage.setItem(LOG_STORAGE, JSON.stringify(logEntries));
    renderLog();
    renderCommandStats();
}

function relativeTime(timestamp) {
    const diffMs = Date.now() - timestamp;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}j`;
}

function renderLog() {
    if (!logEntries.length) {
        logList.innerHTML = '<p class="log-empty" id="log-empty">Aucune activité pour l\'instant.</p>';
        return;
    }
    logList.innerHTML = logEntries.map((entry) => `
        <div class="log-row">
            <span class="log-agent-tag" data-color="${entry.color}" style="--agent-accent: var(--c-${entry.color})">${entry.agentName}</span>
            <span class="log-text">${escapeHtml(entry.text)}</span>
            <span class="log-model">${escapeHtml(entry.model)}</span>
            <span class="log-state ${entry.status === 'COMPLETED' ? 'completed' : 'failed'}">${entry.status}</span>
            <span class="log-time">${relativeTime(entry.timestamp)}</span>
        </div>
    `).join('');
}

async function runPipeline() {
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value;
    const businessContext = contextInput.value.trim();

    if (!apiKey || !businessContext) {
        setGlobalStatus('Merci de remplir la clé API et le contexte business.', 'error');
        return;
    }

    if (rememberKeyInput.checked) {
        localStorage.setItem(KEY_STORAGE, apiKey);
    } else {
        localStorage.removeItem(KEY_STORAGE);
    }

    runBtn.disabled = true;
    clearGlobalStatus();

    setAgentStatus('ceo', 'working', 'working');
    setGlobalStatus('Le CEO définit le plan de routage...', 'info');
    try {
        ceoKickoff = await callModel(apiKey, model, CEO.kickoffSystem, `Contexte business initial :\n${businessContext}`);
        renderCeoOutput();
        addLogEntry('ceo', 'CEO', 'ceo', `Plan de routage défini pour : ${businessContext.slice(0, 60)}`, model, 'COMPLETED');
    } catch (error) {
        setAgentStatus('ceo', 'error', 'error');
        setGlobalStatus(`Erreur sur le CEO : ${error.message}`, 'error');
        addLogEntry('ceo', 'CEO', 'ceo', 'Échec du plan de routage', model, 'FAILED');
        recordError();
        runBtn.disabled = false;
        return;
    }

    for (let i = 0; i < AGENTS.length; i++) {
        const agent = AGENTS[i];
        setAgentStatus(agent.id, 'working', 'working');
        setGlobalStatus(`Exécution de l'agent ${agent.name} (${i + 1}/${AGENTS.length})...`, 'info');
        try {
            const userMessage = buildUserMessage(i, businessContext, agent.id);
            const result = await callModel(apiKey, model, agent.system, userMessage);
            outputs[agent.id] = result;
            renderAgentOutput(agent.id, result, agent.name);
            setAgentStatus(agent.id, 'done', 'done');
            addLogEntry(agent.id, agent.name, agent.color, `Sortie générée (${agent.subtitle.toLowerCase()})`, model, 'COMPLETED');
        } catch (error) {
            setAgentStatus(agent.id, 'error', 'error');
            setGlobalStatus(`Erreur sur l'agent ${agent.name} : ${error.message}`, 'error');
            addLogEntry(agent.id, agent.name, agent.color, 'Échec de génération', model, 'FAILED');
            recordError();
            setAgentStatus('ceo', 'error', 'error');
            runBtn.disabled = false;
            return;
        }
    }

    setGlobalStatus('Le CEO rédige la synthèse finale...', 'info');
    try {
        const debriefMessage = buildUserMessage(AGENTS.length, businessContext, 'ceo-debrief');
        ceoDebrief = await callModel(apiKey, model, CEO.debriefSystem, debriefMessage);
        renderCeoOutput();
        setAgentStatus('ceo', 'done', 'done');
        addLogEntry('ceo', 'CEO', 'ceo', 'Synthèse opérateur (debrief final) générée', model, 'COMPLETED');
    } catch (error) {
        setAgentStatus('ceo', 'error', 'error');
        setGlobalStatus(`Erreur sur le debrief du CEO : ${error.message}`, 'error');
        addLogEntry('ceo', 'CEO', 'ceo', 'Échec du debrief final', model, 'FAILED');
        recordError();
        runBtn.disabled = false;
        return;
    }

    reportCount += 1;
    localStorage.setItem(REPORTS_STORAGE, String(reportCount));
    statReports.textContent = reportCount;

    clearGlobalStatus();
    runBtn.disabled = false;
    reportActions.hidden = false;
}

async function rerunAgent(agentId) {
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value;
    const businessContext = contextInput.value.trim();
    const agentIndex = AGENTS.findIndex((a) => a.id === agentId);
    const agent = AGENTS[agentIndex];

    if (!apiKey || !businessContext) {
        setGlobalStatus('Merci de remplir la clé API et le contexte business.', 'error');
        return;
    }

    setAgentStatus(agent.id, 'working', 'working');
    clearGlobalStatus();

    try {
        const userMessage = buildUserMessage(agentIndex, businessContext, agent.id);
        const result = await callModel(apiKey, model, agent.system, userMessage);
        outputs[agent.id] = result;
        renderAgentOutput(agent.id, result, agent.name);
        setAgentStatus(agent.id, 'done', 'done');
        addLogEntry(agent.id, agent.name, agent.color, `Sortie régénérée (${agent.subtitle.toLowerCase()})`, model, 'COMPLETED');
    } catch (error) {
        setAgentStatus(agent.id, 'error', 'error');
        setGlobalStatus(`Erreur sur l'agent ${agent.name} : ${error.message}`, 'error');
        addLogEntry(agent.id, agent.name, agent.color, 'Échec de régénération', model, 'FAILED');
        recordError();
    }
}

function copyAgentOutput(agentId) {
    let text = '';
    if (agentId === 'ceo') {
        text = [ceoKickoff && `Plan de routage :\n${ceoKickoff}`, ceoDebrief && `Debrief opérateur :\n${ceoDebrief}`].filter(Boolean).join('\n\n');
    } else {
        text = outputs[agentId];
    }
    if (text) {
        navigator.clipboard.writeText(text);
    }
}

function buildFullReport() {
    const businessContext = contextInput.value.trim();
    let report = `# Rapport du pipeline multi-agents\n\n## Contexte business\n${businessContext}\n`;
    if (ceoKickoff) {
        report += `\n## CEO — Plan de routage\n${ceoKickoff}\n`;
    }
    AGENTS.forEach((agent) => {
        if (outputs[agent.id]) {
            report += `\n## ${agent.name} (${agent.subtitle})\n${outputs[agent.id]}\n`;
        }
    });
    if (ceoDebrief) {
        report += `\n## CEO — Debrief opérateur\n${ceoDebrief}\n`;
    }
    return report;
}

copyReportBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(buildFullReport());
});

downloadReportBtn.addEventListener('click', () => {
    const blob = new Blob([buildFullReport()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rapport-agents-business.md';
    a.click();
    URL.revokeObjectURL(url);
});

resetBtn.addEventListener('click', () => {
    contextInput.value = '';
    Object.keys(outputs).forEach((key) => delete outputs[key]);
    ceoKickoff = '';
    ceoDebrief = '';
    buildPipelineDom();
    setAgentStatus('ceo', 'idle', 'idle');
    renderCeoOutput();
    reportActions.hidden = true;
    clearGlobalStatus();
});

clearLogBtn.addEventListener('click', () => {
    logEntries = [];
    localStorage.removeItem(LOG_STORAGE);
    renderLog();
});

configForm.addEventListener('submit', (event) => {
    event.preventDefault();
    Object.keys(outputs).forEach((key) => delete outputs[key]);
    ceoKickoff = '';
    ceoDebrief = '';
    buildPipelineDom();
    setAgentStatus('ceo', 'idle', 'idle');
    renderCeoOutput();
    reportActions.hidden = true;
    runPipeline();
});

buildPipelineDom();
renderLog();
renderCommandStats();
