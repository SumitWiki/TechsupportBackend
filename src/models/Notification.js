const db = require("../config/db");

const Notification = {
  /**
   * Create a notification.
   * user_id = null means broadcast to all users.
   */
  async create({ user_id = null, type = "info", title, message = null, link = null }) {
    const [result] = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)`,
      [user_id, type, title, message, link]
    );
    return result.insertId;
  },

  /**
   * Broadcast a notification to multiple users.
   */
  async broadcast({ user_ids, type = "info", title, message = null, link = null }) {
    if (!user_ids || user_ids.length === 0) return;
    const values = user_ids.map((uid) => [uid, type, title, message, link]);
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, link) VALUES ?`,
      [values]
    );
  },

  /**
   * Get notifications for a user (includes broadcast where user_id IS NULL).
   */
  async forUser(userId, limit = 30) {
    const [rows] = await db.query(
      `SELECT * FROM notifications
       WHERE user_id = ? OR user_id IS NULL
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
    return rows;
  },

  /**
   * Count unread notifications for a user.
   */
  async countUnread(userId) {
    const [rows] = await db.query(
      `SELECT COUNT(*) as count FROM notifications
       WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0`,
      [userId]
    );
    return rows[0].count;
  },

  /**
   * Mark a single notification as read.
   */
  async markRead(id, userId) {
    await db.query(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)`,
      [id, userId]
    );
  },

  /**
   * Mark all notifications as read for a user.
   */
  async markAllRead(userId) {
    await db.query(
      `UPDATE notifications SET is_read = 1 WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0`,
      [userId]
    );
  },
};

module.exports = Notification;
