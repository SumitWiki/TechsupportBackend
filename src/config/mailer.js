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

/* ═══════════════════════════════════════════════════════════
   CUSTOMER SMTP — separate config for Customer → Send Email
   Falls back to system SMTP if CUSTOMER_SMTP vars not set.
   ═══════════════════════════════════════════════════════════ */
const custSmtpPort = parseInt(process.env.CUSTOMER_SMTP_PORT) || 587;

const customerTransporter = nodemailer.createTransport({
  host:   process.env.CUSTOMER_SMTP_HOST || process.env.SMTP_HOST || "smtp.gmail.com",
  port:   custSmtpPort,
  secure: custSmtpPort === 465,
  auth: {
    user: process.env.CUSTOMER_SMTP_USER || process.env.SMTP_USER,
    pass: process.env.CUSTOMER_SMTP_PASS || process.env.SMTP_PASS,
  },
});

const isCustomerMailConfigured =
  (process.env.CUSTOMER_SMTP_USER || process.env.SMTP_USER) &&
  (process.env.CUSTOMER_SMTP_PASS || process.env.SMTP_PASS);

function getCustomerFrom() {
  if (process.env.CUSTOMER_EMAIL_FROM) return process.env.CUSTOMER_EMAIL_FROM;
  if (process.env.CUSTOMER_SMTP_USER)  return `"TechSupport4" <${process.env.CUSTOMER_SMTP_USER}>`;
  return getFrom();
}

async function sendCustomerMail({ to, subject, html, text }) {
  if (!isCustomerMailConfigured) {
    console.log(`[CUST-MAIL-SKIP] Would send to ${to}: ${subject}`);
    return { skipped: true };
  }
  return customerTransporter.sendMail({ from: getCustomerFrom(), to, subject, html, text });
}

/* ═══════════════════════════════════════════════════════════
   PROFESSIONAL EMAIL TEMPLATE — Customer → Send Email
   Wraps the CRM editor body with branded header + footer.
   ═══════════════════════════════════════════════════════════ */
function buildCustomerEmailTemplate({ customerName, subject, bodyHtml }) {
  const year      = new Date().getFullYear();
  const fromEmail = (process.env.CUSTOMER_EMAIL_FROM || "").match(/<(.+)>/)?.[1]
                    || process.env.CUSTOMER_SMTP_USER
                    || process.env.SMTP_USER
                    || "support@techsupport4.com";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f5f7fa;">
  <div style="padding:30px;">
    <div style="max-width:650px;margin:auto;background:#ffffff;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,0.05);overflow:hidden;">

      <!-- Header -->
      <div style="background:#1a73e8;padding:20px;text-align:center;color:#ffffff;">
        <h2 style="margin:0;">TechSupport4</h2>
        <p style="margin:5px 0 0;font-size:14px;">Remote Tech Support &#8211; USA, UK &amp; Canada</p>
      </div>

      <!-- Body -->
      <div style="padding:30px;color:#333;">

        <p style="font-size:16px;">Hi ${customerName || "Valued Customer"},</p>

        <p style="margin-top:15px;">
          This email is regarding your recent billing or service update with TechSupport4.
        </p>

        <!-- Dynamic Content -->
        <div style="margin:20px 0;padding:15px;background:#f9fbff;border-left:4px solid #1a73e8;">
          ${bodyHtml}
        </div>

        <p style="margin-top:20px;">
          If you have any questions regarding this billing update, please contact our support team.
        </p>

        <!-- Call Section -->
        <div style="margin:25px 0;padding:15px;background:#eef4ff;text-align:center;border-radius:6px;">
          <strong>Need immediate assistance?</strong><br>
          Call our USA Support Line
        </div>

        <hr style="margin:30px 0;">

        <!-- Support Info -->
        <p style="font-size:14px;color:#555;">
          <strong>Billing Department</strong><br>
          This email was sent from the TechSupport4 Billing Department.<br>
          For general enquiries, contact us at
          <a href="mailto:${fromEmail}" style="color:#1a73e8;">${fromEmail}</a>
        </p>

        <p style="margin-top:30px;">
          Regards,<br>
          <strong>TechSupport4 Billing Team</strong>
        </p>

      </div>

      <!-- Footer -->
      <div style="background:#f1f3f4;padding:15px;text-align:center;font-size:12px;color:#777;">
        &copy; ${year} TechSupport4. All rights reserved.
      </div>

    </div>
  </div>
</body>
</html>`;
}

module.exports = { sendMail, isConfigured, sendCustomerMail, isCustomerMailConfigured, buildCustomerEmailTemplate };
