import mail from './index.js';

const to = 'pguardiario@gmail.com';
const from = 'support@fiery.tools';
const subject = 'Test Email from Fiery Tools';
const html = '<h1>Hello World!</h1><p>This is a test email sent from a Node.js application on a Contabo VPS.</p>';

mail(to, from, subject, html);