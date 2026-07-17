// Server-side port of the agent pipeline: same roles, same prompts as the
// browser-only version in /agents-system, but it runs here so it can fire on
// a schedule with nobody watching, and it reads real CRM/metrics data from
// the database instead of a single browser's localStorage.

const { db } = require('../db');

const CEO = {
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
        name: 'Researcher',
        color: 'researcher',
        column: 'researcher',
        system: `Tu es le Researcher (Intel Gatherer) d'un système multi-agents business.
Ton rôle : à partir du contexte business et du plan de routage du CEO, produis un brief de recherche structuré.
Inclus : les signaux de marché clés à surveiller, les tendances pertinentes, un aperçu du paysage concurrentiel,
les opportunités et risques stratégiques, et les types de sources fiables à consulter pour approfondir (études,
rapports sectoriels, données publiques, forums de niche...). Structure ta réponse avec des sections claires
(titres courts) et reste concret et actionnable. Réponds en français.`
    },
    {
        id: 'cmo',
        name: 'CMO',
        color: 'cmo',
        column: 'cmo',
        system: `Tu es le CMO (Market Voice) d'un système multi-agents business.
On te donne le contexte business initial, le plan de routage du CEO, ainsi que le brief de recherche produit
par le Researcher. Ton rôle : transformer cette stratégie en angles de contenu concrets. Propose 3 à 5 angles
marketing distincts, une mini-campagne (canaux, séquence, message clé), et rédige au moins un draft prêt à
publier (post réseau social ou email marketing) entièrement rédigé, pas juste un résumé. Structure ta réponse
avec des sections claires. Réponds en français.`
    },
    {
        id: 'sales',
        name: 'Sales Rep',
        color: 'sales',
        column: 'sales',
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
        name: 'Dev',
        color: 'developer',
        column: 'developer',
        system: `Tu es le Developer (Build Systems) d'un système multi-agents business.
On te donne le contexte business initial, le plan de routage du CEO, et les besoins exprimés par la recherche,
le marketing et les ventes jusqu'ici. Ton rôle : proposer l'architecture technique nécessaire pour supporter
ces opérations (dashboards, intégrations, automatisations, scripts). Donne une stack suggérée, un plan de mise
en œuvre par étapes concrètes, et un plan de vérification/tests pour s'assurer que chaque changement technique
fonctionne réellement. Structure ta réponse avec des sections claires. Réponds en français.`
    },
    {
        id: 'analyst',
        name: 'Data Analyst',
        color: 'analyst',
        column: 'analyst',
        system: `Tu es le Data Analyst (Signal Layer) d'un système multi-agents business.
On te donne l'ensemble du pipeline précédent : contexte business, plan de routage du CEO, recherche, marketing,
ventes et plan technique. Ton rôle : définir les indicateurs clés (KPIs) à suivre pour chaque volet, proposer
un plan d'analyse de performance et de tendances, et évaluer la qualité des signaux opérationnels actuellement
disponibles (fiabilité des données, angles morts, recommandations concrètes pour améliorer la mesure).
Structure ta réponse avec des sections claires. Réponds en français.`
    }
];

function getLeadsSummary() {
    const leads = db.prepare("SELECT * FROM leads WHERE status NOT IN ('gagne', 'perdu') ORDER BY next_date IS NULL, next_date LIMIT 10").all();
    if (!leads.length) return "Aucun prospect actif enregistré pour l'instant dans le CRM.";
    return leads.map((l) =>
        `- ${l.name} (${l.status})${l.next_action ? `, prochaine action : ${l.next_action}` : ''}${l.next_date ? ` le ${l.next_date}` : ''}`
    ).join('\n');
}

function getMetricsSummary() {
    const rows = db.prepare('SELECT * FROM metrics ORDER BY date DESC LIMIT 5').all().reverse();
    if (!rows.length) return "Aucun relevé de métriques enregistré pour l'instant.";
    return rows.map((m) =>
        `- ${m.date} : ${m.leads} leads, ${m.sales} ventes, ${m.revenue}$ de revenu, ${m.traffic} visites${m.note ? ` (${m.note})` : ''}`
    ).join('\n');
}

