const Customer = require("../models/Customer");

exports.addCustomer = async (req, res) => {
  try {
    const { name, email, phone, address, plan, notes, amount, paid_amount, offer } = req.body;
    if (!name || !phone) return res.status(400).json({ error: "name and phone are required" });
    const id = await Customer.create({
      name, email: email || "", phone, address, plan, notes,
      amount: amount || null,
      paid_amount: paid_amount || null,
      offer: offer || null,
      created_by: req.user.id,
    });
    const customer = await Customer.findById(id);
    res.status(201).json({ ok: true, customer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.searchCustomer = async (req, res) => {
  try {
    const { mobile, email } = req.query;
    if (!mobile && !email) return res.status(400).json({ error: "Provide mobile or email" });
    const results = await Customer.findByPhoneOrEmail(mobile || "", email || "");
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.getCustomer = async (req, res) => {
  try {
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Not found" });
    res.json(c);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    await Customer.update(req.params.id, req.body);
    const c = await Customer.findById(req.params.id);
    res.json({ ok: true, customer: c });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Not found" });
    await Customer.delete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.listCustomers = async (_req, res) => {
  try {
    const list = await Customer.all();
    res.json({ results: list });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
