const jwt    = require("jsonwebtoken");
const logger = require("../config/logger");

/**
 * Auth middleware — reads JWT from:
 *   1. HttpOnly cookie "auth_token" (preferred, secure)
 *   2. Authorization: Bearer <token> header (fallback for API clients)
 *
 * Short-lived access tokens (15m) — refresh via /api/auth/refresh
 */
function authMiddleware(req, res, next) {
  if (!process.env.JWT_SECRET) {
    logger.error("FATAL: JWT_SECRET not set!");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  // 1. Try cookie first, then Authorization header
  const cookieToken = req.cookies?.auth_token;
  const header      = req.headers.authorization || "";
  const headerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token       = cookieToken || headerToken;

  if (!token) {
    // No access token — if refresh cookie exists, tell frontend to refresh
    if (req.cookies?.refresh_token) {
      return res.status(401).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check in-memory blacklist (logged out tokens)
    if (global._tokenBlacklist?.has(token)) {
      return res.status(401).json({ error: "Token has been revoked" });
    }

    req.user  = decoded;
    req.token = token;
    next();
  } catch (err) {
    // Distinguish expired from invalid for frontend refresh logic
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = authMiddleware;
