const router      = require("express").Router();
const ctrl        = require("../controllers/user.controller");
const authMw      = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { requireSuperAdmin } = require("../middleware/role.middleware");

router.use(authMw);

// Any logged-in user
router.get  ("/me/logs",           ctrl.getMyLogs);
router.put  ("/me/password",       ctrl.changeMyPassword);  // User changes own password

// Admin only below
router.use(requireAdmin);
router.get  ("/",                  ctrl.listUsers);
router.post ("/",                  ctrl.createUser);
router.put  ("/:id",               ctrl.updateUser);
router.put  ("/:id/password",      ctrl.changeUserPassword);  // Admin changes user's password
router.delete("/:id",              ctrl.deleteUser);
router.get  ("/logs",              ctrl.getLoginLogs);

// Super admin only
router.post ("/:id/force-logout",  requireSuperAdmin, ctrl.forceLogout);

module.exports = router;
