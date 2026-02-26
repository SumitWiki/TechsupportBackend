/**
 * Migration v4 — Security Upgrade
 *
 * 1. Create refresh_tokens table for token rotation
 * 2. Create security_logs table for monitoring suspicious activity
 *
 * Usage: node src/config/migrate-v4.js
 */

require("dotenv").config();
const db = require("./db");

async function migrate() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    /* ── 1. Refresh Tokens table ── */
    console.log("1. Creating refresh_tokens table …");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id     INT UNSIGNED NOT NULL,
        token_hash  VARCHAR(64)  NOT NULL COMMENT 'SHA-256 hash of token',
        family      VARCHAR(36)  NOT NULL COMMENT 'Token family for rotation detection',
        revoked     TINYINT(1)   NOT NULL DEFAULT 0,
        expires_at  DATETIME     NOT NULL,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token_hash (token_hash),
        INDEX idx_family (family),
        INDEX idx_user_expires (user_id, revoked, expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    /* ── 2. Security Logs table ── */
    console.log("2. Creating security_logs table …");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        event_type  VARCHAR(50)  NOT NULL COMMENT 'failed_login, token_reuse, brute_force, etc.',
        ip_address  VARCHAR(45)  NOT NULL,
        user_agent  TEXT         NULL,
        user_id     INT UNSIGNED NULL,
        email       VARCHAR(150) NULL,
        details     JSON         NULL,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_event_type (event_type),
        INDEX idx_ip (ip_address),
        INDEX idx_created (created_at),
        INDEX idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.commit();
    console.log("\n✅ Migration v4 (Security) complete!");
    console.log("   - refresh_tokens table created");
    console.log("   - security_logs table created");
  } catch (err) {
    await conn.rollback();
    console.error("❌ Migration v4 failed:", err.message);
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
