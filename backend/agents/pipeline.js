// Server-side agent pipeline — runs for one of two independent workspaces:
// "business" (the general multi-agent system) or "real_estate" (a dedicated
// high-ticket lead-gen and sales pipeline for an independent real estate
// agent). Each workspace has its own CRM/tasks/content/metrics (filtered by
// the `workspace` column) and its own agent prompts.

const { db, normalizeWorkspace } = require('../db');

const CEO_PROMPTS = {
    business: {
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
    },
    real_estate: {
        kickoffSystem: `Tu es le CEO/Orchestrator d'un système multi-agents dédié à un agent immobilier
indépendant qui vise des ventes à forte commission (high-ticket). Ton rôle : recevoir le contexte (marché
visé, type de propriétés, budget de clientèle, objectifs de commission) et produire un court plan de routage
pour l'équipe de spécialistes qui va intervenir dans cet ordre : Researcher (marché immobilier local),
CMO (marque personnelle et contenu immobilier), Sales Rep (qualification acheteurs/vendeurs), Developer
(outils et intégrations immobilières), Data Analyst (KPIs de commissions et de pipeline). Pour chaque
spécialiste, précise en 1-2 phrases sur quoi il doit se concentrer en priorité. Reste bref et actionnable.
Réponds en français.`,
        debriefSystem: `Tu es le CEO/Orchestrator d'un système multi-agents dédié à un agent immobilier
indépendant. On te donne le contexte initial, ton plan de routage, et les sorties complètes des 5 agents
spécialistes. Ton rôle : produire une synthèse finale ("operator debrief") à destination de l'agent immobilier.
Résume les points clés de chaque volet (marché, marque, leads acheteurs/vendeurs, outils, KPIs), mets en
évidence les prochaines actions concrètes pour faire avancer les dossiers à plus forte commission en premier,
et signale les tensions ou incohérences entre les recommandations. Structure ta réponse avec des sections
claires. Réponds en français.`
    }
};

const AGENTS_BY_WORKSPACE = {
    business: [
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
    ],
    real_estate: [
        {
            id: 'researcher',
            name: 'Researcher',
            color: 'researcher',
            column: 'researcher',
            system: `Tu es le Researcher d'un système multi-agents pour un agent immobilier indépendant.
Ton rôle : à partir du contexte (marché visé, type de propriétés, budget de clientèle) et du plan de routage
du CEO, produis un brief de recherche immobilier structuré. Inclus : les tendances de prix et de volume de
ventes dans le marché ciblé, les quartiers/secteurs à fort potentiel de commission, le paysage concurrentiel
(autres agents/agences actifs dans ce marché), les signaux d'opportunité (nouvelles inscriptions, taux
hypothécaires, saisonnalité), et les sources fiables à consulter (associations immobilières, données MLS
publiques, rapports de marché locaux). Structure ta réponse avec des sections claires et reste concret.
Réponds en français.`
        },
        {
            id: 'cmo',
            name: 'CMO',
            color: 'cmo',
            column: 'cmo',
            system: `Tu es le CMO d'un système multi-agents pour un agent immobilier indépendant.
On te donne le contexte initial, le plan de routage du CEO, et le brief de recherche du Researcher. Ton rôle :
transformer cette stratégie en angles de contenu pour bâtir la marque personnelle de l'agent et attirer des
clients acheteurs/vendeurs à fort potentiel de commission. Propose 3 à 5 angles de contenu (mise en valeur de
propriétés, expertise de quartier, témoignages, coulisses de transactions), une mini-campagne (canaux, séquence,
message clé), et rédige au moins un draft prêt à publier (post réseau social ou email) entièrement rédigé.
Structure ta réponse avec des sections claires. Réponds en français.`
        },
        {
            id: 'sales',
            name: 'Sales Rep',
            color: 'sales',
            column: 'sales',
            system: `Tu es le Sales Rep d'un système multi-agents pour un agent immobilier indépendant qui
vise des ventes à forte commission. On te donne le contexte initial, le plan de routage du CEO, le brief de
recherche, et les angles marketing du CMO. Ton rôle : qualifier des leads acheteurs et vendeurs immobiliers.
Décris le profil de client idéal (budget, secteur recherché, motivation, préapprobation hypothécaire pour un
acheteur ; raison de vente et délai pour un vendeur) et les critères de qualification, rédige un email de
prospection complet et prêt à envoyer, ajoute un message de relance adapté au cycle de vente immobilier
(généralement plus long qu'une vente classique), et propose un plan de suivi concret jusqu'à la signature.
Structure ta réponse avec des sections claires. Réponds en français.`
        },
        {
            id: 'developer',
            name: 'Dev',
            color: 'developer',
            column: 'developer',
            system: `Tu es le Developer d'un système multi-agents pour un agent immobilier indépendant.
On te donne le contexte initial, le plan de routage du CEO, et les besoins exprimés par la recherche, le
marketing et les ventes. Ton rôle : proposer l'architecture technique nécessaire pour supporter les opérations
de l'agent (CRM immobilier, intégrations avec les portails d'annonces/MLS, automatisations de suivi de leads,
outils de signature électronique). Donne une stack suggérée, un plan de mise en œuvre par étapes concrètes, et
un plan de vérification pour s'assurer que chaque outil fonctionne réellement. Structure ta réponse avec des
sections claires. Réponds en français.`
        },
        {
            id: 'analyst',
            name: 'Data Analyst',
            color: 'analyst',
            column: 'analyst',
            system: `Tu es le Data Analyst d'un système multi-agents pour un agent immobilier indépendant.
On te donne l'ensemble du pipeline précédent. Ton rôle : définir les indicateurs clés à suivre (nombre de
leads qualifiés, taux de conversion visite → offre, valeur totale du pipeline de commissions potentielles,
délai moyen entre premier contact et signature), proposer un plan d'analyse de performance et de tendances, et
évaluer la qualité des signaux disponibles (fiabilité des données de leads, angles morts, recommandations pour
mieux mesurer l'activité). Structure ta réponse avec des sections claires. Réponds en français.`
        }
    ]
};

