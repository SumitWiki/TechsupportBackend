const db = require("../config/db");

const CustomerEditLog = {
  /**
   * Record a customer edit audit entry
   * @param {number} customer_id
   * @param {number} edited_by   - user who performed the edit
   * @param {string} action      - 'create', 'update', 'delete', 'modification_approved', 'modification_rejected'
   * @param {string|null} field_name - which field changed (null for whole-record actions)
   * @param {string|null} old_value
   * @param {string|null} new_value
   * @param {string|null} note
   */
  async record({ customer_id, edited_by, action, field_name, old_value, new_value, note }) {
    await db.query(
      `INSERT INTO customer_edit_logs (customer_id, edited_by, action, field_name, old_value, new_value, note)
       VALUES (?,?,?,?,?,?,?)`,
      [customer_id, edited_by, action || "update", field_name || null,
       old_value != null ? String(old_value) : null,
       new_value != null ? String(new_value) : null,
       note || null]
    );
  },

  /**
   * Record multiple field changes in one batch
   */
  async recordMany(customer_id, edited_by, action, changes, note) {
    if (!changes || !changes.length) return;
    const values = changes.map(c => [
      customer_id, edited_by, action || "update",
      c.field || null,
      c.oldVal != null ? String(c.oldVal) : null,
      c.newVal != null ? String(c.newVal) : null,
      note || null,
    ]);
    const placeholders = values.map(() => "(?,?,?,?,?,?,?)").join(",");
    const flat = values.flat();
    await db.query(
      `INSERT INTO customer_edit_logs (customer_id, edited_by, action, field_name, old_value, new_value, note)
       VALUES ${placeholders}`,
      flat
    );
  },

  /** Get all audit entries for a customer */
  async forCustomer(customerId, limit = 200) {
    const [rows] = await db.query(
      `SELECT l.*, u.name AS editor_name, u.email AS editor_email
       FROM customer_edit_logs l
       LEFT JOIN users u ON u.id = l.edited_by
       WHERE l.customer_id = ?
       ORDER BY l.created_at DESC LIMIT ?`,
      [customerId, limit]
    );
    return rows;
  },

  /** Get recent edit logs across all customers */
  async recent(limit = 100) {
    const [rows] = await db.query(
      `SELECT l.*, u.name AS editor_name, c.name AS customer_name
       FROM customer_edit_logs l
       LEFT JOIN users u ON u.id = l.edited_by
       LEFT JOIN customers c ON c.id = l.customer_id
       ORDER BY l.created_at DESC LIMIT ?`,
      [limit]
    );
    return rows;
  },
};

module.exports = CustomerEditLog;
