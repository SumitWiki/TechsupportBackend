const Customer       = require("../models/Customer");
const EmailLog       = require("../models/EmailLog");
const CustomerNote   = require("../models/CustomerNote");
const DeleteApproval = require("../models/DeleteApproval");
const { sendCustomerMail, buildCustomerEmailTemplate } = require("../config/mailer");
const { isSuperAdmin } = require("../middleware/role.middleware");

exports.addCustomer = async (req, res) => {
  try {
    const { name, email, phone, address, plan, notes, amount, paid_amount, offer } = req.body;
    if (!name || !phone) return res.status(400).json({ error: "name and phone are required" });
    const id = await Customer.create({
      name, email: email || "", phone, address, plan, notes,
      amount: amount || null,
      paid_amount: paid_amount || null,
      offer: offer || null,
      created_by: req.user.id,
    });
    const customer = await Customer.findById(id);
    res.status(201).json({ ok: true, customer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.searchCustomer = async (req, res) => {
  try {
    const { mobile, email } = req.query;
    if (!mobile && !email) return res.status(400).json({ error: "Provide mobile or email" });
    const results = await Customer.findByPhoneOrEmail(mobile || "", email || "");
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.getCustomer = async (req, res) => {
  try {
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Not found" });
    // Also fetch email logs and notes for this customer
    const [emailLogs, notes] = await Promise.all([
      EmailLog.forCustomer(c.id),
      CustomerNote.forCustomer(c.id),
    ]);
    res.json({ ...c, emailLogs, notes: notes });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    await Customer.update(req.params.id, req.body);
    const c = await Customer.findById(req.params.id);
    res.json({ ok: true, customer: c });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Delete customer — super_admin deletes immediately.
 * Admin/user with delete perm → creates approval request for super_admin.
 */
exports.deleteCustomer = async (req, res) => {
  try {
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Not found" });

    // Super admin can delete immediately
    if (isSuperAdmin(req.user)) {
      await Customer.delete(req.params.id);
      return res.json({ ok: true, message: "Customer deleted" });
    }

    // Others → create approval request
    const alreadyPending = await DeleteApproval.hasPending("customer", req.params.id);
    if (alreadyPending) {
      return res.status(409).json({ error: "Delete request already pending approval" });
    }

    await DeleteApproval.create({
      requested_by: req.user.id,
      target_type:  "customer",
      target_id:    parseInt(req.params.id),
      target_name:  c.name,
      reason:       req.body?.reason || null,
    });

    res.json({ ok: true, pending: true, message: "Delete request sent to Super Admin for approval" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * List customers — visibility rules:
 *   super_admin → sees all customers
 *   admin       → sees all customers
 *   user        → sees only customers they created
 */
exports.listCustomers = async (req, res) => {
  try {
    const seeAll = isSuperAdmin(req.user) || req.user?.role === "admin";
    const list = seeAll
      ? await Customer.all()
      : await Customer.byCreator(req.user.id);
    res.json({ results: list });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Send email to customer — uses SMTP from .env
 */
exports.sendCustomerEmail = async (req, res) => {
  try {
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Customer not found" });
    if (!c.email) return res.status(400).json({ error: "Customer has no email address" });

    const { subject, body } = req.body;
    if (!subject || !body) return res.status(400).json({ error: "subject and body are required" });

    try {
      // Wrap body in professional branded email template
      const html = buildCustomerEmailTemplate({ customerName: c.name, subject, bodyHtml: body });
      const text = body.replace(/<[^>]*>/g, "");
      await sendCustomerMail({ to: c.email, subject, html, text });
      // Log success
      await EmailLog.create({
        customer_id: c.id,
        sent_by:     req.user.id,
        to_email:    c.email,
        subject,
        body,
        status:      "sent",
      });
      res.json({ ok: true, message: `Email sent successfully to ${c.name} (${c.email})` });
    } catch (mailErr) {
      // Log failure
      await EmailLog.create({
        customer_id: c.id,
        sent_by:     req.user.id,
        to_email:    c.email,
        subject,
        body,
        status:      "failed",
        error_msg:   mailErr.message || "Unknown error",
      });
      res.status(500).json({ error: `Email not sent: ${mailErr.message}` });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Get email logs for a customer
 */
exports.getCustomerEmailLogs = async (req, res) => {
  try {
    const logs = await EmailLog.forCustomer(req.params.id);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Add a note to a customer
 */
exports.addCustomerNote = async (req, res) => {
  try {
    const { note } = req.body;
    if (!note || !note.trim()) return res.status(400).json({ error: "Note text is required" });
    const id = await CustomerNote.create({
      customer_id: parseInt(req.params.id),
      user_id:     req.user.id,
      note:        note.trim(),
    });
    const notes = await CustomerNote.forCustomer(req.params.id);
    res.status(201).json({ ok: true, id, notes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Get notes for a customer
 */
exports.getCustomerNotes = async (req, res) => {
  try {
    const notes = await CustomerNote.forCustomer(req.params.id);
    res.json({ notes });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Export customers as CSV
 */
exports.exportCustomers = async (req, res) => {
  try {
    const seeAll = isSuperAdmin(req.user) || req.user?.role === "admin";
    const list = seeAll
      ? await Customer.all(10000)
      : await Customer.byCreator(req.user.id, 10000);

    // Build CSV
    const headers = ["Name", "Email", "Phone", "Address", "Amount", "Paid Amount", "Offer", "Added By", "Created At"];
    const rows = list.map((c) => [
      `"${(c.name || "").replace(/"/g, '""')}"`,
      `"${(c.email || "").replace(/"/g, '""')}"`,
      `"${(c.phone || "").replace(/"/g, '""')}"`,
      `"${(c.address || "").replace(/"/g, '""')}"`,
      c.amount || "0",
      c.paid_amount || "0",
      `"${(c.offer || "").replace(/"/g, '""')}"`,
      `"${(c.added_by_name || "System").replace(/"/g, '""')}"`,
      c.created_at || "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=customers-${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

