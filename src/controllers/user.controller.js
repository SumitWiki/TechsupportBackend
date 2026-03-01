const bcrypt   = require("bcryptjs");
const crypto   = require("crypto");
const User     = require("../models/User");
const LoginLog = require("../models/LoginLog");
const { sendMail } = require("../config/mailer");
const { isSuperAdmin, SUPER_ADMIN_EMAIL, VALID_ROLES, ROLE_LEVEL, roleLevel } = require("../middleware/role.middleware");

exports.listUsers = async (_req, res) => {
  try {
    const users = await User.findAll();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// Password validation helper
function validatePassword(password) {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain a special character";
  return null;
}

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, permissions } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "name, email, password required" });

    // Password strength validation
    const pwdError = validatePassword(password);
    if (pwdError) return res.status(400).json({ error: pwdError });

    const existing = await User.findByEmail(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: "Email already exists" });

    // Only super admin can create super_admin or admin roles
    let finalRole = role || "user";
    if (!VALID_ROLES.includes(finalRole)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
    }
    // Role hierarchy enforcement: cannot create roles at or above your own level (unless super_admin)
    if (finalRole === "super_admin" && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: "Only Super Admin can create Super Admins" });
    }
    if (finalRole === "admin" && !isSuperAdmin(req.user) && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Only Admin or Super Admin can create Admins" });
    }

    // Default permission matrix per role
    const ROLE_DEFAULTS = {
      super_admin: { read: true, write: true, modify: true, delete: true },
      admin:       { read: true, write: true, modify: true, delete: false },
      user:        { read: true, write: false, modify: false, delete: false },
    };
    // If caller provides custom permissions, merge them; otherwise use role defaults
    const finalPerms = permissions && typeof permissions === 'object'
      ? { ...ROLE_DEFAULTS[finalRole], ...permissions }
      : (ROLE_DEFAULTS[finalRole] || ROLE_DEFAULTS.user);

    const password_hash = await bcrypt.hash(password, 12);
    const id = await User.create({
      name,
      email:         email.toLowerCase().trim(),
      password_hash,
      role:          finalRole,
      permissions:   finalPerms,
      created_by:    req.user.id,
    });

    // Welcome email — DO NOT include password in plain text
    await sendMail({
      to:      email,
      subject: "Welcome to TechSupport4 CRM",
      html: `
        <div style="font-family:sans-serif;max-width:480px">
          <h2 style="color:#1e40af">Welcome, ${name.replace(/</g, "&lt;").replace(/>/g, "&gt;")}!</h2>
          <p>Your CRM account has been created.</p>
          <table style="font-size:14px">
            <tr><td style="color:#64748b;padding:4px 8px">Email</td><td>${email.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td></tr>
            <tr><td style="color:#64748b;padding:4px 8px">Role</td><td>${finalRole}</td></tr>
          </table>
          <p style="color:#ef4444;font-size:13px">Your temporary password has been shared securely by your admin. Please change it after first login.</p>
        </div>
      `,
    });

    res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const targetUser = await User.findById(targetId);
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    const { name, email, role, is_active, password, permissions } = req.body;
    const fields = {};

    // Protection: Cannot modify super admin unless you ARE the super admin
    if (isSuperAdmin(targetUser) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: "Cannot modify Super Admin account" });
    }

    // Protection: Cannot disable/modify your own account (except password)
    if (targetId === req.user.id) {
      if (is_active !== undefined && !is_active) {
        return res.status(400).json({ error: "Cannot disable your own account" });
      }
      if (role && role !== req.user.role) {
        return res.status(400).json({ error: "Cannot change your own role" });
      }
    }

    // Only super admin can change roles to super_admin or modify admin roles
    if (role) {
      if (role === "super_admin" && !isSuperAdmin(req.user)) {
        return res.status(403).json({ error: "Only Super Admin can assign Super Admin role" });
      }
      // Admin disabling another admin requires super admin
      if (targetUser.role === "admin" && !isSuperAdmin(req.user)) {
        return res.status(403).json({ error: "Only Super Admin can modify Admin accounts" });
      }
      fields.role = role;
    }

    if (name) fields.name = name;
    if (email) {
      const normalized = email.toLowerCase().trim();
      const existing = await User.findByEmail(normalized);
      if (existing && existing.id !== targetId) {
        return res.status(409).json({ error: "Email already in use by another user" });
      }
      fields.email = normalized;
    }
    
    // Protection: Only super admin can disable admin accounts
    if (is_active !== undefined) {
      if (targetUser.role === "admin" && !isSuperAdmin(req.user)) {
        return res.status(403).json({ error: "Only Super Admin can disable Admin accounts" });
      }
      fields.is_active = is_active ? 1 : 0;
    }

    if (permissions && typeof permissions === 'object') fields.permissions = permissions;
    
    if (password) {
      const pwdError = validatePassword(password);
      if (pwdError) return res.status(400).json({ error: pwdError });
      fields.password_hash = await bcrypt.hash(password, 12);
    }

    await User.update(targetId, fields);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// User changes their own password