function getLeadsSummary(workspace) {
    const leads = db.prepare("SELECT * FROM leads WHERE workspace = ? AND status NOT IN ('gagne', 'perdu') ORDER BY next_date IS NULL, next_date LIMIT 10").all(workspace);
    if (!leads.length) return "Aucun prospect actif enregistré pour l'instant dans le CRM.";
    return leads.map((l) =>
        `- ${l.name} (${l.status})${l.next_action ? `, prochaine action : ${l.next_action}` : ''}${l.next_date ? ` le ${l.next_date}` : ''}`
    ).join('\n');
}

function getMetricsSummary(workspace) {
    const rows = db.prepare('SELECT * FROM metrics WHERE workspace = ? ORDER BY date DESC LIMIT 5').all(workspace).reverse();
    if (!rows.length) return "Aucun relevé de métriques enregistré pour l'instant.";
    return rows.map((m) =>
        `- ${m.date} : ${m.leads} leads, ${m.sales} ventes, ${m.revenue}$ de revenu, ${m.traffic} visites${m.note ? ` (${m.note})` : ''}`
    ).join('\n');
}

function getListingsSummary(workspace) {
    const rows = db.prepare("SELECT * FROM listings WHERE workspace = ? AND status = 'active' ORDER BY created_at DESC LIMIT 10").all(workspace);
    if (!rows.length) return "Aucune annonce active enregistrée pour l'instant — ajoute des annonces réelles dans l'onglet Annonces pour que le Researcher et le Sales Rep travaillent avec de vraies données au lieu de tendances générales.";
    return rows.map((l) =>
        `- ${l.title} (${l.property_type})${l.price ? `, ${l.price}$` : ''}${l.address ? `, ${l.address}` : ''}${l.notes ? ` — ${l.notes}` : ''}`
    ).join('\n');
}

