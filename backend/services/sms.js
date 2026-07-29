// Talks to Twilio's REST API directly over HTTPS (no SDK needed) — same
// pattern as the Resend email integration: a plain fetch call with Basic
// Auth, so there's nothing extra to install or configure beyond env vars.
const crypto = require('crypto');

function isConfigured() {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}

async function sendSms(to, body) {
    if (!isConfigured()) {
        throw new Error("SMS non configuré : renseigne TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_PHONE_NUMBER dans l'environnement.");
    }
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

    const params = new URLSearchParams({
        To: to,
        From: process.env.TWILIO_PHONE_NUMBER,
        Body: body
    });

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
    });

    const rawBody = await response.text();
    let data;
    try {
        data = JSON.parse(rawBody);
    } catch (e) {
        throw new Error(`Réponse Twilio illisible (statut ${response.status}) : ${rawBody.slice(0, 200)}`);
    }
    if (!response.ok) {
        throw new Error(data.message || `Erreur Twilio (${response.status})`);
    }
    return data;
}

// Verifies X-Twilio-Signature so the inbound webhook only accepts requests
// that genuinely came from Twilio. See:
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
function verifyTwilioSignature(fullUrl, params, signatureHeader) {
    if (!process.env.TWILIO_AUTH_TOKEN || !signatureHeader) return false;
    const sortedKeys = Object.keys(params).sort();
    let data = fullUrl;
    sortedKeys.forEach((key) => {
        data += key + params[key];
    });
    const expected = crypto
        .createHmac('sha1', process.env.TWILIO_AUTH_TOKEN)
        .update(Buffer.from(data, 'utf-8'))
        .digest('base64');
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
    } catch (e) {
        return false;
    }
}

module.exports = { sendSms, isConfigured, verifyTwilioSignature };
