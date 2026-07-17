// Manual version of the same bootstrap the server runs automatically at
// every boot. Useful for creating/resetting the admin account locally.
require('dotenv').config();
const { bootstrapAdmin } = require('../bootstrap-admin');

if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment.');
    process.exit(1);
}

bootstrapAdmin();
