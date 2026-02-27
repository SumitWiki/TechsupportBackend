const router       = require("express").Router();
const ctrl         = require("../controllers/case.controller");
const authMw       = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { requirePerm, requireSuperAdmin, requireSuperUser } = require("../middleware/role.middleware");
const { contactFormRules, caseIdParam, paginationRules } = require("../middleware/validate.middleware");

// Public — contact form submits here
router.post("/contact", contactFormRules, ctrl.createFromContact);

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

router.get  ("/",                      requirePerm('read'),   paginationRules, ctrl.listCases);
router.get  ("/stats",                                        ctrl.stats);
router.get  ("/audit",                 requireAdmin,          ctrl.recentAudit);
router.post ("/manual",                requirePerm('write'),  ctrl.createManual);
router.post ("/bulk-delete",           requireSuperAdmin,     ctrl.bulkDeleteCases);
router.get  ("/:caseId",               caseIdParam, requirePerm('read'),   ctrl.getCase);
router.get  ("/:caseId/audit",         caseIdParam, requirePerm('read'),   ctrl.getAuditLog);
router.put  ("/:caseId/open",          caseIdParam, requirePerm('modify'), ctrl.markOpen);
router.put  ("/:caseId/close",         caseIdParam, requirePerm('modify'), ctrl.closeCase);
router.put  ("/:caseId/reopen",        caseIdParam, requirePerm('modify'), ctrl.reopenCase);
router.put  ("/:caseId/in-progress",   caseIdParam, requirePerm('modify'), ctrl.markInProgress);
router.put  ("/:caseId/priority",      caseIdParam, requirePerm('modify'), ctrl.updatePriority);
router.put  ("/:caseId/assign",        caseIdParam, requireSuperUser,      ctrl.assignCase);
router.post ("/:caseId/notes",         caseIdParam, requirePerm('write'),  ctrl.addNote);
router.delete("/:caseId",              caseIdParam, requireSuperAdmin,     ctrl.deleteCase);

module.exports = router;
