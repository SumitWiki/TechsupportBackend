/**
 * Migration v8: Add created_by column to cases table for ticket ownership tracking.
 * Run: node src/config/migrate-v8.js
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

  console.log("⏳ Running v8 migration…\n");

  // 1. Add created_by column to cases
  try {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cases' AND COLUMN_NAME = 'created_by'`,
      [process.env.DB_NAME]
    );
    if (cols.length === 0) {
      await conn.query(
        `ALTER TABLE cases ADD COLUMN created_by INT UNSIGNED NULL AFTER assigned_to,
         ADD KEY idx_created_by (created_by),
         ADD FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`
      );
      console.log("✅ cases.created_by column added");
    } else {
      console.log("⏭️  cases.created_by already exists — skipped");
    }
  } catch (err) {
    console.error("❌ created_by column addition failed:", err.message);
  }

  await conn.end();
  console.log("\n✅ v8 migration complete!");
}

migrate();
