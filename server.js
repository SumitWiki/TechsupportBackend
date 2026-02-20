require("dotenv").config();
const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const cookieParser = require("cookie-parser");
const path         = require("path");
const rateLimit    = require("express-rate-limit");

// ─── VALIDATE REQUIRED ENV VARS ───────────────────────────────────────────────
const requiredEnv = ["JWT_SECRET", "DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(", ")}`);
  console.error("   Create a .env file with these variables. Exiting.");
  process.exit(1);
}

const app = express();

// ─── SECURITY HEADERS (helmet) ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,         // CSP can break SPA; configure per deployment
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CRM_URL,
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : "http://localhost:3000",
  credentials: true,
}));

// ─── COOKIE PARSER ────────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── BODY PARSERS (with size limits) ──────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
// Only rate-limit login/verify-otp/logout — NOT /auth/me (called on every refresh)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api/auth/login",      authLimiter);
app.use("/api/auth/verify-otp", authLimiter);

app.use("/api/cases/contact", rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many contact submissions" },
}));

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use("/api/auth",      require("./src/routes/auth.routes"));
app.use("/api/cases",     require("./src/routes/case.routes"));
app.use("/api/customers", require("./src/routes/customer.routes"));
app.use("/api/users",     require("./src/routes/user.routes"));

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date() }));

// ─── 404 for unknown API routes ───────────────────────────────────────────────
app.all("/api/*", (_req, res) => res.status(404).json({ error: "API endpoint not found" }));

// ─── SERVE CRM FRONTEND (SPA) ─────────────────────────────────────────────────
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ─── UNCAUGHT EXCEPTION / REJECTION HANDLERS ─────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀 TechSupport4 CRM running at http://localhost:${PORT}`);
  console.log(`   API base: http://localhost:${PORT}/api`);
  console.log(`   CRM UI:   http://localhost:${PORT}\n`);
});
