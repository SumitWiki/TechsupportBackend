const jwt  = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Auth middleware — reads JWT from:
 *   1. HttpOnly cookie "auth_token" (preferred, secure)
 *   2. Authorization: Bearer <token> header (fallback for API clients)
 */
function authMiddleware(req, res, next) {
  if (!process.env.JWT_SECRET) {
    console.error("FATAL: JWT_SECRET not set!");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  // 1️⃣ Try cookie first, then Authorization header
  const cookieToken = req.cookies?.auth_token;
  const header      = req.headers.authorization || "";
  const headerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token       = cookieToken || headerToken;

  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if token has been blacklisted (logged out)
    if (global._tokenBlacklist?.has(token)) {
      return res.status(401).json({ error: "Token has been revoked" });
    }

    req.user  = decoded;
    req.token = token;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = authMiddleware;
