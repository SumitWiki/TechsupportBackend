const db = require("../config/db");

const LoginLog = {
  /** Record a login/logout/failed-login event */
  async record({ userId, ip, userAgent, geo, status }) {
    await db.query(
      "INSERT INTO login_logs (user_id, ip_address, user_agent, country, region, city, status) VALUES (?,?,?,?,?,?,?)",
      [
        userId,
        ip,
        userAgent || null,
        geo?.country || null,
        geo?.region  || null,
        geo?.city    || null,
        status || "success",
      ]
    );
  },

  /** Get logs for a specific user */
  async forUser(userId, limit = 200) {
    const [rows] = await db.query(
      "SELECT * FROM login_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT ?",
      [userId, limit]
    );
    return rows;
  },

  /** Get all logs joined with user info */
  async all(limit = 500) {
    const [rows] = await db.query(
      `SELECT ll.*, u.name, u.email, u.role FROM login_logs ll
       JOIN users u ON u.id = ll.user_id
       ORDER BY ll.logged_at DESC LIMIT ?`,
      [limit]
    );
    return rows;
  },

  /** Get a summary of all users with their login stats (for Logs menu) */
  async userSummary() {
    const [rows] = await db.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.role,
         u.is_active,
         COUNT(ll.id) AS total_events,
         SUM(CASE WHEN ll.status = 'success' THEN 1 ELSE 0 END) AS total_logins,
         SUM(CASE WHEN ll.status = 'failed'  THEN 1 ELSE 0 END) AS total_failed,
         SUM(CASE WHEN ll.status = 'logout'  THEN 1 ELSE 0 END) AS total_logouts,
         MAX(CASE WHEN ll.status = 'success' THEN ll.logged_at END) AS last_login,
         MAX(CASE WHEN ll.status = 'logout'  THEN ll.logged_at END) AS last_logout,
         MAX(ll.ip_address) AS last_ip
       FROM users u
       LEFT JOIN login_logs ll ON ll.user_id = u.id
       GROUP BY u.id
       ORDER BY last_login DESC`
    );
    return rows;
  },
};

module.exports = LoginLog;
