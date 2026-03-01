const db = require("../config/db");

const Customer = {
  /** Calculate expiry date from a base date + validity months */
  _calcExpiry(baseDate, months) {
    if (!months || months <= 0) return null;
    const d = new Date(baseDate);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  },

  async create({ name, email, phone, address, plan, notes, amount, paid_amount, offer, validity_months, created_by }) {
    const expiry_date = this._calcExpiry(new Date(), validity_months);
    const [result] = await db.query(
      `INSERT INTO customers (name,email,phone,address,plan,notes,amount,paid_amount,offer,validity_months,expiry_date,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name, email || "", phone, address || null, plan || null, notes || null,
       amount || null, paid_amount || null, offer || null,
       validity_months || null, expiry_date, created_by || null]
    );
    return result.insertId;
  },
  async findByPhoneOrEmail(phone, email) {
    const [rows] = await db.query(
      `SELECT c.*, u.name AS added_by_name, u.email AS added_by_email
       FROM customers c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.phone = ? OR c.email = ?
       ORDER BY c.created_at DESC`,
      [phone || "", email || ""]
    );
    return rows;
  },
  async findById(id) {
    const [rows] = await db.query(
      `SELECT c.*, u.name AS added_by_name, u.email AS added_by_email
       FROM customers c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },
  async update(id, fields) {
    const allowed = ["name", "email", "phone", "address", "plan", "notes", "amount", "paid_amount", "offer", "validity_months", "expiry_date"];
    // Auto-calculate expiry_date when validity_months changes
    if (fields.validity_months !== undefined) {
      const months = parseInt(fields.validity_months);
      if (months && months > 0) {
        fields.expiry_date = this._calcExpiry(new Date(), months);
      } else {
        fields.validity_months = null;
        fields.expiry_date = null;
      }
    }
    const keys = Object.keys(fields).filter((k) => allowed.includes(k));
    if (!keys.length) return;
    const set = keys.map((k) => `${k} = ?`).join(", ");
    const vals = keys.map((k) => fields[k]);
    await db.query(`UPDATE customers SET ${set} WHERE id = ?`, [...vals, id]);
  },
  async delete(id) {
    // Clean up all references before deleting
    // Tables with ON DELETE CASCADE (email_logs, customer_notes) are auto-handled.
    // Tables with ON DELETE SET NULL (cases.customer_id, call_logs.customer_id) are auto-handled.

    // Clean pending delete_approvals targeting this customer
    try { await db.query("DELETE FROM delete_approvals WHERE target_type = 'customer' AND target_id = ?", [id]); } catch (_) {}

    // Now delete — CASCADE/SET NULL handles the rest
    await db.query("DELETE FROM customers WHERE id = ?", [id]);
  },
  async all(limit = 500) {
    const [rows] = await db.query(
      `SELECT c.*, u.name AS added_by_name, u.email AS added_by_email
       FROM customers c
       LEFT JOIN users u ON c.created_by = u.id
       ORDER BY c.created_at DESC LIMIT ?`,
      [limit]
    );
    return rows;
  },
  async byCreator(userId, limit = 500) {
    const [rows] = await db.query(
      `SELECT c.*, u.name AS added_by_name, u.email AS added_by_email
       FROM customers c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.created_by = ?
       ORDER BY c.created_at DESC LIMIT ?`,
      [userId, limit]
    );
    return rows;
  },
};

module.exports = Customer;
