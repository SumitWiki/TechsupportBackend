const bcrypt   = require("bcryptjs");
const crypto   = require("crypto");
const User     = require("../models/User");
const LoginLog = require("../models/LoginLog");
const { sendMail } = require("../config/mailer");

exports.listUsers = async (_req, res) => {
  try {
    const users = await User.findAll();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, permissions } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "name, email, password required" });

    // Password strength validation
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    if (!/[A-Z]/.test(password)) return res.status(400).json({ error: "Password must contain an uppercase letter" });
    if (!/[0-9]/.test(password)) return res.status(400).json({ error: "Password must contain a number" });
    if (!/[^A-Za-z0-9]/.test(password)) return res.status(400).json({ error: "Password must contain a special character" });

    const existing = await User.findByEmail(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: "Email already exists" });

    // Build permissions — admin gets all, agents get what's specified
    const defaultPerms = { read: true, write: false, modify: false, delete: false };
    const finalPerms = role === 'admin'
      ? { read: true, write: true, modify: true, delete: true }
      : { ...defaultPerms, ...(permissions || {}) };

    const password_hash = await bcrypt.hash(password, 12);
    const id = await User.create({
      name,
      email:         email.toLowerCase().trim(),
      password_hash,
      role:          role || "agent",
      permissions:   finalPerms,
      created_by:    req.user.id,
    });

    // Welcome email — DO NOT include password in plain text
    // Generate a one-time password reset token instead
    await sendMail({
      to:      email,
      subject: "Welcome to TechSupport4 CRM",
      html: `
        <div style="font-family:sans-serif;max-width:480px">
          <h2 style="color:#1e40af">Welcome, ${name.replace(/</g, "&lt;").replace(/>/g, "&gt;")}!</h2>
          <p>Your CRM account has been created.</p>
          <table style="font-size:14px">
            <tr><td style="color:#64748b;padding:4px 8px">Email</td><td>${email.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td></tr>
            <tr><td style="color:#64748b;padding:4px 8px">Role</td><td>${role || "agent"}</td></tr>
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
    const { name, email, role, is_active, password, permissions } = req.body;
    const fields = {};
    if (name)      fields.name      = name;
    if (email) {
      const normalized = email.toLowerCase().trim();
      // Check email uniqueness
      const existing = await User.findByEmail(normalized);
      if (existing && existing.id !== parseInt(req.params.id)) {
        return res.status(409).json({ error: "Email already in use by another user" });
      }
      fields.email = normalized;
    }
    if (role)      fields.role      = role;
    if (is_active !== undefined) fields.is_active = is_active ? 1 : 0;
    if (permissions && typeof permissions === 'object') fields.permissions = permissions;
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
      if (!/[A-Z]/.test(password)) return res.status(400).json({ error: "Password must contain an uppercase letter" });
      if (!/[0-9]/.test(password)) return res.status(400).json({ error: "Password must contain a number" });
      fields.password_hash = await bcrypt.hash(password, 12);
    }

    await User.update(req.params.id, fields);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.getLoginLogs = async (req, res) => {
  try {
    const logs = await LoginLog.all(parseInt(req.query.limit) || 100);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: "Cannot delete yourself" });
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "User not found" });
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
