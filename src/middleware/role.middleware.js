const User = require("../models/User");

// Super admin email — has all privileges, cannot be disabled/deleted
const SUPER_ADMIN_EMAIL = "support@techsupport4.com";

/**
 * Check if user is super admin
 */
function isSuperAdmin(user) {
  return user?.role === "super_admin" || user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}

/**
 * requireAdmin — admin or super_admin role can proceed
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin" && req.user?.role !== "super_admin" && !isSuperAdmin(req.user)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/**
 * requireSuperAdmin — only super_admin role can proceed
 */
function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: "Super Admin access required" });
  }
  next();
}

/**
 * requirePerm(perm) — checks the user's permissions JSON column
 * perm can be: "read", "write", "modify", "delete"
 * Admins and super admins always pass (all permissions).
 */
function requirePerm(perm) {
  return async (req, res, next) => {
    try {
      // Super admin and admin roles always have full access
      if (isSuperAdmin(req.user) || req.user?.role === "admin") return next();

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
module.exports.requireSuperAdmin = requireSuperAdmin;
module.exports.isSuperAdmin = isSuperAdmin;
module.exports.SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAIL;