function getOverviewSummary(workspace) {
    const openTasks = db.prepare("SELECT COUNT(*) c FROM tasks WHERE workspace = ? AND column_name != 'done'").get(workspace).c;
    const activeLeads = db.prepare("SELECT COUNT(*) c FROM leads WHERE workspace = ? AND status NOT IN ('gagne', 'perdu')").get(workspace).c;
    const pendingContent = db.prepare("SELECT COUNT(*) c FROM content_items WHERE workspace = ? AND status != 'publie'").get(workspace).c;
    const today = new Date().toISOString().slice(0, 10);
    const dueReminders = db.prepare('SELECT COUNT(*) c FROM reminders WHERE workspace = ? AND next_date <= ?').get(workspace, today).c;
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

function logActivity(workspace, agentId, agentName, color, text, model, status) {
    db.prepare(`
        INSERT INTO activity_log (agent_id, agent_name, color, text, model, status, timestamp, workspace)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(agentId, agentName, color, text, model, status, Date.now(), workspace);
}

// Pulls only the bullet points that sit under a "Prochaines actions" (or
// close variant) label, until the next non-bullet, non-blank line ends the
// section — so KPI descriptions and "Points clés" bullets elsewhere in the
// debrief don't get swept in as tasks.
function extractActionItems(text) {
    const lines = text.split('\n');
    const actions = [];
    let inSection = false;
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (/prochaines?\s+(actions?|étapes)/i.test(line) && line.length < 60) {
            inSection = true;
            continue;
        }
        const bulletMatch = line.match(/^[-*]\s+(.*)/);
        if (inSection && bulletMatch) {
            actions.push(bulletMatch[1].replace(/\*\*(.+?)\*\*/g, '$1').trim());
        } else if (inSection) {
            inSection = false;
        }
    }
    return actions;
}

function autoCreateTasksFromDebrief(workspace, debriefText, trigger) {
    const actions = extractActionItems(debriefText);
    const now = Date.now();
    actions.forEach((text) => {
        db.prepare(`
            INSERT INTO tasks (text, source, priority, column_name, created_at, workspace)
            VALUES (?, 'CEO Debrief', 'moyenne', 'pending', ?, ?)
        `).run(text, now, workspace);
    });
    if (actions.length) {
        logActivity(workspace, 'ceo', 'CEO', 'ceo', `${actions.length} tâche(s) créée(s) automatiquement (${trigger})`, null, 'COMPLETED');
    }
    return actions.length;
}

function autoSaveCmoContent(workspace, cmoText, trigger) {
    const title = `Draft CMO — ${new Date().toLocaleDateString('fr-FR')}`;
    db.prepare(`
        INSERT INTO content_items (title, channel, status, body, created_at, workspace)
        VALUES (?, 'reseaux-sociaux', 'brouillon', ?, ?, ?)
    `).run(title, cmoText, Date.now(), workspace);
    logActivity(workspace, 'cmo', 'CMO', 'cmo', `Draft enregistré automatiquement dans le calendrier de contenu (${trigger})`, null, 'COMPLETED');
}

function autoCreateLeadProfile(workspace, salesText, trigger) {
    const name = `Profil ICP suggéré — ${new Date().toLocaleDateString('fr-FR')}`;
    const nextAction = "Qualifier dès qu'un contact réel correspond à ce profil";
    db.prepare(`
        INSERT INTO leads (name, contact, status, next_action, notes, created_at, workspace)
        VALUES (?, '', 'nouveau', ?, ?, ?, ?)
    `).run(name, nextAction, salesText.slice(0, 2000), Date.now(), workspace);
    logActivity(workspace, 'sales', 'Sales Rep', 'sales', `Profil de prospect suggéré ajouté au CRM (${trigger})`, null, 'COMPLETED');
}

function buildUserMessage(businessContext, ceoKickoff, priorOutputs, extraContext) {
    let message = `Contexte initial :\n${businessContext}\n`;
    if (ceoKickoff) message += `\n--- Plan de routage du CEO ---\n${ceoKickoff}\n`;
    priorOutputs.forEach(({ name, text }) => {
        message += `\n--- Sortie de l'agent ${name} ---\n${text}\n`;
    });
    if (extraContext) message += `\n${extraContext}\n`;
    return message;
}

