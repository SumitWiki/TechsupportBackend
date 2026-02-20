/**
 * Fix Admin Password + Full Debug Check
 * Run: node fix-admin-password.js
 */
require("dotenv").config();
const mysql  = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const NEW_PASSWORD = "Admin@1234";
const ADMIN_EMAIL  = "support@techsupport4.com";

async function fix() {
  console.log("=== DB CONFIG ===");
  console.log("DB_HOST:", process.env.DB_HOST);
  console.log("DB_NAME:", process.env.DB_NAME);
  console.log("DB_USER:", process.env.DB_USER);
  console.log("DB_PORT:", process.env.DB_PORT || 3306);
  console.log("");

  console.log("Connecting to database...");
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  console.log("✅ Connected!\n");

  // 1. Check if admin user exists
  const [users] = await conn.query(
    "SELECT id, name, email, role, is_active, password_hash FROM users WHERE email = ?",
    [ADMIN_EMAIL]
  );

  if (users.length === 0) {
    console.log(`❌ No user found with email: ${ADMIN_EMAIL}`);
    console.log("   Checking all users in database...\n");
    const [allUsers] = await conn.query("SELECT id, name, email, role, is_active FROM users");
    if (allUsers.length === 0) {
      console.log("❌ Users table is EMPTY! Run 'npm run setup-db' first.");
    } else {
      console.log("Found users:");
      allUsers.forEach(u => console.log(`   id=${u.id} email=${u.email} role=${u.role} is_active=${u.is_active}`));
    }
    await conn.end();
    return;
  }

  const admin = users[0];
  console.log("=== ADMIN USER FOUND ===");
  console.log("ID:", admin.id);
  console.log("Name:", admin.name);
  console.log("Email:", admin.email);
  console.log("Role:", admin.role);
  console.log("is_active:", admin.is_active);
  console.log("Current hash:", admin.password_hash);
  console.log("");

  // 2. Check if is_active is 0 (this causes "Invalid credentials")
  if (!admin.is_active) {
    console.log("⚠️  is_active = 0! This causes 'Invalid credentials'. Fixing...");
    await conn.query("UPDATE users SET is_active = 1 WHERE id = ?", [admin.id]);
    console.log("✅ is_active set to 1\n");
  }

  // 3. Test current password against current hash
  const currentMatch = await bcrypt.compare(NEW_PASSWORD, admin.password_hash);
  console.log(`Password "${NEW_PASSWORD}" matches current hash: ${currentMatch}`);

  if (currentMatch) {
    console.log("✅ Password is already correct! No update needed.");
    console.log("\n⚠️  If login still fails, check:");
    console.log("   - SMTP settings (OTP email might not be sending)");
    console.log("   - JWT_SECRET is set in .env");
    console.log("   - Backend logs for actual error (pm2 logs backend)");
  } else {
    // 4. Generate new hash and update
    console.log("❌ Hash mismatch! Generating new hash...\n");
    const hash = await bcrypt.hash(NEW_PASSWORD, 12);
    console.log("New hash:", hash);

    const [result] = await conn.query(
      "UPDATE users SET password_hash = ?, is_active = 1 WHERE email = ?",
      [hash, ADMIN_EMAIL]
    );
    console.log(`\n✅ Password updated! Rows affected: ${result.affectedRows}`);

    // 5. Verify the fix
    const verifyMatch = await bcrypt.compare(NEW_PASSWORD, hash);
    console.log(`Verify new hash matches "${NEW_PASSWORD}": ${verifyMatch}`);
  }

  // 6. Check JWT_SECRET
  console.log("\n=== ENV CHECK ===");
  console.log("JWT_SECRET set:", !!process.env.JWT_SECRET);
  console.log("SMTP_USER set:", !!process.env.SMTP_USER);
  console.log("SMTP_PASS set:", !!process.env.SMTP_PASS);
  console.log("NODE_ENV:", process.env.NODE_ENV);

  await conn.end();
  console.log("\n=== DONE ===");
  console.log("Now restart the backend: pm2 restart backend");
}

fix().catch(err => {
  console.error("Error:", err.message);
  console.error("Full error:", err);
  process.exit(1);
});
