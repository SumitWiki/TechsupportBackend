const router = require("express").Router();
const ctrl   = require("../controllers/approval.controller");
const authMw = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { requireSuperAdmin } = require("../middleware/role.middleware");

router.use(authMw);

// Any admin+ can list (super_admin sees all, others see own)
router.get  ("/",              requireAdmin,      ctrl.listApprovals);

// Only super_admin can approve / reject
router.post ("/:id/approve",   requireSuperAdmin, ctrl.approveDelete);
router.post ("/:id/reject",    requireSuperAdmin, ctrl.rejectDelete);

module.exports = router;
