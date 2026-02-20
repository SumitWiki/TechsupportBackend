const router       = require("express").Router();
const ctrl         = require("../controllers/case.controller");
const authMw       = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

// Public — contact form submits here
router.post("/contact", ctrl.createFromContact);

// All the rest require login
router.use(authMw);

router.get  ("/",                     ctrl.listCases);
router.get  ("/stats",                ctrl.stats);
router.post ("/manual",               requireAdmin, ctrl.createManual);  // admin manual ticket
router.get  ("/:caseId",              ctrl.getCase);
router.put  ("/:caseId/close",        ctrl.closeCase);
router.put  ("/:caseId/reopen",       ctrl.reopenCase);
router.put  ("/:caseId/assign",       requireAdmin, ctrl.assignCase);  // admin only
router.post ("/:caseId/notes",        ctrl.addNote);

module.exports = router;
