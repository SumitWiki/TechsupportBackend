require("dotenv").config();
const express     = require("express");
const cors        = require("cors");
const path        = require("path");
const rateLimit   = require("express-rate-limit");

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL  || "http://localhost:3000",
    process.env.CRM_URL       || "http://localhost:4000",
    "https://techsupport4.com",
    "https://www.techsupport4.com",
    "https://crm.techsupport4.com",
  ],
  credentials: true,
}));

// ─── BODY PARSERS ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: "Too many requests, please try again later" },
}));

app.use("/api/cases/contact", rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hr
  max: 10,
  message: { error: "Too many contact submissions" },
}));

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use("/api/auth",      require("./src/routes/auth.routes"));
app.use("/api/cases",     require("./src/routes/case.routes"));
app.use("/api/customers", require("./src/routes/customer.routes"));
app.use("/api/users",     require("./src/routes/user.routes"));

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date() }));

// ─── SERVE CRM FRONTEND (SPA) ─────────────────────────────────────────────────
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀 TechSupport4 CRM running at http://localhost:${PORT}`);
  console.log(`   API base: http://localhost:${PORT}/api`);
  console.log(`   CRM UI:   http://localhost:${PORT}\n`);
});
