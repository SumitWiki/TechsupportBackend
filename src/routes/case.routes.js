const router       = require("express").Router();
const ctrl         = require("../controllers/case.controller");
const authMw       = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { requirePerm, requireSuperAdmin } = require("../middleware/role.middleware");

// Public — contact form submits here
router.post("/contact", ctrl.createFromContact);

// Public — health check for CRM contact API
router.get("/contact/health", (req, res) => {
  res.json({ 
    ok: true, 
    message: "CRM Contact API is reachable",
    timestamp: new Date().toISOString(),
    dbConfigured: !!(process.env.DB_HOST && process.env.DB_NAME)
  });
});

// All the rest require login
router.use(authMw);

router.get  ("/",                      requirePerm('read'),   ctrl.listCases);
router.get  ("/stats",                                        ctrl.stats);
router.get  ("/audit",                 requireAdmin,          ctrl.recentAudit);    // admin — all audit logs
router.post ("/manual",                requirePerm('write'),  ctrl.createManual);   // write perm — manual ticket
router.get  ("/:caseId",               requirePerm('read'),   ctrl.getCase);
router.get  ("/:caseId/audit",         requirePerm('read'),   ctrl.getAuditLog);    // case audit trail
router.put  ("/:caseId/open",          requirePerm('modify'), ctrl.markOpen);       // mark open
router.put  ("/:caseId/close",         requirePerm('modify'), ctrl.closeCase);
router.put  ("/:caseId/reopen",        requirePerm('modify'), ctrl.reopenCase);
router.put  ("/:caseId/in-progress",   requirePerm('modify'), ctrl.markInProgress); // mark in progress
router.put  ("/:caseId/priority",      requirePerm('modify'), ctrl.updatePriority); // change priority
router.put  ("/:caseId/assign",        requireAdmin,          ctrl.assignCase);     // admin only
router.post ("/:caseId/notes",         requirePerm('write'),  ctrl.addNote);
router.delete("/:caseId",              requireSuperAdmin,     ctrl.deleteCase);     // super admin only

module.exports = router;
