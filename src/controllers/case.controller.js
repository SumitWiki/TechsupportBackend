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
    if (!name || !email || !phone || !message) return res.status(400).json({ error: "name, email, phone and message are required" });

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Invalid email address" });

    // Phone validation: must start with +1 and have exactly 10 digits after
    if (!/^\+1\d{10}$/.test(phone.trim())) {
      return res.status(400).json({ error: "Phone must start with +1 and contain exactly 10 digits after. Only digits and + allowed." });
    }

    // Length limits
    if (name.length > 150) return res.status(400).json({ error: "Name too long" });
    if (message.length > 5000) return res.status(400).json({ error: "Message too long (max 5000 chars)" });
    if (subject && subject.length > 255) return res.status(400).json({ error: "Subject too long" });

    let dbResult;
    try {
      dbResult = await Case.create({
        name, email,
        phone:   phone   || "N/A",
        subject: subject || "General Enquiry",
        message,
        source:  "contact_form",
      });
    } catch (dbErr) {
      console.error("❌ [createFromContact] DB insert failed:", dbErr);
      return res.status(500).json({ error: "Failed to save ticket. Please try again later." });
    }
    const { id, caseId } = dbResult;
    console.log(`✅ [createFromContact] Case created in DB: ${caseId} (ID: ${id})`);

    // No email sending for contact form submissions
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
