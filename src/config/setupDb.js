/**
 * Run: node src/config/setupDb.js
 * Creates the database and all tables from schema.sql
 */
require("dotenv").config();
const mysql = require("mysql2/promise");
const fs    = require("fs");
const path  = require("path");

async function setup() {
  if (!process.env.DB_HOST || !process.env.DB_USER) {
    console.error("❌ DB_HOST and DB_USER must be set in .env");
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

  try {
    console.log("⏳ Running schema.sql …");
    await conn.query(sql);
    console.log("✅ Database & tables created successfully!");
    console.log("   Default admin email: support@techsupport4.com");
    console.log("   ⚠️  Change the default admin password immediately after first login!");
  } catch (err) {
    console.error("❌ Setup failed:", err.message);
  } finally {
    await conn.end();
  }
}

setup();
