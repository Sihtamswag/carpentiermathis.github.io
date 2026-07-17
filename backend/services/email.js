const nodemailer = require('nodemailer');

function getTransport() {
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
    const transport = getTransport();
    if (!transport) {
        throw new Error("Email non configuré : renseigne SMTP_HOST/SMTP_USER/SMTP_PASS dans l'environnement.");
    }
    if (!to) {
        throw new Error('Destinataire manquant.');
    }
    return transport.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html: html || undefined
    });
}

module.exports = { sendEmail, isConfigured: () => !!getTransport() };
