require("dotenv").config(); 
const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const cookieParser = require("cookie-parser");
const path         = require("path");
const rateLimit    = require("express-rate-limit");
const logger       = require("./src/config/logger");

// ─── VALIDATE REQUIRED ENV VARS ───────────────────────────────────────────────
const requiredEnv = ["JWT_SECRET", "DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length) {
  logger.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const app = express();
const isProd = process.env.NODE_ENV === "production";

// ─── TRUST PROXY (behind Nginx / load balancer) ──────────────────────────────
app.set("trust proxy", 1);

// ─── SECURITY HEADERS (Helmet — hardened) ─────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc:    ["'self'"],
      objectSrc:  ["'none'"],
      frameAncestors: ["'none'"],
      baseUri:    ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

// ─── CORS (strict origin whitelist) ───────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CRM_URL,
  ...(isProd ? [] : ["http://localhost:3000", "http://localhost:5000"]),
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    logger.security("CORS blocked request from unauthorized origin", { origin });
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400, // Preflight cache 24h
}));

// ─── COOKIE PARSER ────────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── BODY PARSERS (with size limits) ──────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ─── GLOBAL RATE LIMITING ─────────────────────────────────────────────────────
app.use("/api/", rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 500,                    // 500 requests per window per IP (dashboard fires many)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  skip: (req) => req.path === "/api/health",  // Allow health checks
}));

// ─── FAILED-ONLY LOGIN RATE LIMIT ─────────────────────────────────────────────
// Only counts FAILED login/OTP attempts. Successful logins reset the counter.
// Valid users are NEVER blocked — only brute-force attackers.
const failedLoginStore = new Map(); // ip -> { count, resetTime }
const FAILED_LOGIN_WINDOW = 10 * 60 * 1000; // 10 minutes
const FAILED_LOGIN_MAX = 10;                 // 10 failed attempts per window

function failedLoginLimiter(req, res, next) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const entry = failedLoginStore.get(ip);

  // Clean expired entries
  if (entry && now > entry.resetTime) {
    failedLoginStore.delete(ip);
  }

  const current = failedLoginStore.get(ip);
  if (current && current.count >= FAILED_LOGIN_MAX) {
    const retryAfter = Math.ceil((current.resetTime - now) / 1000);
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Too many failed attempts — try again in 10 minutes" });
  }

  // Hook into response to count only failures
  const originalJson = res.json.bind(res);
  res.json = function(body) {
    if (res.statusCode === 401) {
      // Failed attempt — increment counter
      const e = failedLoginStore.get(ip);
      if (e) {
        e.count++;
      } else {
        failedLoginStore.set(ip, { count: 1, resetTime: now + FAILED_LOGIN_WINDOW });
      }
    } else if (res.statusCode === 200) {
      // Successful — RESET counter so valid users are never blocked
      failedLoginStore.delete(ip);
    }
    return originalJson(body);
  };
  next();
}

// Periodic cleanup of expired entries (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of failedLoginStore) {
    if (now > entry.resetTime) failedLoginStore.delete(ip);
  }
}, 5 * 60 * 1000);

app.use("/api/auth/login",      failedLoginLimiter);
app.use("/api/auth/verify-otp", failedLoginLimiter);

// ─── REFRESH TOKEN — generous limit (no strict blocking) ─────────────────────
app.use("/api/auth/refresh", rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 100,                    // 100 refreshes per hour — normal users won't hit this
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many refresh attempts" },
}));

app.use("/api/cases/contact", rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many contact submissions" },
}));

// ─── REQUEST LOGGING (production only, skip health checks) ────────────────────
if (isProd) {
  app.use((req, res, next) => {
    if (req.path === "/api/health") return next();
    const start = Date.now();
    res.on("finish", () => {
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`, {
        ip: req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress,
      });
    });
    next();
  });
}

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use("/api/auth",          require("./src/routes/auth.routes"));
app.use("/api/cases",         require("./src/routes/case.routes"));
app.use("/api/customers",     require("./src/routes/customer.routes"));
app.use("/api/users",         require("./src/routes/user.routes"));
app.use("/api/twilio",        require("./src/routes/twilio.routes"));
app.use("/api/notifications", require("./src/routes/notification.routes"));

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
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  // Don't leak error details in production
  res.status(500).json({ error: isProd ? "Internal server error" : err.message });
});

// ─── UNCAUGHT EXCEPTION / REJECTION HANDLERS ─────────────────────────────────
process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION", { error: err.message, stack: err.stack });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.error("UNHANDLED REJECTION", { reason: String(reason) });
});

// ─── PERIODIC CLEANUP: expired refresh tokens (every 6 hours) ────────────────
const RefreshToken = require("./src/models/RefreshToken");
setInterval(async () => {
  try {
    const cleaned = await RefreshToken.cleanup();
    if (cleaned > 0) logger.info(`Cleaned ${cleaned} expired refresh tokens`);
  } catch (err) {
    logger.error("Refresh token cleanup failed", { error: err.message });
  }
}, 6 * 60 * 60 * 1000);

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`TechSupport4 CRM running on port ${PORT}`);
  if (!isProd) {
    logger.info(`  API base: http://localhost:${PORT}/api`);
    logger.info(`  CRM UI:   http://localhost:${PORT}`);
  }
});
