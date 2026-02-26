const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const crypto = require("crypto");
const geoip  = require("geoip-lite");

const User         = require("../models/User");
const OtpCode      = require("../models/OtpCode");
const LoginLog     = require("../models/LoginLog");
const RefreshToken = require("../models/RefreshToken");
const { sendMail } = require("../config/mailer");
const logger       = require("../config/logger");
const db           = require("../config/db");

// ─── In-memory token blacklist (use Redis in multi-instance production) ──────
if (!global._tokenBlacklist) {
  global._tokenBlacklist = new Set();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function getGeo(ip) {
  if (!ip || ip === "::1" || ip === "127.0.0.1") return { country: "Localhost", region: "", city: "" };
  const geo = geoip.lookup(ip);
  return geo
    ? { country: geo.country, region: geo.region, city: geo.city }
    : { country: "Unknown", region: "", city: "" };
}

function generateOtp(length = 6) {
  const max = Math.pow(10, length);
  const min = Math.pow(10, length - 1);
  return String(crypto.randomInt(min, max));
}

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Parse JWT expiresIn string (e.g. "15m", "8h", "1d") to milliseconds */
function parseMaxAge(expiresIn) {
  const match = String(expiresIn).match(/^(\d+)([smhd])$/);
  if (!match) return 15 * 60 * 1000; // default 15m
  const val = parseInt(match[1]);
  const unit = match[2];
  if (unit === "s") return val * 1000;
  if (unit === "m") return val * 60 * 1000;
  if (unit === "h") return val * 60 * 60 * 1000;
  if (unit === "d") return val * 24 * 60 * 60 * 1000;
  return 15 * 60 * 1000;
}

/** Cookie defaults — secure in production */
function cookieOpts(maxAgeMs, path = "/") {
  return {
    httpOnly:  true,
    secure:    process.env.NODE_ENV === "production",
    sameSite:  "Strict",
    maxAge:    maxAgeMs,
    path,
  };
}

/** Log a security event to the security_logs table */
async function logSecurityEvent(eventType, req, extra = {}) {
  try {
    const ip = getIp(req);
    await db.query(
      `INSERT INTO security_logs (event_type, ip_address, user_agent, user_id, email, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        eventType,
        ip,
        (req.headers["user-agent"] || "").slice(0, 500),
        extra.userId || null,
        extra.email || null,
        JSON.stringify(extra.details || {}),
      ]
    );
  } catch (err) {
    logger.error("Failed to write security log", { eventType, error: err.message });
  }
}

const SUPER_ADMIN_EMAIL = "support@techsupport4.com";
function checkIsSuperAdmin(user) {
  return user?.role === "super_admin" || user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}

// ── STEP 1: email + password → OTP ──────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await User.findByEmail(email.toLowerCase().trim());
    if (!user || !user.is_active) {
      await logSecurityEvent("login_failed", req, { email, details: { reason: "invalid_credentials" } });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      const ip  = getIp(req);
      const geo = getGeo(ip);
      await LoginLog.record({ userId: user.id, ip, userAgent: req.headers["user-agent"], geo, status: "failed" });
      await logSecurityEvent("login_failed", req, { userId: user.id, email: user.email, details: { reason: "wrong_password" } });
      logger.security("Failed login attempt", { email: user.email, ip });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate 6-digit OTP
    const otp = generateOtp(6);
    const expiresAt = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRY_MINUTES) || 10) * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    await OtpCode.create(user.id, otp, expiresAt);

    try {
      await sendMail({
        to: user.email,
        subject: "TechSupport4 CRM — Your Login OTP",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#1e40af">Login Verification</h2>
            <p>Hi <strong>${esc(user.name)}</strong>,</p>
            <p>Your one-time login code is:</p>
            <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1e40af;padding:16px 0">${otp}</div>
            <p style="color:#64748b;font-size:13px">This code expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes. Do not share it with anyone.</p>
            <hr/>
            <p style="font-size:12px;color:#94a3b8">If you did not attempt to log in, please contact support immediately.</p>
          </div>
        `,
      });
    } catch (mailErr) {
      logger.error("OTP email failed (SMTP error)", { error: mailErr.message, userId: user.id });
    }

    return res.json({ message: "OTP sent to your email", userId: user.id });
  } catch (err) {
    logger.error("login error", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Server error" });
  }
};

