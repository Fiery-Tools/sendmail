# Setting Up a Send-Only SMTP Server on a VPS for Node.js

This guide documents the complete process of configuring a send-only Postfix SMTP server on a Contabo VPS (running Ubuntu) for use with a Node.js application. It covers the initial setup, common deliverability issues, and the final, working configuration that passes modern email authentication standards (SPF, DKIM, and FCrDNS).

The primary goal is to send emails directly from the VPS, which requires careful configuration to avoid being marked as spam by major email providers like Gmail.

## Prerequisites

-   A VPS with a static IP address (e.g., from Contabo). Let's use the placeholder `YOUR_VPS_IP`.
-   A registered domain name (`fiery.tools`).
-   Administrative (sudo) access to the VPS.
-   Node.js installed on the VPS.

---

## Part 1: Server-Side Configuration (Postfix & OpenDKIM)

This section covers the installation and configuration of the software on the VPS that will send the email.

### 1.1. Install Postfix

Postfix is the Mail Transfer Agent (MTA) that will handle the sending of emails.

```bash
sudo apt-get update
sudo apt-get install postfix
```

During the installation, you will be prompted with two configuration screens:
-   **General mail configuration type:** Choose **Internet Site**.
-   **System mail name:** Enter your primary domain name (e.g., `fiery.tools`). We will refine this later.

### 1.2. Configure Postfix (`main.cf`)

We need to edit the main Postfix configuration file to control how it behaves. The final configuration uses a subdomain for sending mail to ensure a clean sender reputation.

First, open the configuration file:
```bash
sudo nano /etc/postfix/main.cf
```

Ensure the following key parameters are set. These tell Postfix its identity and that it should only handle local delivery for `localhost`, relaying all other mail to the internet.

```ini
# Set the server's identity to a subdomain for mail
myhostname = mail.fiery.tools
myorigin = mail.fiery.tools

# Tell postfix to only accept mail for localhost, and relay all other mail
mydestination = localhost

# Other recommended settings
inet_interfaces = all
inet_protocols = ipv4
```

### 1.3. Install and Configure OpenDKIM

DKIM (DomainKeys Identified Mail) adds a digital signature to emails, which is a critical authentication signal.

1.  **Install OpenDKIM:**
```bash
sudo apt-get install opendkim opendkim-tools
```

2.  **Create a directory for the keys:**
```bash
sudo mkdir -p /etc/postfix/dkim
```

3.  **Generate the DKIM key.** We'll use a selector based on the date (e.g., `20251015`).
```bash
# Replace fiery.tools with your domain and 20251015 with your chosen selector
sudo opendkim-genkey -b 2048 -d fiery.tools -D /etc/postfix/dkim -s 20251015
```

4.  **Set correct ownership and permissions:**
```bash
sudo chown -R opendkim:opendkim /etc/postfix/dkim
sudo chmod go-r /etc/postfix/dkim/20251015.private
```

5.  **Configure OpenDKIM.** Edit the main configuration file:
```bash
sudo nano /etc/opendkim.conf
```
   Ensure the following lines are present and uncommented:

```ini
Socket                  inet:8891@localhost
KeyTable                /etc/postfix/dkim/KeyTable
SigningTable            /etc/postfix/dkim/SigningTable
```

6.  **Create the `KeyTable` and `SigningTable` files.**
    *   Create the `KeyTable`:
```bash
sudo nano /etc/postfix/dkim/KeyTable
```
        Add one line that maps the key to the domain and private key file:
        `20251015._domainkey.fiery.tools fiery.tools:20251015:/etc/postfix/dkim/20251015.private`

    *   Create the `SigningTable`:
```bash
sudo nano /etc/postfix/dkim/SigningTable
```
        Add one line that tells OpenDKIM to sign emails from your domain. Using a wildcard `*@` ensures it covers subdomains as well.
        `*@fiery.tools 20251015._domainkey.fiery.tools`

### 1.4. Connect Postfix to OpenDKIM

Finally, tell Postfix to use the OpenDKIM service (known as a "milter") to sign outgoing emails.

Add the following lines to the end of `/etc/postfix/main.cf`:
```ini
# DKIM Milter Configuration
milter_default_action = accept
milter_protocol = 2
smtpd_milters = inet:localhost:8891
non_smtpd_milters = $smtpd_milters
```

### 1.5. Restart Services

Apply all changes by restarting both services.
```bash
sudo systemctl restart opendkim
sudo systemctl restart postfix
```

---

## Part 2: DNS Configuration

Proper DNS records are essential for email authentication. All records are managed at your DNS provider (e.g., Cloudflare), except for the PTR record.

| Type | Name / Host | Value / Content | Notes |
| :--- | :--- | :--- | :--- |
| A    | `mail` | `YOUR_VPS_IP` | Points the subdomain `mail.fiery.tools` directly to your server. Disable the Cloudflare proxy (DNS Only). |
| PTR  | `YOUR_VPS_IP` | `mail.fiery.tools` | **Set in your Contabo control panel.** This is the Reverse DNS record. It must match the A record's hostname. |
| TXT  | `mail` | `v=spf1 ip4:YOUR_VPS_IP ~all` | The **SPF record** for your sending subdomain. Authorizes your VPS to send mail for `mail.fiery.tools`. |
| TXT  | `20251015._domainkey` | `v=DKIM1; h=sha256; k=rsa; p=...your-long-public-key...` | The **DKIM record**. The value is found in `/etc/postfix/dkim/20251015.txt` on your server. |

**Note on Cloudflare Email Routing:**
The main domain's (`fiery.tools`) SPF record is often locked by Cloudflare's Email Routing service. The strategy of sending from a subdomain (`mail.fiery.tools`) cleanly bypasses this limitation without breaking incoming mail forwarding.

---

## Part 3: Node.js Email Library

This is the code for the custom mail sending module, which uses `nodemailer`.

### 3.1. Project Setup
```bash
mkdir fiery-tools-sendmail
cd fiery-tools-sendmail
npm init -y
npm install nodemailer
```

### 3.2. The `index.js` Mail Module
This code connects to the local Postfix service. The `tls: { rejectUnauthorized: false }` is crucial for handling the default self-signed certificate Postfix uses for local STARTTLS connections.

```javascript
import nodemailer from 'nodemailer';

// Create a transporter object using the local Postfix SMTP server
const transporter = nodemailer.createTransport({
  host: 'localhost',
  port: 25,
  secure: false, // Use STARTTLS
  tls: {
    // Do not fail on the default self-signed certificate
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
```

---

## Part 4: Usage Example

This is how you would use your new library in any other project on the server.

### `send-test-email.js`
```javascript
import mail from '@fiery-tools/sendmail';

// The recipient's email address
const to = 'recipient@gmail.com';

// The sender's email address. MUST use the authenticated subdomain.
const from = 'support@mail.fiery.tools';

const subject = 'Test Email from Contabo VPS';
const html = '<h1>Hello World!</h1><p>This is a test email sent from a Node.js application that passes SPF and DKIM.</p>';

mail(to, from, subject, html);
```

Run the script from your server to send the email:
```bash
node send-test-email.js
```
If all steps were followed correctly, the email will be delivered to the recipient's inbox.