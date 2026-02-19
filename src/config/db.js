const mysql = require("mysql2/promise");

// DB credentials come from .env — no unsafe fallbacks
const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "+00:00",
  // Enable SSL for production cloud databases (RDS, etc.)
  ...(process.env.NODE_ENV === "production" && process.env.DB_SSL !== "false"
    ? { ssl: { rejectUnauthorized: true } }
    : {}),
});

pool.getConnection()
  .then((conn) => {
    console.log("✅ MySQL connected successfully");
    conn.release();
  })
  .catch((err) => {
    console.error("❌ MySQL connection failed:", err.message);
    console.error("   Backend will start but database operations will fail.");
  });

module.exports = pool;
