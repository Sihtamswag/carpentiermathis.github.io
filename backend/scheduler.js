const cron = require('node-cron');
const { getSetting } = require('./db');
const { runPipeline } = require('./agents/pipeline');
const email = require('./services/email');

function buildSummaryText(run) {
    return [
        `Pipeline exécuté automatiquement le ${new Date(run.finished_at || Date.now()).toLocaleString('fr-FR')}.`,
        '',
        '--- Plan de routage du CEO ---',
        run.ceoKickoff,
        '',
        '--- Debrief opérateur ---',
        run.ceoDebrief
    ].join('\n');
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
        const businessContext = getSetting('business_context', process.env.PIPELINE_BUSINESS_CONTEXT || '');
        if (!businessContext) {
            console.error('Exécution automatique ignorée : aucun contexte business configuré.');
            return;
        }
        console.log(`[scheduler] Lancement automatique du pipeline (${schedule})...`);
        try {
            const run = await runPipeline({ businessContext, trigger: 'scheduled' });
            if (process.env.NOTIFY_EMAIL && email.isConfigured()) {
                await email.sendEmail({
                    to: process.env.NOTIFY_EMAIL,
                    subject: 'Business Agents OS — résumé automatique',
                    text: buildSummaryText(run)
                });
            }
            console.log('[scheduler] Run terminé avec succès.');
        } catch (error) {
            console.error('[scheduler] Échec du run automatique :', error.message);
            if (process.env.NOTIFY_EMAIL && email.isConfigured()) {
                await email.sendEmail({
                    to: process.env.NOTIFY_EMAIL,
                    subject: 'Business Agents OS — échec du run automatique',
                    text: `Le run automatique a échoué : ${error.message}`
                }).catch(() => {});
            }
        }
    });

    console.log(`Pipeline programmé : "${schedule}"`);
}

module.exports = { startScheduler };
