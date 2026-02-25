/**
 * Migration: Add call_logs table for Twilio Voice integration
 * Run: node src/config/migrate-twilio.js
 *
 * Safe to run multiple times — uses IF NOT EXISTS.
 */
require("dotenv").config();
const mysql = require("mysql2/promise");

async function migrate() {
  if (!process.env.DB_HOST || !process.env.DB_USER) {
    console.error("❌ DB_HOST and DB_USER must be set in .env");
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log("⏳ Running Twilio migration…\n");

  // 1. Create call_logs table
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS call_logs (
        id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        call_sid       VARCHAR(64)  NOT NULL UNIQUE,
        from_number    VARCHAR(30)  NOT NULL,
        to_number      VARCHAR(30)  NOT NULL,
        direction      ENUM('inbound','outbound') NOT NULL DEFAULT 'inbound',
        call_status    VARCHAR(30)  NOT NULL DEFAULT 'ringing',
        call_duration  INT UNSIGNED NOT NULL DEFAULT 0,
        recording_url  TEXT         NULL,
        recording_sid  VARCHAR(64)  NULL,
        answered_by    INT UNSIGNED NULL,
        customer_id    INT UNSIGNED NULL,
        case_id        INT UNSIGNED NULL,
        notes          TEXT         NULL,
        started_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at       DATETIME     NULL,
        created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (answered_by) REFERENCES users(id)     ON DELETE SET NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (case_id)     REFERENCES cases(id)     ON DELETE SET NULL,
        KEY idx_call_sid    (call_sid),
        KEY idx_from        (from_number),
        KEY idx_status      (call_status),
        KEY idx_answered_by (answered_by),
        KEY idx_started     (started_at)
      ) ENGINE=InnoDB
    `);
    console.log("✅ Created 'call_logs' table");
  } catch (err) {
    if (err.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("⏭  'call_logs' table already exists");
    } else {
      console.error("❌ call_logs table:", err.message);
    }
  }

  console.log("\n🎉 Twilio migration complete!");
  await conn.end();
}

migrate().catch(console.error);
