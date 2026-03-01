const nodemailer = require("nodemailer");

/* ═══════════════════════════════════════════════════════════
   SYSTEM SMTP — used for OTP, password reset, notifications
   ═══════════════════════════════════════════════════════════ */
const smtpPort = parseInt(process.env.SMTP_PORT) || 587;

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || "smtp.gmail.com",
  port:   smtpPort,
  secure: smtpPort === 465,
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

function getFrom() {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  if (process.env.SMTP_USER) return `"TechSupport4" <${process.env.SMTP_USER}>`;
  return '"TechSupport4" <no-reply@techsupport4.com>';
}

async function sendMail({ to, subject, html, text }) {
  if (!isConfigured) {
    console.log(`[MAIL-SKIP] Would send to ${to}: ${subject}`);
    return { skipped: true };
  }
  return transporter.sendMail({ from: getFrom(), to, subject, html, text });
}

/* ═══════════════════════════════════════════════════════════
   CUSTOMER SMTP — separate account for customer outbound emails
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
  if (process.env.CUSTOMER_SMTP_USER) return `"TechSupport4" <${process.env.CUSTOMER_SMTP_USER}>`;
  return getFrom(); // fallback to system from
}

async function sendCustomerMail({ to, subject, html, text }) {
  if (!isCustomerMailConfigured) {
    console.log(`[CUST-MAIL-SKIP] Would send to ${to}: ${subject}`);
    return { skipped: true };
  }
  return customerTransporter.sendMail({ from: getCustomerFrom(), to, subject, html, text });
}

/* ═══════════════════════════════════════════════════════════
   PROFESSIONAL EMAIL TEMPLATE — wraps body with company branding
   ═══════════════════════════════════════════════════════════ */
function buildEmailTemplate({ subject, bodyHtml }) {
  const company   = process.env.COMPANY_NAME    || "TechSupport4";
  const website   = process.env.COMPANY_WEBSITE || "https://techsupport4.com";
  const phone     = process.env.COMPANY_PHONE   || "";
  const address   = process.env.COMPANY_ADDRESS  || "";
  const year      = new Date().getFullYear();
  const fromEmail = (process.env.CUSTOMER_EMAIL_FROM || "").match(/<(.+)>/)?.[1] || process.env.CUSTOMER_SMTP_USER || "support@techsupport4.com";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- ═══ HEADER ═══ -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding:32px 40px; border-radius:12px 12px 0 0; text-align:center;">
              <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${company}</h1>
              <p style="margin:6px 0 0;font-size:13px;color:#93c5fd;letter-spacing:1px;text-transform:uppercase;">Professional Tech Support</p>
            </td>
          </tr>

          <!-- ═══ BODY ═══ -->
          <tr>
            <td style="background-color:#ffffff;padding:40px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <div style="font-size:15px;line-height:1.7;color:#374151;">
                ${bodyHtml}
              </div>
            </td>
          </tr>

          <!-- ═══ DIVIDER ═══ -->
          <tr>
            <td style="background-color:#ffffff;padding:0 40px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;">
            </td>
          </tr>

          <!-- ═══ CTA SECTION ═══ -->
          <tr>
            <td style="background-color:#ffffff;padding:24px 40px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">Need further assistance? We're here to help.</p>
              <a href="${website}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Visit Our Website</a>
            </td>
          </tr>

          <!-- ═══ FOOTER ═══ -->
          <tr>
            <td style="background-color:#1e293b;padding:32px 40px;border-radius:0 0 12px 12px;text-align:center;">
              <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#ffffff;">${company}</p>
              ${phone ? `<p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">Phone: ${phone}</p>` : ""}
              ${address ? `<p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">${address}</p>` : ""}
              <p style="margin:0 0 12px;font-size:13px;color:#94a3b8;"><a href="${website}" style="color:#60a5fa;text-decoration:none;">${website.replace(/^https?:\/\//, "")}</a></p>
              <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Email: <a href="mailto:${fromEmail}" style="color:#60a5fa;text-decoration:none;">${fromEmail}</a></p>
              <hr style="border:none;border-top:1px solid #334155;margin:16px 0;">
              <p style="margin:0;font-size:11px;color:#64748b;">&copy; ${year} ${company}. All rights reserved.</p>
              <p style="margin:4px 0 0;font-size:11px;color:#64748b;">This email was sent to you because you are a valued customer.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { sendMail, isConfigured, sendCustomerMail, isCustomerMailConfigured, buildEmailTemplate };
