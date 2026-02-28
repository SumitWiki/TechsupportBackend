const db = require("../config/db");

const DeleteApproval = {
  async create({ requested_by, target_type, target_id, target_name, reason }) {
    const [result] = await db.query(
      `INSERT INTO delete_approvals (requested_by, target_type, target_id, target_name, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [requested_by, target_type, target_id, target_name, reason || null]
    );
    return result.insertId;
  },

  async findPending() {
    const [rows] = await db.query(
      `SELECT da.*, u.name AS requested_by_name, u.email AS requested_by_email
       FROM delete_approvals da
       LEFT JOIN users u ON da.requested_by = u.id
       WHERE da.status = 'pending'
       ORDER BY da.created_at DESC`
    );
    return rows;
  },

  async findAll(limit = 100) {
    const [rows] = await db.query(
      `SELECT da.*, u.name AS requested_by_name, r.name AS reviewed_by_name
       FROM delete_approvals da
       LEFT JOIN users u ON da.requested_by = u.id
       LEFT JOIN users r ON da.reviewed_by = r.id
       ORDER BY da.created_at DESC LIMIT ?`,
      [limit]
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await db.query(
      `SELECT da.*, u.name AS requested_by_name
       FROM delete_approvals da
       LEFT JOIN users u ON da.requested_by = u.id
       WHERE da.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async approve(id, reviewed_by) {
    await db.query(
      `UPDATE delete_approvals SET status = 'approved', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
      [reviewed_by, id]
    );
  },

  async reject(id, reviewed_by) {
    await db.query(
      `UPDATE delete_approvals SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
      [reviewed_by, id]
    );
  },

  async hasPending(target_type, target_id) {
    const [rows] = await db.query(
      `SELECT id FROM delete_approvals WHERE target_type = ? AND target_id = ? AND status = 'pending' LIMIT 1`,
      [target_type, target_id]
    );
    return rows.length > 0;
  },
};

module.exports = DeleteApproval;
