const db = require("../config/db");

const CustomerModRequest = {
  /**
   * Create a new modification request
   */
  async create({ customer_id, requested_by, requested_changes, reason }) {
    const [result] = await db.query(
      `INSERT INTO customer_modification_requests (customer_id, requested_by, requested_changes, reason)
       VALUES (?,?,?,?)`,
      [customer_id, requested_by, JSON.stringify(requested_changes), reason || null]
    );
    return result.insertId;
  },

  /** Check if there's already a pending request for this customer by this user */
  async hasPending(customer_id, requested_by) {
    const [rows] = await db.query(
      `SELECT id FROM customer_modification_requests
       WHERE customer_id = ? AND requested_by = ? AND status = 'pending' LIMIT 1`,
      [customer_id, requested_by]
    );
    return rows.length > 0;
  },

  /** Find all pending requests */
  async findPending() {
    const [rows] = await db.query(
      `SELECT r.*, u.name AS requested_by_name, u.email AS requested_by_email,
              c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
       FROM customer_modification_requests r
       LEFT JOIN users u ON r.requested_by = u.id
       LEFT JOIN customers c ON r.customer_id = c.id
       WHERE r.status = 'pending'
       ORDER BY r.created_at DESC`
    );
    return rows;
  },

  /** Find all requests (for history) */
  async findAll(limit = 200) {
    const [rows] = await db.query(
      `SELECT r.*, u.name AS requested_by_name,
              rv.name AS reviewed_by_name,
              c.name AS customer_name
       FROM customer_modification_requests r
       LEFT JOIN users u ON r.requested_by = u.id
       LEFT JOIN users rv ON r.reviewed_by = rv.id
       LEFT JOIN customers c ON r.customer_id = c.id
       ORDER BY r.created_at DESC LIMIT ?`,
      [limit]
    );
    return rows;
  },

  /** Find by ID */
  async findById(id) {
    const [rows] = await db.query(
      `SELECT r.*, u.name AS requested_by_name, u.email AS requested_by_email,
              c.name AS customer_name
       FROM customer_modification_requests r
       LEFT JOIN users u ON r.requested_by = u.id
       LEFT JOIN customers c ON r.customer_id = c.id
       WHERE r.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  /** Find requests by a specific user */
  async findByUser(userId, limit = 100) {
    const [rows] = await db.query(
      `SELECT r.*, c.name AS customer_name,
              rv.name AS reviewed_by_name
       FROM customer_modification_requests r
       LEFT JOIN customers c ON r.customer_id = c.id
       LEFT JOIN users rv ON r.reviewed_by = rv.id
       WHERE r.requested_by = ?
       ORDER BY r.created_at DESC LIMIT ?`,
      [userId, limit]
    );
    return rows;
  },

  /** Approve request */
  async approve(id, reviewed_by, review_note) {
    await db.query(
      `UPDATE customer_modification_requests
       SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), review_note = ?
       WHERE id = ?`,
      [reviewed_by, review_note || null, id]
    );
  },

  /** Reject request */
  async reject(id, reviewed_by, review_note) {
    await db.query(
      `UPDATE customer_modification_requests
       SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_note = ?
       WHERE id = ?`,
      [reviewed_by, review_note || null, id]
    );
  },

  /** Count pending requests */
  async countPending() {
    const [[{ count }]] = await db.query(
      `SELECT COUNT(*) as count FROM customer_modification_requests WHERE status = 'pending'`
    );
    return count;
  },
};

module.exports = CustomerModRequest;
