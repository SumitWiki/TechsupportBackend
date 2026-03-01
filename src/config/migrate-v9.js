/**
 * Migration v9 — Customer validity, edit audit logs & modification requests
 *
 * Changes:
 *   1. Add validity_months, expiry_date to customers table
 *   2. Create customer_edit_logs table (full audit trail)
 *   3. Create customer_modification_requests table (edit workflow for users)
 *
 * Run: node src/config/migrate-v9.js
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

  console.log("⏳ Running v9 migration…\n");

  // 1. Add validity_months and expiry_date to customers
  console.log("1. Adding validity_months and expiry_date to customers…");
  const columnsToAdd = [
    { name: "validity_months", def: "INT UNSIGNED NULL DEFAULT NULL COMMENT 'Service validity in months'" },
    { name: "expiry_date",     def: "DATE NULL DEFAULT NULL COMMENT 'Auto-calculated from validity_months'" },
  ];
  for (const col of columnsToAdd) {
    try {
      await conn.query(`ALTER TABLE customers ADD COLUMN ${col.name} ${col.def}`);
      console.log(`   ✅ Added ${col.name}`);
    } catch (err) {
      if (err.code === "ER_DUP_FIELDNAME") {
        console.log(`   ⏭️  ${col.name} already exists — skipped`);
      } else {
        console.error(`   ❌ ${col.name}: ${err.message}`);
      }
    }
  }

  // 2. Create customer_edit_logs table
  console.log("\n2. Creating customer_edit_logs table…");
  await conn.query(`
    CREATE TABLE IF NOT EXISTS customer_edit_logs (
      id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      customer_id   INT UNSIGNED NOT NULL,
      edited_by     INT UNSIGNED NOT NULL,
      action        VARCHAR(50)  NOT NULL DEFAULT 'update' COMMENT 'create, update, delete, modification_approved, modification_rejected',
      field_name    VARCHAR(100) NULL COMMENT 'Which field was changed',
      old_value     TEXT         NULL,
      new_value     TEXT         NULL,
      note          TEXT         NULL,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (edited_by)   REFERENCES users(id)     ON DELETE CASCADE,
      KEY idx_customer (customer_id),
      KEY idx_edited_by (edited_by),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB
  `);
  console.log("   ✅ customer_edit_logs created");

  // 3. Create customer_modification_requests table
  console.log("\n3. Creating customer_modification_requests table…");
  await conn.query(`
    CREATE TABLE IF NOT EXISTS customer_modification_requests (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      customer_id     INT UNSIGNED NOT NULL,
      requested_by    INT UNSIGNED NOT NULL COMMENT 'User who requested the modification',
      status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      requested_changes JSON NOT NULL COMMENT 'JSON object of field->new_value pairs',
      reason          TEXT         NULL COMMENT 'Reason for modification',
      reviewed_by     INT UNSIGNED NULL COMMENT 'Super admin who approved/rejected',
      reviewed_at     DATETIME     NULL,
      review_note     TEXT         NULL,
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id)  REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (requested_by) REFERENCES users(id)     ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by)  REFERENCES users(id)     ON DELETE SET NULL,
      KEY idx_customer (customer_id),
      KEY idx_status   (status),
      KEY idx_requested_by (requested_by),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB
  `);
  console.log("   ✅ customer_modification_requests created");

  await conn.end();
  console.log("\n✅ v9 migration complete!");
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
