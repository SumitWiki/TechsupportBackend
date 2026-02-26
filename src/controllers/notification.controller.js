const Notification = require("../models/Notification");

exports.list = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const notifications = await Notification.forUser(req.user.id, limit);
    res.json({ notifications });
  } catch (err) {
    console.error("Notification list error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.countUnread = async (req, res) => {
  try {
    const count = await Notification.countUnread(req.user.id);
    res.json({ count });
  } catch (err) {
    console.error("Notification count error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.markRead = async (req, res) => {
  try {
    await Notification.markRead(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("Notification mark read error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await Notification.markAllRead(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("Notification mark all read error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