// ── STEP 2: verify OTP → issue access + refresh tokens ─────────────────────
exports.verifyOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) return res.status(400).json({ error: "userId and otp required" });

    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ error: "User not found" });
    if (!user.is_active) return res.status(401).json({ error: "Account is disabled" });

    const valid = await OtpCode.verify(userId, otp.trim());
    if (!valid) {
      await logSecurityEvent("otp_failed", req, { userId: user.id, email: user.email });
      return res.status(401).json({ error: "Invalid or expired OTP" });
    }

    // Record successful login
    const ip  = getIp(req);
    const geo = getGeo(ip);
    await LoginLog.record({
      userId: user.id, ip, userAgent: req.headers["user-agent"], geo, status: "success",
    });
    await logSecurityEvent("login_success", req, { userId: user.id, email: user.email });

    // Login notification email
    try {
      const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      await sendMail({
        to: user.email,
        subject: "TechSupport4 CRM — New Login Detected",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#1e40af">Login Alert</h2>
            <p>Hi <strong>${esc(user.name)}</strong>, a successful login was recorded:</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:6px;color:#64748b">Time</td><td>${esc(now)} IST</td></tr>
              <tr><td style="padding:6px;color:#64748b">IP</td><td>${esc(ip)}</td></tr>
              <tr><td style="padding:6px;color:#64748b">Location</td><td>${esc(geo.city)}, ${esc(geo.region)}, ${esc(geo.country)}</td></tr>
              <tr><td style="padding:6px;color:#64748b">Device</td><td style="font-size:12px">${esc(req.headers["user-agent"]?.slice(0, 100))}</td></tr>
            </table>
            <p style="color:#ef4444;font-size:13px">If this wasn't you, contact admin immediately.</p>
          </div>
        `,
      });
    } catch (mailErr) {
      logger.error("Login notification email failed", { error: mailErr.message, userId: user.id });
    }

    // ── Short-lived access token (15 min default) ────────────────────────
    const accessExpiry = process.env.ACCESS_TOKEN_EXPIRY || "15m";
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: accessExpiry }
    );

    // ── Long-lived refresh token (7 days default, stored hashed in DB) ──
    const { token: refreshToken, family } = await RefreshToken.create(user.id);

    const refreshDays = parseInt(process.env.REFRESH_TOKEN_DAYS) || 7;
    const refreshMaxAge = refreshDays * 24 * 60 * 60 * 1000;

    // Set both cookies
    res.cookie("auth_token", accessToken, cookieOpts(parseMaxAge(accessExpiry)));
    res.cookie("refresh_token", refreshToken, cookieOpts(refreshMaxAge, "/api/auth"));

    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    logger.error("verifyOtp error", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Server error" });
  }
};

// ── Refresh: rotate refresh token, issue new access token ───────────────────
exports.refresh = async (req, res) => {
  try {
    const oldRefreshToken = req.cookies?.refresh_token;
    if (!oldRefreshToken) return res.status(401).json({ error: "No refresh token" });

    // Try to rotate (revokes old, issues new in same family)
    const result = await RefreshToken.rotate(oldRefreshToken);

    if (!result) {
      // Token not found or already revoked — possible theft!
      // Try to find the revoked record to get the family for full revocation
      const tokenHash = crypto.createHash("sha256").update(oldRefreshToken).digest("hex");
      const [rows] = await db.query(
        `SELECT family, user_id FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
        [tokenHash]
      );
      if (rows[0]) {
        // Revoke ENTIRE family — attacker AND legitimate user lose access
        await RefreshToken.revokeFamily(rows[0].family);
        await logSecurityEvent("refresh_token_reuse", req, {
          userId: rows[0].user_id,
          details: { family: rows[0].family, action: "family_revoked" },
        });
        logger.security("Refresh token reuse detected — family revoked", {
          userId: rows[0].user_id,
          family: rows[0].family,
        });
      }

      res.clearCookie("auth_token",    cookieOpts(0));
      res.clearCookie("refresh_token", cookieOpts(0, "/api/auth"));
      return res.status(401).json({ error: "Invalid refresh token — please login again" });
    }

    // Fetch fresh user from DB (never trust old token claims)
    const user = await User.findById(result.userId);
    if (!user || !user.is_active) {
      await RefreshToken.revokeFamily(result.family);
      res.clearCookie("auth_token",    cookieOpts(0));
      res.clearCookie("refresh_token", cookieOpts(0, "/api/auth"));
      return res.status(401).json({ error: "Account disabled" });
    }

    // Issue new access token with fresh user data
    const accessExpiry = process.env.ACCESS_TOKEN_EXPIRY || "15m";
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: accessExpiry }
    );

    const refreshDays = parseInt(process.env.REFRESH_TOKEN_DAYS) || 7;
    const refreshMaxAge = refreshDays * 24 * 60 * 60 * 1000;

    res.cookie("auth_token", accessToken, cookieOpts(parseMaxAge(accessExpiry)));
    res.cookie("refresh_token", result.token, cookieOpts(refreshMaxAge, "/api/auth"));

    return res.json({ message: "Token refreshed" });
  } catch (err) {
    logger.error("refresh error", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Server error" });
  }
};

// ── Logout (blacklist access token + revoke refresh family + clear cookies) ──
exports.logout = async (req, res) => {
  try {
    // Blacklist the access token
    if (req.token) {
      global._tokenBlacklist.add(req.token);
      const expiresMs = req.user?.exp ? req.user.exp * 1000 - Date.now() : 15 * 60 * 1000;
      setTimeout(() => global._tokenBlacklist.delete(req.token), Math.max(expiresMs, 0));
    }

    // Revoke refresh token family
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
      const [rows] = await db.query(
        `SELECT family FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
        [tokenHash]
      );
      if (rows[0]) {
        await RefreshToken.revokeFamily(rows[0].family);
      }
    }

    await logSecurityEvent("logout", req, { userId: req.user?.id, email: req.user?.email });

    // Clear both cookies
    res.clearCookie("auth_token",    cookieOpts(0));
    res.clearCookie("refresh_token", cookieOpts(0, "/api/auth"));

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    logger.error("logout error", { error: err.message });
    // Still clear cookies even on error
    res.clearCookie("auth_token",    cookieOpts(0));
    res.clearCookie("refresh_token", cookieOpts(0, "/api/auth"));
    res.json({ message: "Logged out" });
  }
};

// ── Whoami (always fetches fresh from DB) ────────────────────────────────────
exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: "User not found" });

    const isSuperAdmin = checkIsSuperAdmin(user);
    const effectiveRole = isSuperAdmin ? "super_admin" : user.role;
    const fullPerms = { read: true, write: true, modify: true, delete: true };

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: effectiveRole,
      isSuperAdmin,
      permissions: isSuperAdmin || user.role === "admin"
        ? fullPerms
        : (user.permissions || { read: true, write: false, modify: false, delete: false }),
    });
  } catch (err) {
    logger.error("me error", { error: err.message });
    res.status(500).json({ error: "Server error" });
  }
};
