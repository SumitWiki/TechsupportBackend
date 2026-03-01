/**
 * Migration v7: Add last_sent_at column to otp_codes for resend-cooldown tracking.
 * Run: node src/config/migrate-v7.js
 * Safe to run multiple times.
 */
require("dotenv").config();
const mysql = require("mysql2/promise");

async function migrate() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log("⏳ Running v7 migration…\n");

  // 1. Add last_sent_at column to otp_codes
  try {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'otp_codes' AND COLUMN_NAME = 'last_sent_at'`,
      [process.env.DB_NAME]
    );
    if (cols.length === 0) {
      await conn.query(
        `ALTER TABLE otp_codes ADD COLUMN last_sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER used`
      );
      console.log("✅ otp_codes.last_sent_at column added");
    } else {
      console.log("⏭️  otp_codes.last_sent_at already exists — skipped");
    }
  } catch (err) {
    console.error("❌ last_sent_at column addition failed:", err.message);
  }

  await conn.end();
  console.log("\n✅ v7 migration complete!");
}

migrate();