exports.changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Verify current password
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: "Current password is incorrect" });

    // Validate new password
    const pwdError = validatePassword(newPassword);
    if (pwdError) return res.status(400).json({ error: pwdError });

    // Cannot reuse the same password
    const samePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (samePassword) return res.status(400).json({ error: "New password must be different from current password" });

    const password_hash = await bcrypt.hash(newPassword, 12);
    await User.update(req.user.id, { password_hash });

    // Send notification email
    await sendMail({
      to: user.email,
      subject: "TechSupport4 CRM — Password Changed",
      html: `
        <div style="font-family:sans-serif;max-width:480px">
          <h2 style="color:#1e40af">Password Changed</h2>
          <p>Hi <strong>${user.name.replace(/</g, "&lt;")}</strong>,</p>
          <p>Your password was successfully changed on ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.</p>
          <p style="color:#ef4444;font-size:13px">If you did not make this change, contact support immediately.</p>
        </div>
      `,
    });

    res.json({ ok: true, message: "Password changed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// Admin changes another user's password  
exports.changeUserPassword = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword) return res.status(400).json({ error: "New password required" });

    const targetUser = await User.findById(targetId);
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    // Cannot change your own password via this endpoint
    if (targetId === req.user.id) {
      return res.status(400).json({ error: "Use 'Change My Password' to change your own password" });
    }

    // Only super admin can change admin passwords
    if ((targetUser.role === "admin" || isSuperAdmin(targetUser)) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: "Only Super Admin can change Admin passwords" });
    }

    const pwdError = validatePassword(newPassword);
    if (pwdError) return res.status(400).json({ error: pwdError });

    const password_hash = await bcrypt.hash(newPassword, 12);
    await User.update(targetId, { password_hash });

    // Send notification email to the user
    await sendMail({
      to: targetUser.email,
      subject: "TechSupport4 CRM — Your Password Was Reset",
      html: `
        <div style="font-family:sans-serif;max-width:480px">
          <h2 style="color:#1e40af">Password Reset by Admin</h2>
          <p>Hi <strong>${targetUser.name.replace(/</g, "&lt;")}</strong>,</p>
          <p>Your password was reset by an administrator on ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.</p>
          <p style="color:#ef4444;font-size:13px">Please contact your admin for your new password and change it after logging in.</p>
        </div>
      `,
    });

    res.json({ ok: true, message: "Password changed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// Admin+ can force logout a user (with proper permissions)
exports.forceLogout = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const targetUser = await User.findById(targetId);
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    // Cannot force logout yourself
    if (targetId === req.user.id) {
      return res.status(400).json({ error: "Cannot force logout yourself" });
    }

    // Cannot force logout super admin (only another super admin can)
    if (isSuperAdmin(targetUser) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: "Cannot force logout Super Admin" });
    }

    // Only super admin can force-logout admins
    if (targetUser.role === "admin" && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: "Only Super Admin can force logout Admin accounts" });
    }

    // Temporarily deactivate and reactivate to invalidate sessions
    // The auth middleware checks is_active on every /me request, so
    // the user's next API call will fail with 401, forcing re-login
    await User.update(targetId, { is_active: 0 });
    // Small delay to ensure any in-flight /me checks see is_active=0
    await new Promise(resolve => setTimeout(resolve, 100));
    await User.update(targetId, { is_active: 1 });

    // Also add a note that the user was force-logged-out
    console.log(`[FORCE-LOGOUT] User ${targetUser.email} (ID: ${targetId}) force-logged-out by ${req.user.email}`);

    res.json({ ok: true, message: `${targetUser.name} has been logged out` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.getLoginLogs = async (req, res) => {
  try {
    const logs = await LoginLog.all(parseInt(req.query.limit) || 500);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

/** Super Admin only: get user summary for Logs page */
exports.getLogsSummary = async (req, res) => {
  try {
    const summary = await LoginLog.userSummary();
    res.json({ summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

/** Super Admin only: get detailed logs for a specific user */
exports.getUserLogs = async (req, res) => {
  try {
    const logs = await LoginLog.forUser(parseInt(req.params.id), parseInt(req.query.limit) || 200);
    const user = await User.findById(parseInt(req.params.id));
    res.json({ logs, user: user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const targetUser = await User.findById(id);
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    // Cannot delete yourself
    if (id === req.user.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Cannot delete super admin
    if (isSuperAdmin(targetUser)) {
      return res.status(403).json({ error: "Cannot delete Super Admin account" });
    }

    // Only super admin can delete admin accounts
    if (targetUser.role === "admin" && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: "Only Super Admin can delete Admin accounts" });
    }

    await User.delete(id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.getMyLogs = async (req, res) => {
  try {
    const logs = await LoginLog.forUser(req.user.id);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
