/**
 * RefreshToken Model — DB-backed refresh token management
 *
 * Implements refresh token rotation:
 *   - Each refresh token is single-use
 *   - Using an old (rotated) token invalidates the entire family
 *   - Tokens expire after configurable time (default 7 days)
 */

const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

/**
 * Hash a token for secure storage (never store plaintext)
 */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const RefreshToken = {
  /**
   * Create a new refresh token for a user
   * Returns the plaintext token (only shown once — stored hashed)
   */
  async create(userId, family = null) {
    const token = uuidv4();
    const tokenHash = hashToken(token);
    const tokenFamily = family || uuidv4();
    const expiresAt = new Date(
      Date.now() + (parseInt(process.env.REFRESH_TOKEN_DAYS) || 7) * 24 * 60 * 60 * 1000
    );

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family, expires_at) VALUES (?, ?, ?, ?)`,
      [userId, tokenHash, tokenFamily, expiresAt]
    );

    return { token, family: tokenFamily };
  },

  /**
   * Find a valid (non-revoked, non-expired) token
   * Returns the DB row or null
   */
  async findValid(token) {
    const tokenHash = hashToken(token);
    const [rows] = await db.query(
      `SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > NOW() LIMIT 1`,
      [tokenHash]
    );
    return rows[0] || null;
  },

  /**
   * Rotate: revoke current token and issue a new one in same family
   * Returns { token, family, userId } or null
   */
  async rotate(oldToken) {
    const record = await this.findValid(oldToken);
    if (!record) return null;

    // Revoke the used token
    await db.query(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`, [record.id]);

    // Issue new token in same family
    const newToken = await this.create(record.user_id, record.family);
    return { ...newToken, userId: record.user_id };
  },

  /**
   * Revoke entire family — called when reuse of old token is detected (theft)
   */
  async revokeFamily(family) {
    await db.query(`UPDATE refresh_tokens SET revoked = 1 WHERE family = ?`, [family]);
  },

  /**
   * Revoke all tokens for a user (force logout everywhere)
   */
  async revokeAllForUser(userId) {
    await db.query(`UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`, [userId]);
  },

  /**
   * Cleanup expired tokens (run periodically)
   */
  async cleanup() {
    const [result] = await db.query(`DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = 1`);
    return result.affectedRows;
  },
};

module.exports = RefreshToken;
