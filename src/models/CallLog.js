const db = require("../config/db");

const CallLog = {
  /**
   * Create a new call log entry
   */
  async create({ call_sid, from_number, to_number, direction, call_status, answered_by, customer_id, case_id }) {
    const [result] = await db.query(
      `INSERT INTO call_logs (call_sid, from_number, to_number, direction, call_status, answered_by, customer_id, case_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [call_sid, from_number, to_number, direction || "inbound", call_status || "ringing", answered_by || null, customer_id || null, case_id || null]
    );
    return result.insertId;
  },

  /**
   * Find by Twilio Call SID
   */
  async findByCallSid(callSid) {
    const [rows] = await db.query(
      `SELECT cl.*, u.name as agent_name, cu.name as customer_name
       FROM call_logs cl
       LEFT JOIN users u ON u.id = cl.answered_by
       LEFT JOIN customers cu ON cu.id = cl.customer_id
       WHERE cl.call_sid = ? LIMIT 1`,
      [callSid]
    );
    return rows[0] || null;
  },

  /**
   * Find by ID
   */
  async findById(id) {
    const [rows] = await db.query(
      `SELECT cl.*, u.name as agent_name, cu.name as customer_name
       FROM call_logs cl
       LEFT JOIN users u ON u.id = cl.answered_by
       LEFT JOIN customers cu ON cu.id = cl.customer_id
       WHERE cl.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * Update call status, duration, recording etc. by Call SID
   */
  async updateByCallSid(callSid, fields) {
    const allowed = [
      "call_status", "call_duration", "recording_url", "recording_sid",
      "answered_by", "customer_id", "case_id", "notes", "ended_at",
    ];
    const keys = Object.keys(fields).filter((k) => allowed.includes(k));
    if (!keys.length) return;
    const set = keys.map((k) => `${k} = ?`).join(", ");
    const vals = keys.map((k) => fields[k]);
    await db.query(`UPDATE call_logs SET ${set} WHERE call_sid = ?`, [...vals, callSid]);
  },

  /**
   * List call logs with pagination, search, filter
   */
  async listAll({ search, status, direction, page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push("cl.call_status = ?");
      params.push(status);
    }
    if (direction) {
      conditions.push("cl.direction = ?");
      params.push(direction);
    }
    if (search) {
      conditions.push("(cl.from_number LIKE ? OR cl.to_number LIKE ? OR cl.call_sid LIKE ? OR cu.name LIKE ?)");
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const [rows] = await db.query(
      `SELECT cl.*, u.name as agent_name, cu.name as customer_name
       FROM call_logs cl
       LEFT JOIN users u ON u.id = cl.answered_by
       LEFT JOIN customers cu ON cu.id = cl.customer_id
       ${where}
       ORDER BY cl.started_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total
       FROM call_logs cl
       LEFT JOIN customers cu ON cu.id = cl.customer_id
       ${where}`,
      params
    );

    return { rows, total };
  },

  /**
   * Get call stats
   */
  async stats() {
    const [rows] = await db.query(`
      SELECT
        COUNT(*)                              as total,
        SUM(direction = 'inbound')            as inbound,
        SUM(direction = 'outbound')           as outbound,
        SUM(call_status = 'completed')        as completed,
        SUM(call_status = 'no-answer')        as missed,
        SUM(call_status = 'busy')             as busy,
        SUM(call_status = 'ringing')          as active,
        SUM(call_status = 'in-progress')      as in_progress,
        COALESCE(AVG(NULLIF(call_duration,0)),0) as avg_duration,
        COALESCE(SUM(call_duration),0)        as total_duration
      FROM call_logs
    `);
    return rows[0];
  },

  /**
   * Find customer by phone number
   */
  async findCustomerByPhone(phone) {
    // Normalize: strip everything except digits and +
    const normalized = phone.replace(/[^\d+]/g, "");
    const [rows] = await db.query(
      `SELECT * FROM customers
       WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', '') LIKE ?
       OR phone = ?
       ORDER BY created_at DESC LIMIT 1`,
      [`%${normalized.slice(-10)}%`, phone]
    );
    return rows[0] || null;
  },
};

module.exports = CallLog;
