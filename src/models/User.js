const db = require("../config/db");

const User = {
  async findByEmail(email) {
    const [rows] = await db.query("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
    return rows[0] || null;
  },
  async findById(id) {
    const [rows] = await db.query("SELECT id,name,email,role,is_active,created_at FROM users WHERE id = ? LIMIT 1", [id]);
    return rows[0] || null;
  },
  async findAll() {
    const [rows] = await db.query("SELECT id,name,email,role,is_active,created_at FROM users ORDER BY created_at DESC");
    return rows;
  },
  async create({ name, email, password_hash, role, created_by }) {
    const [result] = await db.query(
      "INSERT INTO users (name,email,password_hash,role,created_by) VALUES (?,?,?,?,?)",
      [name, email, password_hash, role || "agent", created_by || null]
    );
    return result.insertId;
  },
  async update(id, fields) {
    const allowed = ["name", "email", "role", "is_active", "password_hash"];
    const keys = Object.keys(fields).filter((k) => allowed.includes(k));
    if (!keys.length) return;
    const set = keys.map((k) => `${k} = ?`).join(", ");
    const vals = keys.map((k) => fields[k]);
    await db.query(`UPDATE users SET ${set} WHERE id = ?`, [...vals, id]);
  },
  async saveOtpSecret(id, secret) {
    await db.query("UPDATE users SET otp_secret = ? WHERE id = ?", [secret, id]);
  },
  async delete(id) {
    await db.query("DELETE FROM otp_codes WHERE user_id = ?", [id]);
    await db.query("DELETE FROM login_logs WHERE user_id = ?", [id]);
    await db.query("UPDATE cases SET assigned_to = NULL WHERE assigned_to = ?", [id]);
    await db.query("DELETE FROM users WHERE id = ?", [id]);
  },
};

module.exports = User;
