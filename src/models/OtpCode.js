const db = require("../config/db");

const OtpCode = {
  async create(userId, otp, expiresAt) {
    // Invalidate old OTPs for this user
    await db.query("UPDATE otp_codes SET used = 1 WHERE user_id = ? AND used = 0", [userId]);
    const [result] = await db.query(
      "INSERT INTO otp_codes (user_id, otp, expires_at) VALUES (?, ?, ?)",
      [userId, otp, expiresAt]
    );
    return result.insertId;
  },
  async verify(userId, otp) {
    const [rows] = await db.query(
      "SELECT * FROM otp_codes WHERE user_id = ? AND otp = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
      [userId, otp]
    );
    if (!rows[0]) return false;
    await db.query("UPDATE otp_codes SET used = 1 WHERE id = ?", [rows[0].id]);
    return true;
  },
};

module.exports = OtpCode;
