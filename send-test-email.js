import mail from './index.js';

const to = 'recipient@example.com';
const from = 'sender@yourdomain.com';
const subject = 'Test Email from Contabo VPS';
const html = '<h1>Hello World!</h1><p>This is a test email sent from a Node.js application on a Contabo VPS.</p>';

mail(to, from, subject, html);