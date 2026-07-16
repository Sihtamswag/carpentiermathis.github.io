// agents-system/app.js
// Calls the OpenAI API directly from the browser to run a 5-agent business
// pipeline: Researcher -> CMO -> Sales Rep -> Developer -> Data Analyst.
// Each agent's output is fed as context into the next agent.

const STORAGE_KEY = 'agents-system-openai-key';

const AGENTS = [
    {
        id: 'researcher',
        emoji: '🔎',
        name: 'Researcher',
        subtitle: 'Intel Gatherer',
        system: `Tu es le Researcher (Intel Gatherer) d'un système multi-agents business.
Ton rôle : à partir du contexte business fourni, produis un brief de recherche structuré.
Inclus : les signaux de marché clés à surveiller, les tendances pertinentes, un aperçu du paysage concurrentiel,
les opportunités et risques stratégiques, et les types de sources fiables à consulter pour approfondir (études,
rapports sectoriels, données publiques, forums de niche...). Structure ta réponse avec des sections claires
(titres courts) et reste concret et actionnable. Réponds en français.`
    },
    {
        id: 'cmo',
        emoji: '📣',
        name: 'CMO',
        subtitle: 'Market Voice',
        system: `Tu es le CMO (Market Voice) d'un système multi-agents business.
On te donne le contexte business initial ainsi que le brief de recherche produit par le Researcher.
Ton rôle : transformer cette stratégie en angles de contenu concrets. Propose 3 à 5 angles marketing distincts,
une mini-campagne (canaux, séquence, message clé), et rédige au moins un draft prêt à publier (post réseau social
ou email marketing) entièrement rédigé, pas juste un résumé. Structure ta réponse avec des sections claires.
Réponds en français.`
    },
    {
        id: 'sales',
        emoji: '💼',
        name: 'Sales Rep',
        subtitle: 'Revenue Ops',
        system: `Tu es le Sales Rep (Revenue Ops) d'un système multi-agents business.
On te donne le contexte business initial, le brief de recherche, et les angles marketing produits par le CMO.
Ton rôle : qualifier les prospects et faire avancer le pipeline commercial. Décris le profil client idéal (ICP)
et les critères de qualification, rédige un email de prospection complet et prêt à envoyer basé sur les angles
marketing fournis, ajoute un message de relance (follow-up), et propose un plan de suivi concret (cadence,
prochaines actions, signaux d'intérêt à surveiller). Structure ta réponse avec des sections claires.
Réponds en français.`
    },
    {
        id: 'developer',
        emoji: '🛠️',
        name: 'Developer',
        subtitle: 'Build Systems',
        system: `Tu es le Developer (Build Systems) d'un système multi-agents business.
On te donne le contexte business initial et les besoins exprimés par la recherche, le marketing et les ventes
jusqu'ici. Ton rôle : proposer l'architecture technique nécessaire pour supporter ces opérations (dashboards,
intégrations, automatisations, scripts). Donne une stack suggérée, un plan de mise en œuvre par étapes concrètes,
et un plan de vérification/tests pour s'assurer que chaque changement technique fonctionne réellement.
Structure ta réponse avec des sections claires. Réponds en français.`
    },
    {
        id: 'analyst',
        emoji: '📊',
        name: 'Data Analyst',
        subtitle: 'Signal Layer',
        system: `Tu es le Data Analyst (Signal Layer) d'un système multi-agents business.
On te donne l'ensemble du pipeline précédent : contexte business, recherche, marketing, ventes et plan technique.
Ton rôle : définir les indicateurs clés (KPIs) à suivre pour chaque volet, proposer un plan d'analyse de
performance et de tendances, et évaluer la qualité des signaux opérationnels actuellement disponibles
(fiabilité des données, angles morts, recommandations concrètes pour améliorer la mesure). Structure ta réponse
avec des sections claires. Réponds en français.`
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
const reportActions = document.getElementById('report-actions');
const copyReportBtn = document.getElementById('copy-report-btn');
const downloadReportBtn = document.getElementById('download-report-btn');

const outputs = {};

const savedKey = localStorage.getItem(STORAGE_KEY);
if (savedKey) {
    apiKeyInput.value = savedKey;
    rememberKeyInput.checked = true;
}

function buildPipelineDom() {
    pipelineEl.innerHTML = '';
    AGENTS.forEach((agent) => {
        const card = document.createElement('div');
        card.className = 'agent-card';
        card.id = `card-${agent.id}`;
        card.innerHTML = `
            <div class="agent-card-header">
                <span class="agent-emoji">${agent.emoji}</span>
                <div>
                    <h3>${agent.name}</h3>
                    <p class="agent-subtitle">${agent.subtitle}</p>
                </div>
                <span class="agent-status" id="status-${agent.id}">En attente</span>
            </div>
            <div class="agent-output" id="output-${agent.id}">
                <p class="agent-placeholder">La sortie apparaîtra ici après le lancement du pipeline.</p>
            </div>
            <div class="agent-actions">
                <button type="button" class="btn-secondary" data-copy="${agent.id}" disabled>Copier</button>
                <button type="button" class="btn-secondary" data-rerun="${agent.id}" disabled>Relancer cet agent</button>
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
}

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
    const el = document.getElementById(`status-${id}`);
    el.textContent = label;
    el.className = 'agent-status ' + (type || '');
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
            html += `<li>${inlineFormat(bulletMatch[1])}</li>`;
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
        .replace(/>/g, '&gt;');
}

function inlineFormat(str) {
    return escapeHtml(str).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderAgentOutput(id, text) {
    const el = document.getElementById(`output-${id}`);
    el.innerHTML = renderMarkdown(text);
    document.querySelector(`[data-copy="${id}"]`).disabled = false;
    document.querySelector(`[data-rerun="${id}"]`).disabled = false;
}

function buildUserMessage(agentIndex, businessContext) {
    let message = `Contexte business initial :\n${businessContext}\n`;
    for (let i = 0; i < agentIndex; i++) {
        const prevAgent = AGENTS[i];
        if (outputs[prevAgent.id]) {
            message += `\n--- Sortie de l'agent ${prevAgent.name} (${prevAgent.subtitle}) ---\n${outputs[prevAgent.id]}\n`;
        }
    }
    return message;
}

async function callAgent(agent, apiKey, model, userMessage) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: agent.system },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.7
        })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || `Erreur OpenAI (${response.status})`);
    }
    return data.choices[0].message.content.trim();
}

