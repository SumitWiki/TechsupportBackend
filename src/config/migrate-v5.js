/**
 * Migration v5 — Email logs, customer notes, delete approvals
 *
 * New tables:
 *   1. email_logs        — track every email sent to customers
 *   2. customer_notes    — internal notes on customers
 *   3. delete_approvals  — approval workflow for delete requests
 *
 * Run: node src/config/migrate-v5.js
 */
require("dotenv").config();
const mysql = require("mysql2/promise");

async function migrate() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log("🔄 Starting migration v5...\n");

  // 1. email_logs
  console.log("1. Creating email_logs table...");
  await conn.query(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      customer_id  INT UNSIGNED NOT NULL,
      sent_by      INT UNSIGNED NOT NULL,
      to_email     VARCHAR(150) NOT NULL,
      subject      VARCHAR(255) NOT NULL,
      body         TEXT         NOT NULL,
      status       ENUM('sent','failed') NOT NULL DEFAULT 'sent',
      error_msg    TEXT         NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE CASCADE,
      KEY idx_customer (customer_id),
      KEY idx_sent_by  (sent_by),
      KEY idx_created  (created_at)
    ) ENGINE=InnoDB
  `);
  console.log("   ✅ email_logs created\n");

  // 2. customer_notes
  console.log("2. Creating customer_notes table...");
  await conn.query(`
    CREATE TABLE IF NOT EXISTS customer_notes (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      customer_id  INT UNSIGNED NOT NULL,
      user_id      INT UNSIGNED NOT NULL,
      note         TEXT         NOT NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      KEY idx_customer (customer_id)
    ) ENGINE=InnoDB
  `);
  console.log("   ✅ customer_notes created\n");

  // 3. delete_approvals
  console.log("3. Creating delete_approvals table...");
  await conn.query(`
    CREATE TABLE IF NOT EXISTS delete_approvals (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      requested_by    INT UNSIGNED NOT NULL,
      target_type     ENUM('customer','user') NOT NULL,
      target_id       INT UNSIGNED NOT NULL,
      target_name     VARCHAR(200) NOT NULL,
      reason          TEXT         NULL,
      status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      reviewed_by     INT UNSIGNED NULL,
      reviewed_at     DATETIME     NULL,
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by)  REFERENCES users(id) ON DELETE SET NULL,
      KEY idx_status   (status),
      KEY idx_req_by   (requested_by)
    ) ENGINE=InnoDB
  `);
  console.log("   ✅ delete_approvals created\n");

  console.log("✅ Migration v5 complete!");
  await conn.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