async function runPipeline({ businessContext, trigger = 'manual', workspace = 'business' }) {
    workspace = normalizeWorkspace(workspace);
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!apiKey) throw new Error('OPENAI_API_KEY manquant côté serveur.');
    if (!businessContext) throw new Error('Contexte manquant.');

    const CEO = CEO_PROMPTS[workspace];
    const AGENTS = AGENTS_BY_WORKSPACE[workspace];

    const insert = db.prepare(`
        INSERT INTO agent_runs (trigger, business_context, status, started_at, workspace)
        VALUES (?, ?, 'running', ?, ?)
    `).run(trigger, businessContext, Date.now(), workspace);
    const runId = insert.lastInsertRowid;

    const update = (fields) => {
        const keys = Object.keys(fields);
        const sql = `UPDATE agent_runs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
        db.prepare(sql).run(...keys.map((k) => fields[k]), runId);
    };

    let totalTokens = 0;
    const track = (tokens) => { totalTokens += tokens; update({ total_tokens: totalTokens }); };

    try {
        const kickoff = await callModel(apiKey, model, CEO.kickoffSystem, `Contexte initial :\n${businessContext}`);
        update({ ceo_kickoff: kickoff.text });
        track(kickoff.tokens);
        logActivity(workspace, 'ceo', 'CEO', 'ceo', `Plan de routage défini (${trigger})`, model, 'COMPLETED');

        const priorOutputs = [];
        const outputsByColumn = {};

        for (const agent of AGENTS) {
            const extraBlocks = [];
            if (agent.id === 'sales') extraBlocks.push(`--- CRM actuel (prospects enregistrés) ---\n${getLeadsSummary(workspace)}`);
            if (agent.id === 'analyst') extraBlocks.push(`--- Relevés de métriques récents ---\n${getMetricsSummary(workspace)}`);
            if (workspace === 'real_estate' && (agent.id === 'researcher' || agent.id === 'sales')) {
                extraBlocks.push(`--- Annonces réelles enregistrées ---\n${getListingsSummary(workspace)}`);
            }
            const extraContext = extraBlocks.length ? extraBlocks.join('\n') : null;

            const userMessage = buildUserMessage(businessContext, kickoff.text, priorOutputs, extraContext);
            const result = await callModel(apiKey, model, agent.system, userMessage);
            update({ [agent.column]: result.text });
            track(result.tokens);
            priorOutputs.push({ name: agent.name, text: result.text });
            outputsByColumn[agent.id] = result.text;
            logActivity(workspace, agent.id, agent.name, agent.color, `Sortie générée (${trigger})`, model, 'COMPLETED');

            if (agent.id === 'cmo') autoSaveCmoContent(workspace, result.text, trigger);
            if (agent.id === 'sales') autoCreateLeadProfile(workspace, result.text, trigger);
        }

        const debriefMessage = buildUserMessage(businessContext, kickoff.text, priorOutputs, `--- ${getOverviewSummary(workspace)} ---`);
        const debrief = await callModel(apiKey, model, CEO.debriefSystem, debriefMessage);
        update({ ceo_debrief: debrief.text });
        track(debrief.tokens);
        logActivity(workspace, 'ceo', 'CEO', 'ceo', `Synthèse opérateur générée (${trigger})`, model, 'COMPLETED');
        const tasksCreated = autoCreateTasksFromDebrief(workspace, debrief.text, trigger);

        update({ status: 'completed', finished_at: Date.now() });

        return {
            runId,
            workspace,
            ceoKickoff: kickoff.text,
            ceoDebrief: debrief.text,
            ...outputsByColumn,
            totalTokens,
            autoCreated: { tasks: tasksCreated, content: 1, leads: 1 }
        };
    } catch (error) {
        update({ status: 'error', error: error.message, finished_at: Date.now() });
        logActivity(workspace, 'ceo', 'CEO', 'ceo', `Échec du pipeline (${trigger}) : ${error.message}`, model, 'FAILED');
        throw error;
    }
}

const SMS_REPLY_SYSTEM = {
    business: `Tu es le Sales Rep (Revenue Ops) d'un système multi-agents business. Tu rédiges des réponses SMS
courtes (2-3 phrases maximum, ton direct et humain, pas de formules trop commerciales) dans une conversation
en cours avec un prospect. On te donne les notes du prospect et l'historique complet des SMS échangés.
Réponds uniquement avec le texte du SMS à envoyer, sans guillemets ni explication. Réponds en français.`,
    real_estate: `Tu es le Sales Rep d'un agent immobilier indépendant. Tu rédiges des réponses SMS courtes
(2-3 phrases maximum, ton chaleureux et professionnel, adapté à une conversation avec un acheteur ou un
vendeur immobilier) dans une conversation en cours. On te donne les notes du prospect (budget, secteur,
motivation) et l'historique complet des SMS échangés. Réponds uniquement avec le texte du SMS à envoyer,
sans guillemets ni explication. Réponds en français.`
};

async function draftSmsReply({ workspace, lead, history }) {
    workspace = normalizeWorkspace(workspace);
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!apiKey) throw new Error('OPENAI_API_KEY manquant côté serveur.');

    const historyText = history.map((m) => `${m.direction === 'inbound' ? 'Prospect' : 'Toi'} : ${m.body}`).join('\n');
    const userMessage = `Notes sur le prospect "${lead.name}" :\n${lead.notes || '(aucune note)'}\n\nHistorique de la conversation SMS :\n${historyText}\n\nRédige la prochaine réponse à envoyer.`;

    const result = await callModel(apiKey, model, SMS_REPLY_SYSTEM[workspace], userMessage);
    return result.text;
}

module.exports = { runPipeline, getLeadsSummary, getMetricsSummary, getOverviewSummary, draftSmsReply };
