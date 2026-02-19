const db = require("../config/db");

const LoginLog = {
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
  async forUser(userId, limit = 20) {
    const [rows] = await db.query(
      "SELECT * FROM login_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT ?",
      [userId, limit]
    );
    return rows;
  },
  async all(limit = 100) {
    const [rows] = await db.query(
      `SELECT ll.*, u.name, u.email FROM login_logs ll
       JOIN users u ON u.id = ll.user_id
       ORDER BY ll.logged_at DESC LIMIT ?`,
      [limit]
    );
    return rows;
  },
};

module.exports = LoginLog;
