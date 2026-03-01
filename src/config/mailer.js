const nodemailer = require("nodemailer");

const smtpPort = parseInt(process.env.SMTP_PORT) || 587;

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || "smtp.gmail.com",
  port:   smtpPort,
  secure: smtpPort === 465,   // true for port 465, false for 587/others
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const isConfigured =
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  !process.env.SMTP_USER.includes("your_") &&
  !process.env.SMTP_PASS.includes("your_");

/**
 * Build the "from" address.
 * Priority: EMAIL_FROM env  →  SMTP_USER (ensures relay is allowed)
 */
function getFrom() {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  if (process.env.SMTP_USER) return `"TechSupport4" <${process.env.SMTP_USER}>`;
  return '"TechSupport4" <no-reply@techsupport4.com>';
}

/**
 * Send an email. Silently skips if SMTP is not configured.
 */
async function sendMail({ to, subject, html, text }) {
  if (!isConfigured) {
    console.log(`[MAIL-SKIP] Would send to ${to}: ${subject}`);
    return { skipped: true };
  }
  return transporter.sendMail({
    from: getFrom(),
    to,
    subject,
    html,
    text,
  });
}

module.exports = { sendMail, isConfigured };
