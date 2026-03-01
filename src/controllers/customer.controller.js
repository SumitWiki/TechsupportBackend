const Customer           = require("../models/Customer");
const EmailLog           = require("../models/EmailLog");
const CustomerNote       = require("../models/CustomerNote");
const CustomerEditLog    = require("../models/CustomerEditLog");
const CustomerModRequest = require("../models/CustomerModRequest");
const DeleteApproval     = require("../models/DeleteApproval");
const Notification       = require("../models/Notification");
const User               = require("../models/User");
const { sendCustomerMail, buildCustomerEmailTemplate } = require("../config/mailer");
const { isSuperAdmin } = require("../middleware/role.middleware");

exports.addCustomer = async (req, res) => {
  try {
    const { name, email, phone, address, plan, notes, amount, paid_amount, offer, validity_months } = req.body;
    if (!name || !phone) return res.status(400).json({ error: "name and phone are required" });
    const id = await Customer.create({
      name, email: email || "", phone, address, plan, notes,
      amount: amount || null,
      paid_amount: paid_amount || null,
      offer: offer || null,
      validity_months: validity_months ? parseInt(validity_months) : null,
      created_by: req.user.id,
    });

    // Audit log for customer creation
    try {
      await CustomerEditLog.record({
        customer_id: id, edited_by: req.user.id, action: "create",
        field_name: null, old_value: null, new_value: name,
        note: `Customer "${name}" created`,
      });
    } catch (_) { /* non-fatal */ }

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
    // Only super admin can directly edit customers
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: "Only Super Admin can edit customers. Please submit a modification request." });
    }

    const existing = await Customer.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Customer not found" });

    // Track changes for audit log
    const trackFields = ["name", "email", "phone", "address", "plan", "notes", "amount", "paid_amount", "offer", "validity_months"];
    const changes = [];
    for (const field of trackFields) {
      if (req.body[field] !== undefined) {
        const oldVal = existing[field];
        const newVal = req.body[field];
        if (String(oldVal ?? "") !== String(newVal ?? "")) {
          changes.push({ field, oldVal: oldVal ?? "", newVal: newVal ?? "" });
        }
      }
    }

    await Customer.update(req.params.id, req.body);

    // Record all field changes in audit log
    if (changes.length > 0) {
      try {
        await CustomerEditLog.recordMany(
          parseInt(req.params.id), req.user.id, "update", changes,
          `Edited by ${req.user.name}`
        );
      } catch (_) { /* non-fatal */ }
    }

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

    // Notify all super admins
    try {
      const allUsers = await User.findAll();
      const superAdminIds = allUsers.filter((u) => isSuperAdmin(u)).map((u) => u.id);
      if (superAdminIds.length > 0) {
        await Notification.broadcast({
          user_ids: superAdminIds,
          type:     "delete_request",
          title:    `Delete request: Customer "${c.name}"`,
          message:  `${req.user.name || "A user"} requested to delete customer "${c.name}". Review in Approvals.`,
          link:     "/admin/dashboard?tab=approvals",
        });
      }
    } catch (notifErr) {
      console.error("Failed to send delete-request notification:", notifErr.message);
    }

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
    const headers = ["Name", "Email", "Phone", "Address", "Amount", "Paid Amount", "Offer", "Validity (Months)", "Expiry Date", "Added By", "Created At"];
    const rows = list.map((c) => [
      `"${(c.name || "").replace(/"/g, '""')}"`,
      `"${(c.email || "").replace(/"/g, '""')}"`,
      `"${(c.phone || "").replace(/"/g, '""')}"`,
      `"${(c.address || "").replace(/"/g, '""')}"`,
      c.amount || "0",
      c.paid_amount || "0",
      `"${(c.offer || "").replace(/"/g, '""')}"`,
      c.validity_months || "",
      c.expiry_date || "",
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

/* ═══════════════════════════════════════════════════════════════════════
   CUSTOMER EDIT AUDIT LOGS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Get edit audit logs for a specific customer
 */
exports.getCustomerEditLogs = async (req, res) => {
  try {
    const logs = await CustomerEditLog.forCustomer(parseInt(req.params.id));
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   MODIFICATION REQUEST WORKFLOW
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * User submits a modification request for a customer they added
 */
exports.requestModification = async (req, res) => {
  try {
    const { requested_changes, reason } = req.body;
    if (!requested_changes || typeof requested_changes !== "object" || !Object.keys(requested_changes).length) {
      return res.status(400).json({ error: "requested_changes object is required with at least one field" });
    }

    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    // Check if already has a pending request
    const alreadyPending = await CustomerModRequest.hasPending(customer.id, req.user.id);
    if (alreadyPending) {
      return res.status(409).json({ error: "You already have a pending modification request for this customer" });
    }

    const id = await CustomerModRequest.create({
      customer_id: customer.id,
      requested_by: req.user.id,
      requested_changes,
      reason: reason || null,
    });

    // Notify all super admins
    try {
      const allUsers = await User.findAll();
      const superAdminIds = allUsers.filter((u) => isSuperAdmin(u)).map((u) => u.id);
      if (superAdminIds.length > 0) {
        await Notification.broadcast({
          user_ids: superAdminIds,
          type: "modification_request",
          title: `Edit request: Customer "${customer.name}"`,
          message: `${req.user.name || "A user"} requested to modify customer "${customer.name}". Review in Approvals.`,
          link: "/admin/dashboard?tab=approvals",
        });
      }
    } catch (notifErr) {
      console.error("Failed to send mod-request notification:", notifErr.message);
    }

    // Log the request
    try {
      await CustomerEditLog.record({
        customer_id: customer.id, edited_by: req.user.id, action: "modification_requested",
        field_name: null, old_value: null, new_value: JSON.stringify(requested_changes),
        note: `Modification request by ${req.user.name}: ${reason || "No reason given"}`,
      });
    } catch (_) { /* non-fatal */ }

    res.status(201).json({ ok: true, id, message: "Modification request submitted for Super Admin review" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * List modification requests — super admin sees all, users see their own
 */
exports.listModRequests = async (req, res) => {
  try {
    const list = isSuperAdmin(req.user)
      ? await CustomerModRequest.findAll()
      : await CustomerModRequest.findByUser(req.user.id);
    res.json({ requests: list });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Count pending modification requests (for badge)
 */
exports.countPendingModRequests = async (req, res) => {
  try {
    const count = await CustomerModRequest.countPending();
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Super admin approves a modification request — applies changes + logs
 */
exports.approveModRequest = async (req, res) => {
  try {
    const modReq = await CustomerModRequest.findById(req.params.requestId);
    if (!modReq) return res.status(404).json({ error: "Request not found" });
    if (modReq.status !== "pending") return res.status(400).json({ error: "Request already " + modReq.status });

    const customer = await Customer.findById(modReq.customer_id);
    if (!customer) return res.status(404).json({ error: "Customer no longer exists" });

    const changes = typeof modReq.requested_changes === "string"
      ? JSON.parse(modReq.requested_changes)
      : modReq.requested_changes;

    // Track field-level changes for audit
    const auditChanges = [];
    for (const [field, newVal] of Object.entries(changes)) {
      const oldVal = customer[field];
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        auditChanges.push({ field, oldVal: oldVal ?? "", newVal: newVal ?? "" });
      }
    }

    // Apply the changes
    await Customer.update(modReq.customer_id, changes);

    // Mark request as approved
    await CustomerModRequest.approve(modReq.id, req.user.id, req.body.review_note || null);

    // Audit log
    if (auditChanges.length > 0) {
      try {
        await CustomerEditLog.recordMany(
          modReq.customer_id, req.user.id, "modification_approved", auditChanges,
          `Approved modification request #${modReq.id} from ${modReq.requested_by_name || "user"}. modification_request_from: user_id=${modReq.requested_by}`
        );
      } catch (_) { /* non-fatal */ }
    }

    // Notify the requester
    try {
      await Notification.broadcast({
        user_ids: [modReq.requested_by],
        type: "modification_approved",
        title: `Edit approved: Customer "${customer.name}"`,
        message: `Your modification request for "${customer.name}" has been approved by ${req.user.name}.`,
        link: `/admin/dashboard?tab=customers`,
      });
    } catch (_) { /* non-fatal */ }

    const updated = await Customer.findById(modReq.customer_id);
    res.json({ ok: true, message: "Modification approved and applied", customer: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Super admin rejects a modification request
 */
exports.rejectModRequest = async (req, res) => {
  try {
    const modReq = await CustomerModRequest.findById(req.params.requestId);
    if (!modReq) return res.status(404).json({ error: "Request not found" });
    if (modReq.status !== "pending") return res.status(400).json({ error: "Request already " + modReq.status });

    await CustomerModRequest.reject(modReq.id, req.user.id, req.body.review_note || null);

    // Audit log
    try {
      const customer = await Customer.findById(modReq.customer_id);
      await CustomerEditLog.record({
        customer_id: modReq.customer_id, edited_by: req.user.id, action: "modification_rejected",
        field_name: null, old_value: JSON.stringify(modReq.requested_changes),
        new_value: null,
        note: `Rejected modification request #${modReq.id} from ${modReq.requested_by_name || "user"}. modification_request_from: user_id=${modReq.requested_by}. Reason: ${req.body.review_note || "No reason given"}`,
      });
    } catch (_) { /* non-fatal */ }

    // Notify the requester
    try {
      const customer = await Customer.findById(modReq.customer_id);
      await Notification.broadcast({
        user_ids: [modReq.requested_by],
        type: "modification_rejected",
        title: `Edit rejected: Customer "${customer?.name || "unknown"}"`,
        message: `Your modification request was rejected by ${req.user.name}. ${req.body.review_note ? "Reason: " + req.body.review_note : ""}`,
        link: `/admin/dashboard?tab=customers`,
      });
    } catch (_) { /* non-fatal */ }

    res.json({ ok: true, message: "Modification request rejected" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
