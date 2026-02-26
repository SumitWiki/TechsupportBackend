const User = require("../models/User");

// Super admin email — has all privileges, cannot be disabled/deleted
const SUPER_ADMIN_EMAIL = "support@techsupport4.com";

/**
 * Role hierarchy (higher number = more privilege):
 *   simple_user (1) < super_user (2) < admin (3) < super_admin (4)
 *
 * Default permission matrix:
 *   super_admin  → read, write, modify, delete  (FULL)
 *   admin        → read, write, modify          (no delete users)
 *   super_user   → read, write, modify          (assign/close tickets, limited user view)
 *   simple_user  → read                         (own tickets only)
 */
const ROLE_LEVEL = {
  simple_user: 1,
  super_user:  2,
  admin:       3,
  super_admin: 4,
};

const VALID_ROLES = Object.keys(ROLE_LEVEL);

/**
 * Check if user is super admin
 */
function isSuperAdmin(user) {
  return user?.role === "super_admin" || user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}

/**
 * Get numeric privilege level for a role
 */
function roleLevel(role) {
  return ROLE_LEVEL[role] || 0;
}

/**
 * requireAdmin — admin or super_admin role can proceed
 */
function requireAdmin(req, res, next) {
  if (roleLevel(req.user?.role) < ROLE_LEVEL.admin && !isSuperAdmin(req.user)) {
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
 * requireSuperUser — super_user, admin, or super_admin can proceed
 */
function requireSuperUser(req, res, next) {
  if (roleLevel(req.user?.role) < ROLE_LEVEL.super_user && !isSuperAdmin(req.user)) {
    return res.status(403).json({ error: "Super User access or above required" });
  }
  next();
}

/**
 * requireRole(minRole) — generic: require at least the given role level
 */
function requireRole(minRole) {
  return (req, res, next) => {
    if (roleLevel(req.user?.role) < ROLE_LEVEL[minRole] && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: `Role "${minRole}" or above required` });
    }
    next();
  };
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
module.exports.requireSuperUser = requireSuperUser;
module.exports.requireRole = requireRole;
module.exports.isSuperAdmin = isSuperAdmin;
module.exports.roleLevel = roleLevel;
module.exports.SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAIL;
module.exports.VALID_ROLES = VALID_ROLES;
module.exports.ROLE_LEVEL = ROLE_LEVEL;
