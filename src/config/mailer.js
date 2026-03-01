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
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

          <!-- ═══ HEADER ═══ -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e40af 50%,#2563eb 100%);padding:36px 44px;border-radius:16px 16px 0 0;text-align:center;">
              <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">TechSupport4</h1>
              <p style="margin:8px 0 0;font-size:12px;font-weight:500;color:#93c5fd;letter-spacing:2px;text-transform:uppercase;">Remote Tech Support &bull; USA &bull; UK &bull; Canada</p>
            </td>
          </tr>

          <!-- ═══ GREETING ═══ -->
          <tr>
            <td style="background-color:#ffffff;padding:36px 44px 0;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <p style="margin:0;font-size:16px;color:#1e293b;">Dear <strong>${customerName || "Valued Customer"}</strong>,</p>
            </td>
          </tr>

          <!-- ═══ BODY CONTENT ═══ -->
          <tr>
            <td style="background-color:#ffffff;padding:24px 44px 36px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <div style="font-size:15px;line-height:1.75;color:#374151;">
                ${bodyHtml}
              </div>
            </td>
          </tr>

          <!-- ═══ DIVIDER ═══ -->
          <tr>
            <td style="background-color:#ffffff;padding:0 44px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;">
            </td>
          </tr>

          <!-- ═══ CTA ═══ -->
          <tr>
            <td style="background-color:#ffffff;padding:28px 44px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0 0 18px;font-size:14px;color:#6b7280;">Need further assistance? Our team is ready to help.</p>
              <a href="https://techsupport4.com" style="display:inline-block;background:linear-gradient(135deg,#1e40af,#2563eb);color:#ffffff;padding:13px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Visit Our Website</a>
            </td>
          </tr>

          <!-- ═══ FOOTER ═══ -->
          <tr>
            <td style="background-color:#0f172a;padding:36px 44px;border-radius:0 0 16px 16px;text-align:center;">
              <p style="margin:0 0 6px;font-size:18px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">TechSupport4</p>
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase;">Billing Department</p>
              <hr style="border:none;border-top:1px solid #1e293b;margin:16px 0;">
              <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">Email: <a href="mailto:${fromEmail}" style="color:#60a5fa;text-decoration:none;">${fromEmail}</a></p>
              <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">Web: <a href="https://techsupport4.com" style="color:#60a5fa;text-decoration:none;">techsupport4.com</a></p>
              <hr style="border:none;border-top:1px solid #1e293b;margin:16px 0;">
              <p style="margin:0;font-size:11px;color:#475569;">&copy; ${year} TechSupport4. All rights reserved.</p>
              <p style="margin:4px 0 0;font-size:11px;color:#475569;">This email was sent to you as a valued customer of TechSupport4.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { sendMail, isConfigured, sendCustomerMail, isCustomerMailConfigured, buildCustomerEmailTemplate };
