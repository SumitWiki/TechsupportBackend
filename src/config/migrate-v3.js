/**
 * Migration v3 – Add 4-role system + notifications table
 *
 * Roles: super_admin, admin, super_user, simple_user
 * Maps old 'agent' → 'super_user'
 *
 * Usage:  node src/config/migrate-v3.js
 */

require("dotenv").config();
const db = require("./db");

async function migrate() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    /* ── 1. Expand role ENUM ── */
    console.log("1. Altering users.role ENUM …");
    await conn.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('super_admin','admin','super_user','simple_user')
      NOT NULL DEFAULT 'simple_user'
    `);

    /* ── 2. Convert old 'agent' rows to 'super_user' ── */
    console.log("2. Migrating agent → super_user …");
    const [result] = await conn.query(`
      UPDATE users SET role = 'super_user' WHERE role = 'agent'
    `);
    console.log(`   ${result.affectedRows} row(s) updated.`);

    /* ── 3. Promote the super-admin email if it's currently 'admin' ── */
    const superEmail = process.env.SUPER_ADMIN_EMAIL || "support@techsupport4.com";
    console.log(`3. Promoting ${superEmail} to super_admin …`);
    await conn.query(`
      UPDATE users SET role = 'super_admin' WHERE email = ?
    `, [superEmail]);

    /* ── 4. Set default permissions for each role ── */
    console.log("4. Setting default permissions per role …");
    await conn.query(`
      UPDATE users SET permissions = '{"read":true,"write":true,"modify":true,"delete":true}'
      WHERE role = 'super_admin'
    `);
    await conn.query(`
      UPDATE users SET permissions = '{"read":true,"write":true,"modify":true,"delete":false}'
      WHERE role = 'admin'
    `);
    await conn.query(`
      UPDATE users SET permissions = '{"read":true,"write":true,"modify":true,"delete":false}'
      WHERE role = 'super_user'
    `);
    await conn.query(`
      UPDATE users SET permissions = '{"read":true,"write":false,"modify":false,"delete":false}'
      WHERE role = 'simple_user'
    `);

    /* ── 5. Create notifications table ── */
    console.log("5. Creating notifications table …");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT            NULL COMMENT 'NULL = broadcast to all',
        type        VARCHAR(50)    NOT NULL DEFAULT 'info',
        title       VARCHAR(255)   NOT NULL,
        message     TEXT           NULL,
        link        VARCHAR(500)   NULL,
        is_read     TINYINT(1)     NOT NULL DEFAULT 0,
        created_at  TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_read (user_id, is_read),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.commit();
    console.log("\n✅ Migration v3 complete!");
  } catch (err) {
    await conn.rollback();
    console.error("❌ Migration v3 failed:", err.message);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
