const nodemailer = require('nodemailer');

// Two ways to send: Resend's HTTP API (preferred — works over plain HTTPS,
// so it isn't affected by hosts that block outbound SMTP ports 465/587,
// which is a common issue on PaaS platforms like Railway/Render) or SMTP
// via nodemailer as a fallback if RESEND_API_KEY isn't set.

function isResendConfigured() {
    return !!process.env.RESEND_API_KEY;
}

async function sendViaResend({ to, subject, text, html }) {
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'Business Agents OS <onboarding@resend.dev>',
            to: [to],
            subject,
            text,
            html: html || undefined
        })
    });
    const rawBody = await response.text();
    if (!response.ok) {
        let message = rawBody;
        try { message = JSON.parse(rawBody).message || rawBody; } catch (e) { /* keep raw */ }
        throw new Error(`Resend a refusé l'envoi (statut ${response.status}) : ${message}`);
    }
}

function getSmtpTransport() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return null;
    }
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        secure: process.env.SMTP_SECURE !== 'false',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

async function sendEmail({ to, subject, text, html }) {
    if (!to) {
        throw new Error('Destinataire manquant.');
    }

    if (isResendConfigured()) {
        return sendViaResend({ to, subject, text, html });
    }

    const transport = getSmtpTransport();
    if (!transport) {
        throw new Error("Email non configuré : renseigne RESEND_API_KEY (recommandé) ou SMTP_HOST/SMTP_USER/SMTP_PASS dans l'environnement.");
    }
    return transport.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html: html || undefined
    });
}

module.exports = {
    sendEmail,
    isConfigured: () => isResendConfigured() || !!getSmtpTransport()
};
