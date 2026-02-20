const User = require("../models/User");

/**
 * requireAdmin — only admin role can proceed
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/**
 * requirePerm(perm) — checks the user's permissions JSON column
 * perm can be: "read", "write", "modify", "delete"
 * Admins always pass (all permissions).
 */
function requirePerm(perm) {
  return async (req, res, next) => {
    try {
      // Admin role always has full access
      if (req.user?.role === "admin") return next();

      // Fetch fresh permissions from DB (don't trust JWT payload alone)
      const user = await User.findById(req.user.id);
      if (!user || !user.is_active) {
        return res.status(401).json({ error: "Account disabled or not found" });
      }

      const perms = typeof user.permissions === 'string'
        ? JSON.parse(user.permissions)
        : (user.permissions || {});

      if (!perms[perm]) {
        return res.status(403).json({ error: `Permission denied: ${perm} access required` });
      }

      next();
    } catch (err) {
      console.error("Permission check error:", err);
      res.status(500).json({ error: "Server error" });
    }
  };
}

module.exports = requireAdmin;
module.exports.requirePerm = requirePerm;