function getOverviewSummary() {
    const openTasks = db.prepare("SELECT COUNT(*) c FROM tasks WHERE column_name != 'done'").get().c;
    const activeLeads = db.prepare("SELECT COUNT(*) c FROM leads WHERE status NOT IN ('gagne', 'perdu')").get().c;
    const pendingContent = db.prepare("SELECT COUNT(*) c FROM content_items WHERE status != 'publie'").get().c;
    const today = new Date().toISOString().slice(0, 10);
    const dueReminders = db.prepare('SELECT COUNT(*) c FROM reminders WHERE next_date <= ?').get(today).c;
    return `État opérationnel actuel : ${openTasks} tâche(s) ouverte(s), ${activeLeads} prospect(s) actif(s) dans le CRM, ${pendingContent} contenu(s) en attente de publication, ${dueReminders} rappel(s) à traiter.`;
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
    const rawBody = await response.text();
    let data;
    try {
        data = JSON.parse(rawBody);
    } catch (e) {
        throw new Error(`Réponse OpenAI illisible (statut ${response.status}) : ${rawBody.slice(0, 200)}`);
    }
    if (!response.ok) {
        throw new Error(data.error?.message || `Erreur OpenAI (${response.status})`);
    }
    return {
        text: data.choices[0].message.content.trim(),
        tokens: data.usage?.total_tokens || 0
    };
}

function logActivity(agentId, agentName, color, text, model, status) {
    db.prepare(`
        INSERT INTO activity_log (agent_id, agent_name, color, text, model, status, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(agentId, agentName, color, text, model, status, Date.now());
}

function buildUserMessage(businessContext, ceoKickoff, priorOutputs, extraContext) {
    let message = `Contexte business initial :\n${businessContext}\n`;
    if (ceoKickoff) message += `\n--- Plan de routage du CEO ---\n${ceoKickoff}\n`;
    priorOutputs.forEach(({ name, subtitle, text }) => {
        message += `\n--- Sortie de l'agent ${name}${subtitle ? ` (${subtitle})` : ''} ---\n${text}\n`;
    });
    if (extraContext) message += `\n--- ${extraContext} ---\n`;
    return message;
}

async function runPipeline({ businessContext, trigger = 'manual' }) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!apiKey) throw new Error('OPENAI_API_KEY manquant côté serveur.');
    if (!businessContext) throw new Error('Contexte business manquant.');

    const insert = db.prepare(`
        INSERT INTO agent_runs (trigger, business_context, status, started_at)
        VALUES (?, ?, 'running', ?)
    `).run(trigger, businessContext, Date.now());
    const runId = insert.lastInsertRowid;

    const update = (fields) => {
        const keys = Object.keys(fields);
        const sql = `UPDATE agent_runs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
        db.prepare(sql).run(...keys.map((k) => fields[k]), runId);
    };

    let totalTokens = 0;
    const track = (tokens) => { totalTokens += tokens; update({ total_tokens: totalTokens }); };

    try {
        const kickoff = await callModel(apiKey, model, CEO.kickoffSystem, `Contexte business initial :\n${businessContext}`);
        update({ ceo_kickoff: kickoff.text });
        track(kickoff.tokens);
        logActivity('ceo', 'CEO', 'ceo', `Plan de routage défini (${trigger})`, model, 'COMPLETED');

        const priorOutputs = [];
        const outputsByColumn = {};

        for (const agent of AGENTS) {
            let extraContext = null;
            if (agent.id === 'sales') extraContext = `CRM actuel (prospects enregistrés) :\n${getLeadsSummary()}`;
            if (agent.id === 'analyst') extraContext = `Relevés de métriques récents :\n${getMetricsSummary()}`;

            const userMessage = buildUserMessage(businessContext, kickoff.text, priorOutputs, extraContext);
            const result = await callModel(apiKey, model, agent.system, userMessage);
            update({ [agent.column]: result.text });
            track(result.tokens);
            priorOutputs.push({ name: agent.name, text: result.text });
            outputsByColumn[agent.id] = result.text;
            logActivity(agent.id, agent.name, agent.color, `Sortie générée (${trigger})`, model, 'COMPLETED');
        }

        const debriefMessage = buildUserMessage(businessContext, kickoff.text, priorOutputs, getOverviewSummary());
        const debrief = await callModel(apiKey, model, CEO.debriefSystem, debriefMessage);
        update({ ceo_debrief: debrief.text });
        track(debrief.tokens);
        logActivity('ceo', 'CEO', 'ceo', `Synthèse opérateur générée (${trigger})`, model, 'COMPLETED');

        update({ status: 'completed', finished_at: Date.now() });

        return { runId, ceoKickoff: kickoff.text, ceoDebrief: debrief.text, ...outputsByColumn, totalTokens };
    } catch (error) {
        update({ status: 'error', error: error.message, finished_at: Date.now() });
        logActivity('ceo', 'CEO', 'ceo', `Échec du pipeline (${trigger}) : ${error.message}`, model, 'FAILED');
        throw error;
    }
}

module.exports = { runPipeline, getLeadsSummary, getMetricsSummary, getOverviewSummary };
