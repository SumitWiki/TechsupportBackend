const db     = require("../config/db");
const crypto = require("crypto");

/** Cryptographically secure case ID */
function generateCaseId() {
  const now  = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
  return `TS4-${date}-${rand}`;
}

const Case = {
  async create({ name, email, phone, subject, message, customer_id, source, priority }) {
    const caseId = generateCaseId();
    const [result] = await db.query(
      `INSERT INTO cases (case_id, name, email, phone, subject, message, customer_id, source, priority)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [caseId, name, email, phone, subject, message, customer_id || null, source || "contact_form", priority || "medium"]
    );
    return { id: result.insertId, caseId };
  },
  async findById(id) {
    const [rows] = await db.query(
      `SELECT c.*, u.name as agent_name FROM cases c
       LEFT JOIN users u ON u.id = c.assigned_to
       WHERE c.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },
  async findByCaseId(caseId) {
    const [rows] = await db.query(
      `SELECT c.*, u.name as agent_name FROM cases c
       LEFT JOIN users u ON u.id = c.assigned_to
       WHERE c.case_id = ? LIMIT 1`,
      [caseId]
    );
    return rows[0] || null;
  },
  async listAll({ status, search, page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    if (status) { conditions.push("c.status = ?"); params.push(status); }
    if (search) {
      conditions.push("(c.case_id LIKE ? OR c.email LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)");
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const [rows] = await db.query(
      `SELECT c.*, u.name as agent_name FROM cases c
       LEFT JOIN users u ON u.id = c.assigned_to
       ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM cases c ${where}`,
      params
    );
    return { rows, total };
  },
  async updateStatus(id, status) {
    const extra = status === "closed" ? ", closed_at = NOW()" : (status === "reopened" ? ", closed_at = NULL" : "");
    await db.query(`UPDATE cases SET status = ? ${extra} WHERE id = ?`, [status, id]);
  },
  async updatePriority(id, priority) {
    await db.query("UPDATE cases SET priority = ? WHERE id = ?", [priority, id]);
  },
  async assign(id, userId) {
    await db.query("UPDATE cases SET assigned_to = ?, status = 'in_progress' WHERE id = ?", [userId, id]);
  },
  async notes(caseId) {
    const [rows] = await db.query(
      `SELECT cn.*, u.name as author FROM case_notes cn
       JOIN users u ON u.id = cn.user_id
       WHERE cn.case_id = ? ORDER BY cn.created_at ASC`,
      [caseId]
    );
    return rows;
  },
  async addNote(caseId, userId, note) {
    await db.query(
      "INSERT INTO case_notes (case_id, user_id, note) VALUES (?,?,?)",
      [caseId, userId, note]
    );
  },
  async stats() {
    const [rows] = await db.query(
      `SELECT
         COUNT(*) as total,
         SUM(status='open')        as open,
         SUM(status='in_progress') as in_progress,
         SUM(status='closed')      as closed,
         SUM(status='reopened')    as reopened,
         SUM(priority='urgent')    as urgent,
         SUM(priority='high')      as high,
         SUM(priority='medium')    as medium,
         SUM(priority='low')       as low
       FROM cases`
    );
    return rows[0];
  },
  async delete(id) {
    await db.query("DELETE FROM cases WHERE id = ?", [id]);
  },
};

module.exports = Case;
