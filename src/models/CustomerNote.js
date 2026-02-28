const db = require("../config/db");

const CustomerNote = {
  async create({ customer_id, user_id, note }) {
    const [result] = await db.query(
      `INSERT INTO customer_notes (customer_id, user_id, note) VALUES (?, ?, ?)`,
      [customer_id, user_id, note]
    );
    return result.insertId;
  },

  async forCustomer(customer_id) {
    const [rows] = await db.query(
      `SELECT cn.*, u.name AS user_name, u.email AS user_email
       FROM customer_notes cn
       LEFT JOIN users u ON cn.user_id = u.id
       WHERE cn.customer_id = ?
       ORDER BY cn.created_at DESC`,
      [customer_id]
    );
    return rows;
  },

  async delete(id) {
    await db.query("DELETE FROM customer_notes WHERE id = ?", [id]);
  },
};

module.exports = CustomerNote;
