const cron = require('node-cron');
const { getSetting, WORKSPACES } = require('./db');
const { runPipeline } = require('./agents/pipeline');
const email = require('./services/email');

const WORKSPACE_LABELS = { business: 'Mon Business', real_estate: 'Real Estate — High Ticket' };

function buildSummaryText(workspace, run) {
    return [
        `Pipeline "${WORKSPACE_LABELS[workspace]}" exécuté automatiquement le ${new Date(run.finished_at || Date.now()).toLocaleString('fr-FR')}.`,
        '',
        '--- Plan de routage du CEO ---',
        run.ceoKickoff,
        '',
        '--- Debrief opérateur ---',
        run.ceoDebrief
    ].join('\n');
}

async function runWorkspaceIfConfigured(workspace, schedule) {
    const businessContext = getSetting(`business_context:${workspace}`, '');
    if (!businessContext) {
        console.log(`[scheduler] "${WORKSPACE_LABELS[workspace]}" ignoré : aucun contexte configuré.`);
        return;
    }
    console.log(`[scheduler] Lancement automatique du pipeline "${WORKSPACE_LABELS[workspace]}" (${schedule})...`);
    try {
        const run = await runPipeline({ businessContext, trigger: 'scheduled', workspace });
        if (process.env.NOTIFY_EMAIL && email.isConfigured()) {
            await email.sendEmail({
                to: process.env.NOTIFY_EMAIL,
                subject: `Business Agents OS — résumé automatique (${WORKSPACE_LABELS[workspace]})`,
                text: buildSummaryText(workspace, run)
            });
        }
        console.log(`[scheduler] Run "${WORKSPACE_LABELS[workspace]}" terminé avec succès.`);
    } catch (error) {
        console.error(`[scheduler] Échec du run "${WORKSPACE_LABELS[workspace]}" :`, error.message);
        if (process.env.NOTIFY_EMAIL && email.isConfigured()) {
            await email.sendEmail({
                to: process.env.NOTIFY_EMAIL,
                subject: `Business Agents OS — échec du run automatique (${WORKSPACE_LABELS[workspace]})`,
                text: `Le run automatique a échoué : ${error.message}`
            }).catch(() => {});
        }
    }
}

function startScheduler() {
    const schedule = process.env.PIPELINE_CRON;
    if (!schedule) {
        console.log('PIPELINE_CRON non défini — aucune exécution automatique programmée.');
        return;
    }
    if (!cron.validate(schedule)) {
        console.error(`PIPELINE_CRON invalide : "${schedule}" — planification désactivée.`);
        return;
    }

    cron.schedule(schedule, async () => {
        // Runs sequentially for every workspace that has a business context
        // configured, so one cron schedule covers both business units.
        for (const workspace of WORKSPACES) {
            await runWorkspaceIfConfigured(workspace, schedule);
        }
    });

    console.log(`Pipeline programmé : "${schedule}" (pour chaque workspace configuré)`);
}

module.exports = { startScheduler };
