const db = require("../config/db");

const Customer = {
  async create({ name, email, phone, address, plan, notes, created_by }) {
    const [result] = await db.query(
      "INSERT INTO customers (name,email,phone,address,plan,notes,created_by) VALUES (?,?,?,?,?,?,?)",
      [name, email, phone, address || null, plan || null, notes || null, created_by || null]
    );
    return result.insertId;
  },
  async findByPhoneOrEmail(phone, email) {
    const [rows] = await db.query(
      "SELECT * FROM customers WHERE phone = ? OR email = ? ORDER BY created_at DESC",
      [phone || "", email || ""]
    );
    return rows;
  },
  async findById(id) {
    const [rows] = await db.query("SELECT * FROM customers WHERE id = ? LIMIT 1", [id]);
    return rows[0] || null;
  },
  async update(id, fields) {
    const allowed = ["name", "email", "phone", "address", "plan", "notes"];
    const keys = Object.keys(fields).filter((k) => allowed.includes(k));
    if (!keys.length) return;
    const set = keys.map((k) => `${k} = ?`).join(", ");
    const vals = keys.map((k) => fields[k]);
    await db.query(`UPDATE customers SET ${set} WHERE id = ?`, [...vals, id]);
  },
  async all(limit = 200) {
    const [rows] = await db.query("SELECT * FROM customers ORDER BY created_at DESC LIMIT ?", [limit]);
    return rows;
  },
};

module.exports = Customer;
