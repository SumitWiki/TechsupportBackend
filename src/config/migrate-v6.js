/**
 * Migration v6: Extend login_logs ENUM to include 'logout' status.
 * Run: node src/config/migrate-v6.js
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

  console.log("⏳ Running v6 migration…\n");

  // 1. Extend login_logs.status ENUM to include 'logout'
  try {
    const [cols] = await conn.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'login_logs' AND COLUMN_NAME = 'status'`,
      [process.env.DB_NAME]
    );
    if (cols.length > 0 && !cols[0].COLUMN_TYPE.includes("logout")) {
      await conn.query(
        `ALTER TABLE login_logs MODIFY COLUMN status ENUM('success','failed','logout') NOT NULL DEFAULT 'success'`
      );
      console.log("✅ login_logs.status ENUM updated → added 'logout'");
    } else {
      console.log("⏭️  login_logs.status already has 'logout' — skipped");
    }
  } catch (err) {
    console.error("❌ ENUM update failed:", err.message);
  }

  await conn.end();
  console.log("\n✅ v6 migration complete!");
}

migrate();
