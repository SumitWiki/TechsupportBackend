const bcrypt    = require("bcryptjs");
const jwt       = require("jsonwebtoken");
const crypto    = require("crypto");
const geoip     = require("geoip-lite");

const User     = require("../models/User");
const OtpCode  = require("../models/OtpCode");
const LoginLog = require("../models/LoginLog");
const { sendMail } = require("../config/mailer");

// ─── In-memory token blacklist (use Redis in multi-instance production) ──────
if (!global._tokenBlacklist) {
  global._tokenBlacklist = new Set();
}

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

/** Cryptographically secure OTP */
function generateOtp(length = 6) {
  const max = Math.pow(10, length);
  const min = Math.pow(10, length - 1);
  return String(crypto.randomInt(min, max));
}

/** HTML-escape to prevent XSS in emails */
function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── STEP 1: email + password ──────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await User.findByEmail(email.toLowerCase().trim());
    if (!user || !user.is_active) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      const ip  = getIp(req);
      const geo = getGeo(ip);
      await LoginLog.record({ userId: user.id, ip, userAgent: req.headers["user-agent"], geo, status: "failed" });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate 6-digit OTP
    const otp = generateOtp(6);
    const expiresAt = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRY_MINUTES) || 10) * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    await OtpCode.create(user.id, otp, expiresAt);

    // Send OTP email
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

    // Don't expose user ID — use a temporary session reference
    return res.json({ message: "OTP sent to your email", userId: user.id });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ── STEP 2: verify OTP ────────────────────────────────────────────────────────
exports.verifyOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) return res.status(400).json({ error: "userId and otp required" });

    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ error: "User not found" });

    // Re-check is_active (user could be disabled between step 1 and step 2)
    if (!user.is_active) return res.status(401).json({ error: "Account is disabled" });

    const valid = await OtpCode.verify(userId, otp.trim());
    if (!valid) return res.status(401).json({ error: "Invalid or expired OTP" });

    // Record successful login with IP + geo
    const ip  = getIp(req);
    const geo = getGeo(ip);
    await LoginLog.record({
      userId: user.id,
      ip,
      userAgent: req.headers["user-agent"],
      geo,
      status: "success",
    });

    // Send login notification email
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

    // Issue JWT — NO fallback secret, env must be set
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("verifyOtp error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ── Logout (blacklist token) ──────────────────────────────────────────────────
exports.logout = (req, res) => {
  if (req.token) {
    global._tokenBlacklist.add(req.token);
    // Auto-cleanup: remove token from blacklist after JWT_EXPIRES_IN
    const expiresMs = (req.user?.exp ? req.user.exp * 1000 - Date.now() : 8 * 60 * 60 * 1000);
    setTimeout(() => global._tokenBlacklist.delete(req.token), Math.max(expiresMs, 0));
  }
  res.json({ message: "Logged out successfully" });
};

// ── Whoami ────────────────────────────────────────────────────────────────────
exports.me = async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user);
};
