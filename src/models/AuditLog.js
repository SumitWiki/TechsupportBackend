const db = require("../config/db");

const AuditLog = {
  /**
   * Record a status-change audit entry
   * @param {number} caseId   - cases.id (internal PK)
   * @param {number} userId   - who performed the action
   * @param {string} action   - e.g. "status_change", "assigned", "note_added"
   * @param {string|null} oldStatus
   * @param {string} newStatus
   * @param {string|null} note - optional description
   */
  async record({ caseId, userId, action, oldStatus, newStatus, note }) {
    await db.query(
      `INSERT INTO audit_logs (case_id, user_id, action, old_status, new_status, note)
       VALUES (?,?,?,?,?,?)`,
      [caseId, userId, action, oldStatus || null, newStatus, note || null]
    );
  },

  /** Get all audit entries for a case, ordered newest first */
  async forCase(caseId) {
    const [rows] = await db.query(
      `SELECT a.*, u.name as user_name, u.email as user_email
       FROM audit_logs a
       JOIN users u ON u.id = a.user_id
       WHERE a.case_id = ?
       ORDER BY a.created_at DESC`,
      [caseId]
    );
    return rows;
  },

  /** Get recent audit entries across all cases (for admin view) */
  async recent(limit = 100) {
    const [rows] = await db.query(
      `SELECT a.*, u.name as user_name, c.case_id as ticket_id
       FROM audit_logs a
       JOIN users u ON u.id = a.user_id
       JOIN cases c ON c.id = a.case_id
       ORDER BY a.created_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  },
};

module.exports = AuditLog;
