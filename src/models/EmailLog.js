const db = require("../config/db");

const EmailLog = {
  async create({ customer_id, sent_by, to_email, subject, body, status, error_msg }) {
    const [result] = await db.query(
      `INSERT INTO email_logs (customer_id, sent_by, to_email, subject, body, status, error_msg)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customer_id, sent_by, to_email, subject, body, status || "sent", error_msg || null]
    );
    return result.insertId;
  },

  async forCustomer(customer_id) {
    const [rows] = await db.query(
      `SELECT el.*, u.name AS sent_by_name, u.email AS sent_by_email
       FROM email_logs el
       LEFT JOIN users u ON el.sent_by = u.id
       WHERE el.customer_id = ?
       ORDER BY el.created_at DESC`,
      [customer_id]
    );
    return rows;
  },

  async all(limit = 200) {
    const [rows] = await db.query(
      `SELECT el.*, u.name AS sent_by_name, c.name AS customer_name
       FROM email_logs el
       LEFT JOIN users u ON el.sent_by = u.id
       LEFT JOIN customers c ON el.customer_id = c.id
       ORDER BY el.created_at DESC LIMIT ?`,
      [limit]
    );
    return rows;
  },
};

module.exports = EmailLog;
