const jwt  = require("jsonwebtoken");
const User = require("../models/User");

function authMiddleware(req, res, next) {
  if (!process.env.JWT_SECRET) {
    console.error("FATAL: JWT_SECRET not set!");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

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
