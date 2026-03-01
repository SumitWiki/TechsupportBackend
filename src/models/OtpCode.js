const db = require("../config/db");
const crypto = require("crypto");

// Max OTP attempts per user before lockout
const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_MINUTES  = 30;
const RESEND_COOLDOWN_SECONDS = 60;

const OtpCode = {
  /**
   * Find an active (unused + not expired) OTP for the given user.
   * Returns the row or null.
   */
  async findActive(userId) {
    const [rows] = await db.query(
      "SELECT * FROM otp_codes WHERE user_id = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
      [userId]
    );
    return rows[0] || null;
  },

  /**
   * Create a brand-new OTP. Invalidates any previous unused OTPs first.
   */
  async create(userId, otp, expiresAt) {
    // Invalidate old OTPs for this user
    await db.query("UPDATE otp_codes SET used = 1 WHERE user_id = ? AND used = 0", [userId]);
    // Reset attempt counter
    await db.query("DELETE FROM otp_attempts WHERE user_id = ?", [userId]);
    const [result] = await db.query(
      "INSERT INTO otp_codes (user_id, otp, expires_at, last_sent_at) VALUES (?, ?, ?, NOW())",
      [userId, otp, expiresAt]
    );
    return result.insertId;
  },

  /**
   * Update the last_sent_at timestamp (used when resending the same OTP).
   */
  async updateLastSent(otpId) {
    await db.query("UPDATE otp_codes SET last_sent_at = NOW() WHERE id = ?", [otpId]);
  },

  /**
   * Check if the resend cooldown (60s) has elapsed for the given OTP row.
   * Returns { canResend: boolean, waitSeconds: number }.
   */
  checkResendCooldown(otpRow) {
    if (!otpRow || !otpRow.last_sent_at) return { canResend: true, waitSeconds: 0 };
    const lastSent = new Date(otpRow.last_sent_at).getTime();
    const elapsed  = (Date.now() - lastSent) / 1000;
    if (elapsed >= RESEND_COOLDOWN_SECONDS) return { canResend: true, waitSeconds: 0 };
    return { canResend: false, waitSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed) };
  },

  async verify(userId, otp) {
    // Check brute-force attempts
    const [attempts] = await db.query(
      "SELECT COUNT(*) as cnt FROM otp_attempts WHERE user_id = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)",
      [userId, LOCKOUT_MINUTES]
    );
    if (attempts[0].cnt >= MAX_OTP_ATTEMPTS) {
      return false; // locked out
    }

    const [rows] = await db.query(
      "SELECT * FROM otp_codes WHERE user_id = ? AND otp = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
      [userId, otp]
    );
    if (!rows[0]) {
      // Record failed attempt
      await db.query("INSERT INTO otp_attempts (user_id) VALUES (?)", [userId]);
      return false;
    }

    // OTP is valid — mark used and clear attempts
    await db.query("UPDATE otp_codes SET used = 1 WHERE id = ?", [rows[0].id]);
    await db.query("DELETE FROM otp_attempts WHERE user_id = ?", [userId]);
    return true;
  },
};

module.exports = OtpCode;
