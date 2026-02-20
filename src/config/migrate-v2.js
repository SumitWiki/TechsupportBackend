/**
 * Migration: Add permissions, audit_logs, update source ENUM
 * Run: node src/config/migrate-v2.js
 *
 * Safe to run multiple times — uses IF NOT EXISTS / IF NOT EXISTS column checks.
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

  console.log("⏳ Running v2 migration…\n");

  // 1. Add permissions column to users (if not exists)
  try {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'permissions'`,
      [process.env.DB_NAME]
    );
    if (cols.length === 0) {
      await conn.query(
        `ALTER TABLE users ADD COLUMN permissions JSON NOT NULL
         DEFAULT (JSON_OBJECT('read',true,'write',false,'modify',false,'delete',false))
         AFTER role`
      );
      console.log("✅ Added 'permissions' column to users table");
      // Set admin users to full permissions
      await conn.query(
        `UPDATE users SET permissions = JSON_OBJECT('read',true,'write',true,'modify',true,'delete',true)
         WHERE role = 'admin'`
      );
      console.log("   → Admin users set to full permissions");
    } else {
      console.log("⏭  'permissions' column already exists");
    }
  } catch (err) {
    console.error("❌ permissions column:", err.message);
  }

  // 2. Update source ENUM to include 'crm_manual'
  try {
    await conn.query(
      `ALTER TABLE cases MODIFY COLUMN source ENUM('contact_form','manual','crm_manual') NOT NULL DEFAULT 'contact_form'`
    );
    console.log("✅ Updated 'source' ENUM on cases table");
  } catch (err) {
    console.error("❌ source ENUM:", err.message);
  }

  // 3. Create audit_logs table
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        case_id     INT UNSIGNED NOT NULL,
        user_id     INT UNSIGNED NOT NULL,
        action      VARCHAR(50)  NOT NULL,
        old_status  VARCHAR(30)  NULL,
        new_status  VARCHAR(30)  NOT NULL,
        note        TEXT         NULL,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (case_id) REFERENCES cases(id)  ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE,
        KEY idx_audit_case (case_id),
        KEY idx_audit_time (created_at)
      ) ENGINE=InnoDB
    `);
    console.log("✅ Created 'audit_logs' table (if not existed)");
  } catch (err) {
    console.error("❌ audit_logs table:", err.message);
  }

  console.log("\n🎉 Migration complete!");
  await conn.end();
}

migrate().catch(console.error);
