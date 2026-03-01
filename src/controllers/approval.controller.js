const DeleteApproval = require("../models/DeleteApproval");
const Customer       = require("../models/Customer");
const User           = require("../models/User");
const Notification   = require("../models/Notification");
const { isSuperAdmin } = require("../middleware/role.middleware");

/**
 * List pending approvals (super_admin sees all, admin sees own)
 */
exports.listApprovals = async (req, res) => {
  try {
    if (isSuperAdmin(req.user)) {
      const list = await DeleteApproval.findAll();
      return res.json({ approvals: list, requests: list });
    }
    // Non-super-admin: only see their own requests
    const all = await DeleteApproval.findAll();
    const own = all.filter((a) => a.requested_by === req.user.id);
    res.json({ approvals: own, requests: own });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Approve a delete request — super_admin only
 */
exports.approveDelete = async (req, res) => {
  try {
    const approval = await DeleteApproval.findById(req.params.id);
    if (!approval) return res.status(404).json({ error: "Approval not found" });
    if (approval.status !== "pending") return res.status(400).json({ error: "Already processed" });

    // Perform the actual deletion
    if (approval.target_type === "customer") {
      const c = await Customer.findById(approval.target_id);
      if (c) await Customer.delete(approval.target_id);
    } else if (approval.target_type === "user") {
      const u = await User.findById(approval.target_id);
      if (u && !isSuperAdmin(u)) await User.delete(approval.target_id);
    }

    await DeleteApproval.approve(approval.id, req.user.id);

    // Notify the requester that their request was approved
    try {
      await Notification.create({
        user_id: approval.requested_by,
        type:    "delete_approved",
        title:   `Delete approved: ${approval.target_type} "${approval.target_name}"`,
        message: `Your request to delete ${approval.target_type} "${approval.target_name}" has been approved by ${req.user.name || "Super Admin"}.`,
        link:    "/admin/dashboard?tab=approvals",
      });
    } catch (notifErr) {
      console.error("Failed to send approval notification:", notifErr.message);
    }

    res.json({ ok: true, message: `Approved: ${approval.target_name} deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Reject a delete request — super_admin only
 */
exports.rejectDelete = async (req, res) => {
  try {
    const approval = await DeleteApproval.findById(req.params.id);
    if (!approval) return res.status(404).json({ error: "Approval not found" });
    if (approval.status !== "pending") return res.status(400).json({ error: "Already processed" });

    await DeleteApproval.reject(approval.id, req.user.id);

    // Notify the requester that their request was rejected
    try {
      await Notification.create({
        user_id: approval.requested_by,
        type:    "delete_rejected",
        title:   `Delete rejected: ${approval.target_type} "${approval.target_name}"`,
        message: `Your request to delete ${approval.target_type} "${approval.target_name}" has been rejected by ${req.user.name || "Super Admin"}.`,
        link:    "/admin/dashboard?tab=approvals",
      });
    } catch (notifErr) {
      console.error("Failed to send rejection notification:", notifErr.message);
    }

    res.json({ ok: true, message: `Rejected: ${approval.target_name} NOT deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
