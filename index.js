import nodemailer from 'nodemailer';

// Create a transporter object using the local SMTP server
const transporter = nodemailer.createTransport({
  host: 'localhost',
  port: 25,
  secure: false, // Will use STARTTLS
  tls: {
    // do not fail on invalid certs
    rejectUnauthorized: false
  }
});

/**
 * Sends an email.
 * @param {string} to - The recipient's email address.
 * @param {string} from - The sender's email address.
 * @param {string} subject - The subject of the email.
 * @param {string} html - The HTML body of the email.
 */
async function mail(to, from, subject, html) {
  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });
    console.log('Message sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

export default mail;