async function runPipeline(startIndex = 0) {
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value;
    const businessContext = contextInput.value.trim();

    if (!apiKey || !businessContext) {
        setGlobalStatus('Merci de remplir la clé API et le contexte business.', 'error');
        return;
    }

    if (rememberKeyInput.checked) {
        localStorage.setItem(STORAGE_KEY, apiKey);
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }

    runBtn.disabled = true;
    clearGlobalStatus();

    for (let i = startIndex; i < AGENTS.length; i++) {
        const agent = AGENTS[i];
        setAgentStatus(agent.id, 'En cours...', 'running');
        setGlobalStatus(`Exécution de l'agent ${agent.name} (${i + 1}/${AGENTS.length})...`, 'info');
        try {
            const userMessage = buildUserMessage(i, businessContext);
            const result = await callAgent(agent, apiKey, model, userMessage);
            outputs[agent.id] = result;
            renderAgentOutput(agent.id, result);
            setAgentStatus(agent.id, 'Terminé', 'done');
        } catch (error) {
            setAgentStatus(agent.id, 'Erreur', 'error');
            setGlobalStatus(`Erreur sur l'agent ${agent.name} : ${error.message}`, 'error');
            runBtn.disabled = false;
            return;
        }
    }

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

    setAgentStatus(agent.id, 'En cours...', 'running');
    clearGlobalStatus();

    try {
        const userMessage = buildUserMessage(agentIndex, businessContext);
        const result = await callAgent(agent, apiKey, model, userMessage);
        outputs[agent.id] = result;
        renderAgentOutput(agent.id, result);
        setAgentStatus(agent.id, 'Terminé', 'done');
    } catch (error) {
        setAgentStatus(agent.id, 'Erreur', 'error');
        setGlobalStatus(`Erreur sur l'agent ${agent.name} : ${error.message}`, 'error');
    }
}

function copyAgentOutput(agentId) {
    const text = outputs[agentId];
    if (text) {
        navigator.clipboard.writeText(text);
    }
}

function buildFullReport() {
    const businessContext = contextInput.value.trim();
    let report = `# Rapport du pipeline multi-agents\n\n## Contexte business\n${businessContext}\n`;
    AGENTS.forEach((agent) => {
        if (outputs[agent.id]) {
            report += `\n## ${agent.name} (${agent.subtitle})\n${outputs[agent.id]}\n`;
        }
    });
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
    buildPipelineDom();
    reportActions.hidden = true;
    clearGlobalStatus();
});

configForm.addEventListener('submit', (event) => {
    event.preventDefault();
    Object.keys(outputs).forEach((key) => delete outputs[key]);
    buildPipelineDom();
    reportActions.hidden = true;
    runPipeline(0);
});

buildPipelineDom();
