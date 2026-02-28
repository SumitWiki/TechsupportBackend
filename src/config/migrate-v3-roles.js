/**
 * Migration v3 — Simplify roles & add customer fields
 *
 * Changes:
 *   1. Rename super_user → user, simple_user → user in users table
 *   2. Change ENUM to: super_admin, admin, user
 *   3. Add amount, paid_amount, offer columns to customers table
 *
 * Run: node src/config/migrate-v3-roles.js
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

  console.log("🔄 Starting migration v3...\n");

  // 1. Rename old roles to 'user'
  console.log("1. Converting super_user → user, simple_user → user...");
  await conn.query("UPDATE users SET role = 'user' WHERE role IN ('super_user', 'simple_user')");
  console.log("   ✅ Done\n");

  // 2. Alter ENUM (MySQL requires ALTER TABLE)
  console.log("2. Changing role ENUM to (super_admin, admin, user)...");
  try {
    await conn.query(`
      ALTER TABLE users 
      MODIFY COLUMN role ENUM('super_admin','admin','user') NOT NULL DEFAULT 'user'
    `);
    console.log("   ✅ Done\n");
  } catch (err) {
    if (err.code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD" || err.code === "ER_DATA_OUT_OF_RANGE") {
      console.log("   ⚠️  Some rows still have old role values. Forcing update...");
      await conn.query("UPDATE users SET role = 'user' WHERE role NOT IN ('super_admin', 'admin')");
      await conn.query(`
        ALTER TABLE users 
        MODIFY COLUMN role ENUM('super_admin','admin','user') NOT NULL DEFAULT 'user'
      `);
      console.log("   ✅ Done (after forced update)\n");
    } else {
      console.log(`   ⚠️  ENUM change skipped: ${err.message}\n`);
    }
  }

  // 3. Add customer columns
  console.log("3. Adding amount, paid_amount, offer columns to customers...");
  const columnsToAdd = [
    { name: "amount",      def: "DECIMAL(10,2) NULL DEFAULT NULL" },
    { name: "paid_amount", def: "DECIMAL(10,2) NULL DEFAULT NULL" },
    { name: "offer",       def: "VARCHAR(255) NULL DEFAULT NULL" },
  ];
  for (const col of columnsToAdd) {
    try {
      await conn.query(`ALTER TABLE customers ADD COLUMN ${col.name} ${col.def}`);
      console.log(`   ✅ Added ${col.name}`);
    } catch (err) {
      if (err.code === "ER_DUP_FIELDNAME") {
        console.log(`   ⏭️  ${col.name} already exists`);
      } else {
        console.log(`   ⚠️  ${col.name}: ${err.message}`);
      }
    }
  }

  console.log("\n✅ Migration v3 complete!");
  await conn.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
