/**
 * Run: node src/config/setupDb.js
 * Creates the database and all tables from schema.sql
 */
require("dotenv").config();
const mysql = require("mysql2/promise");
const fs    = require("fs");
const path  = require("path");

async function setup() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || "localhost",
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER     || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });

  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

  try {
    console.log("⏳ Running schema.sql …");
    await conn.query(sql);
    console.log("✅ Database & tables created successfully!");
    console.log("   Default admin → admin@techsupport4.com / Admin@1234");
  } catch (err) {
    console.error("❌ Setup failed:", err.message);
  } finally {
    await conn.end();
  }
}

setup();
