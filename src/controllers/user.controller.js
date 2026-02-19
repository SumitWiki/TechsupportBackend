const bcrypt   = require("bcryptjs");
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
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "name, email, password required" });

    const existing = await User.findByEmail(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: "Email already exists" });

    const password_hash = await bcrypt.hash(password, 10);
    const id = await User.create({
      name,
      email:         email.toLowerCase().trim(),
      password_hash,
      role:          role || "agent",
      created_by:    req.user.id,
    });

    // Welcome email
    await sendMail({
      to:      email,
      subject: "Welcome to TechSupport4 CRM",
      html: `
        <div style="font-family:sans-serif;max-width:480px">
          <h2 style="color:#1e40af">Welcome, ${name}!</h2>
          <p>Your CRM account has been created.</p>
          <table style="font-size:14px">
            <tr><td style="color:#64748b;padding:4px 8px">Email</td><td>${email}</td></tr>
            <tr><td style="color:#64748b;padding:4px 8px">Role</td><td>${role || "agent"}</td></tr>
            <tr><td style="color:#64748b;padding:4px 8px">Password</td><td>${password}</td></tr>
          </table>
          <p style="color:#ef4444;font-size:13px">Please change your password after first login.</p>
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
    const { name, email, role, is_active, password } = req.body;
    const fields = {};
    if (name)      fields.name      = name;
    if (email)     fields.email     = email.toLowerCase().trim();
    if (role)      fields.role      = role;
    if (is_active !== undefined) fields.is_active = is_active ? 1 : 0;
    if (password)  fields.password_hash = await bcrypt.hash(password, 10);

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

exports.getMyLogs = async (req, res) => {
  try {
    const logs = await LoginLog.forUser(req.user.id);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
