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
 * Send an email. Silently skips if SMTP is not configured.
 */
async function sendMail({ to, subject, html, text }) {
  if (!isConfigured) {
    console.log(`[MAIL-SKIP] Would send to ${to}: ${subject}`);
    return { skipped: true };
  }
  return transporter.sendMail({
    from:    process.env.EMAIL_FROM || '"TechSupport4" <no-reply@techsupport4.com>',
    to,
    subject,
    html,
    text,
  });
}

module.exports = { sendMail, isConfigured };
