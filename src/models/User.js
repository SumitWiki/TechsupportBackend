const db = require("../config/db");

// Default permissions for backwards compatibility
const DEFAULT_PERMS = { read: true, write: false, modify: false, delete: false };

const User = {
  async findByEmail(email) {
    const [rows] = await db.query("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
    if (rows[0]) {
      rows[0].permissions = rows[0].permissions ? (typeof rows[0].permissions === 'string' ? JSON.parse(rows[0].permissions) : rows[0].permissions) : DEFAULT_PERMS;
    }
    return rows[0] || null;
  },
  async findById(id) {
    // Use SELECT * to handle both old (no permissions) and new schemas
    const [rows] = await db.query("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
    if (rows[0]) {
      rows[0].permissions = rows[0].permissions ? (typeof rows[0].permissions === 'string' ? JSON.parse(rows[0].permissions) : rows[0].permissions) : DEFAULT_PERMS;
    }
    return rows[0] || null;
  },
  async findAll() {
    const [rows] = await db.query("SELECT * FROM users ORDER BY created_at DESC");
    rows.forEach(r => {
      r.permissions = r.permissions ? (typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions) : DEFAULT_PERMS;
    });
    return rows;
  },
  async create({ name, email, password_hash, role, permissions, created_by }) {
    const perms = JSON.stringify(permissions || { read: true, write: false, modify: false, delete: false });
    const [result] = await db.query(
      "INSERT INTO users (name,email,password_hash,role,permissions,created_by) VALUES (?,?,?,?,?,?)",
      [name, email, password_hash, role || "agent", perms, created_by || null]
    );
    return result.insertId;
  },
  async update(id, fields) {
    const allowed = ["name", "email", "role", "is_active", "password_hash", "permissions"];
    const keys = Object.keys(fields).filter((k) => allowed.includes(k));
    if (!keys.length) return;
    const set = keys.map((k) => `${k} = ?`).join(", ");
    const vals = keys.map((k) => k === 'permissions' ? JSON.stringify(fields[k]) : fields[k]);
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
