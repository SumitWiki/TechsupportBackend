const db = require("../config/db");

const Customer = {
  async create({ name, email, phone, address, plan, notes, amount, paid_amount, offer, created_by }) {
    const [result] = await db.query(
      `INSERT INTO customers (name,email,phone,address,plan,notes,amount,paid_amount,offer,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [name, email || "", phone, address || null, plan || null, notes || null,
       amount || null, paid_amount || null, offer || null, created_by || null]
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
    const allowed = ["name", "email", "phone", "address", "plan", "notes", "amount", "paid_amount", "offer"];
    const keys = Object.keys(fields).filter((k) => allowed.includes(k));
    if (!keys.length) return;
    const set = keys.map((k) => `${k} = ?`).join(", ");
    const vals = keys.map((k) => fields[k]);
    await db.query(`UPDATE customers SET ${set} WHERE id = ?`, [...vals, id]);
  },
  async delete(id) {
    // Remove customer_id references from cases first
    await db.query("UPDATE cases SET customer_id = NULL WHERE customer_id = ?", [id]);
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
};

module.exports = Customer;
