// Generic outbound publish webhook — point PUBLISH_WEBHOOK_URL at Zapier,
// Make, n8n, or your own endpoint to actually push content to real social
// accounts. This avoids building separate OAuth flows for every platform
// (Instagram Graph API, LinkedIn API, X API, ...), each of which needs its
// own developer app and review process the user has to set up themselves.

async function publishContent(item) {
    const url = process.env.PUBLISH_WEBHOOK_URL;
    if (!url) {
        throw new Error("Aucun webhook de publication configuré : renseigne PUBLISH_WEBHOOK_URL dans l'environnement (ex: une URL Zapier/Make/n8n).");
    }
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: item.title,
            channel: item.channel,
            body: item.body,
            source: 'business-agents-os'
        })
    });
    if (!response.ok) {
        throw new Error(`Le webhook de publication a répondu avec le statut ${response.status}.`);
    }
    return true;
}

module.exports = { publishContent, isConfigured: () => !!process.env.PUBLISH_WEBHOOK_URL };
