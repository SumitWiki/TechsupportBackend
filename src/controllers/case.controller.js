const Case = require("../models/Case");
const AuditLog = require("../models/AuditLog");
const { sendMail } = require("../config/mailer");

/** HTML-escape to prevent XSS in emails */
function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Public — called from contact form (Next.js frontend)
exports.createFromContact = async (req, res) => {
  try {
    console.log("📩 [createFromContact] Received request:", { name: req.body.name, email: req.body.email, phone: req.body.phone });
    
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: "name, email and message are required" });

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Invalid email address" });

    // Length limits
    if (name.length > 150) return res.status(400).json({ error: "Name too long" });
    if (message.length > 5000) return res.status(400).json({ error: "Message too long (max 5000 chars)" });
    if (subject && subject.length > 255) return res.status(400).json({ error: "Subject too long" });
    if (phone && !/^[\d\s\-+().]+$/.test(phone)) return res.status(400).json({ error: "Phone must contain only digits and standard characters" });

    const { id, caseId } = await Case.create({
      name, email,
      phone:   phone   || "N/A",
      subject: subject || "General Enquiry",
      message,
      source:  "contact_form",
    });
    
    console.log(`✅ [createFromContact] Case created in DB: ${caseId} (ID: ${id})`);

    // Email to admin — all user data HTML-escaped
    await sendMail({
      to:      process.env.ADMIN_EMAIL || "support@techsupport4.com",
      subject: `[NEW CASE] ${caseId} — ${esc(subject || "General Enquiry")}`,
      html: `
        <h2>New Support Case</h2>
        <table style="border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px;color:#64748b">Case ID</td><td><strong>${esc(caseId)}</strong></td></tr>
          <tr><td style="padding:6px;color:#64748b">Name</td><td>${esc(name)}</td></tr>
          <tr><td style="padding:6px;color:#64748b">Email</td><td>${esc(email)}</td></tr>
          <tr><td style="padding:6px;color:#64748b">Phone</td><td>${esc(phone || "N/A")}</td></tr>
          <tr><td style="padding:6px;color:#64748b">Subject</td><td>${esc(subject || "General Enquiry")}</td></tr>
        </table>
        <p style="margin-top:16px"><strong>Message:</strong><br/>${esc(message).replace(/\n/g, "<br/>")}</p>
      `,
    });

    // Confirmation to user
    await sendMail({
      to:      email,
      subject: `We've received your request — Case ${caseId}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto">
          <h2 style="color:#1e40af">Thank you, ${esc(name)}!</h2>
          <p>Your support request has been received. Our team will get back to you shortly.</p>
          <div style="background:#f1f5f9;border-radius:8px;padding:16px;font-size:15px">
            <strong>Your Case ID:</strong>
            <span style="font-family:monospace;font-size:20px;color:#1e40af;margin-left:8px">${esc(caseId)}</span>
          </div>
          <p style="color:#64748b;font-size:13px;margin-top:16px">Please quote this Case ID in any future communication.</p>
          <hr/>
          <p style="font-size:12px;color:#94a3b8">TechSupport4 | support@techsupport4.com</p>
        </div>
      `,
    });

    return res.status(201).json({ ok: true, caseId, id });
  } catch (err) {
    console.error("createFromContact:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.listCases = async (req, res) => {
  try {
    const { status, search, page, limit } = req.query;
    const data = await Case.listAll({ status, search, page: parseInt(page) || 1, limit: parseInt(limit) || 50 });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// Admin — create ticket manually from CRM
exports.createManual = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: "name, email and message required" });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Invalid email" });
    if (phone && !/^[\d\s\-+().]+$/.test(phone)) return res.status(400).json({ error: "Phone must contain only digits" });
    const { caseId } = await Case.create({ name, email, phone: phone || "N/A", subject: subject || "Manual Ticket", message, source: "crm_manual" });
    res.status(201).json({ ok: true, caseId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.getCase = async (req, res) => {
  try {
    const c = await Case.findByCaseId(req.params.caseId);
    if (!c) return res.status(404).json({ error: "Case not found" });
    const notes = await Case.notes(c.id);
    res.json({ ...c, notes });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.closeCase = async (req, res) => {
  try {
    const c = await Case.findByCaseId(req.params.caseId);
    if (!c) return res.status(404).json({ error: "Not found" });
    const oldStatus = c.status;
    await Case.updateStatus(c.id, "closed");
    await AuditLog.record({ caseId: c.id, userId: req.user.id, action: "status_change", oldStatus, newStatus: "closed" });
    res.json({ ok: true, status: "closed" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.reopenCase = async (req, res) => {
  try {
    const c = await Case.findByCaseId(req.params.caseId);
    if (!c) return res.status(404).json({ error: "Not found" });
    const oldStatus = c.status;
    await Case.updateStatus(c.id, "reopened");
    await AuditLog.record({ caseId: c.id, userId: req.user.id, action: "status_change", oldStatus, newStatus: "reopened" });
    res.json({ ok: true, status: "reopened" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.assignCase = async (req, res) => {
  try {
    const c = await Case.findByCaseId(req.params.caseId);
    if (!c) return res.status(404).json({ error: "Not found" });
    const oldStatus = c.status;
    await Case.assign(c.id, req.body.userId);
    await AuditLog.record({ caseId: c.id, userId: req.user.id, action: "assigned", oldStatus, newStatus: "in_progress", note: `Assigned to user ${req.body.userId}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.updatePriority = async (req, res) => {
  try {
    const c = await Case.findByCaseId(req.params.caseId);
    if (!c) return res.status(404).json({ error: "Not found" });
    const { priority } = req.body;
    if (!["low", "medium", "high", "urgent"].includes(priority)) {
      return res.status(400).json({ error: "Priority must be low, medium, high, or urgent" });
    }
    const oldPriority = c.priority || "medium";
    await Case.updatePriority(c.id, priority);
    await AuditLog.record({ caseId: c.id, userId: req.user.id, action: "priority_change", oldStatus: oldPriority, newStatus: priority, note: `Priority changed from ${oldPriority} to ${priority}` });
    res.json({ ok: true, priority });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.markInProgress = async (req, res) => {
  try {
    const c = await Case.findByCaseId(req.params.caseId);
    if (!c) return res.status(404).json({ error: "Not found" });
    const oldStatus = c.status;
    await Case.updateStatus(c.id, "in_progress");
    await AuditLog.record({ caseId: c.id, userId: req.user.id, action: "status_change", oldStatus, newStatus: "in_progress" });
    res.json({ ok: true, status: "in_progress" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.addNote = async (req, res) => {
  try {
    const c = await Case.findByCaseId(req.params.caseId);
    if (!c) return res.status(404).json({ error: "Not found" });
    if (!req.body.note) return res.status(400).json({ error: "note required" });
    await Case.addNote(c.id, req.user.id, req.body.note);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.stats = async (_req, res) => {
  try {
    const data = await Case.stats();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.getAuditLog = async (req, res) => {
  try {
    const c = await Case.findByCaseId(req.params.caseId);
    if (!c) return res.status(404).json({ error: "Not found" });
    const logs = await AuditLog.forCase(c.id);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.recentAudit = async (req, res) => {
  try {
    const logs = await AuditLog.recent(parseInt(req.query.limit) || 200);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// Mark case as OPEN
exports.markOpen = async (req, res) => {
  try {
    const c = await Case.findByCaseId(req.params.caseId);
    if (!c) return res.status(404).json({ error: "Not found" });
    const oldStatus = c.status;
    await Case.updateStatus(c.id, "open");
    await AuditLog.record({ caseId: c.id, userId: req.user.id, action: "status_change", oldStatus, newStatus: "open" });
    res.json({ ok: true, status: "open" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// Delete case (Super Admin only)
exports.deleteCase = async (req, res) => {
  try {
    const c = await Case.findByCaseId(req.params.caseId);
    if (!c) return res.status(404).json({ error: "Not found" });
    
    // Log deletion before removing
    await AuditLog.record({ 
      caseId: c.id, 
      userId: req.user.id, 
      action: "deleted", 
      oldStatus: c.status, 
      newStatus: "deleted",
      note: `Case ${c.case_id} deleted by ${req.user.name}`
    });
    
    await Case.delete(c.id);
    res.json({ ok: true, message: "Case deleted successfully" });
  } catch (err) {
    console.error("deleteCase:", err);
    res.status(500).json({ error: "Server error" });
  }
};
