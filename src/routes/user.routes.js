const router      = require("express").Router();
const ctrl        = require("../controllers/user.controller");
const authMw      = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { requireSuperAdmin } = require("../middleware/role.middleware");
const { createUserRules, changePasswordRules, resetPasswordRules, idParam } = require("../middleware/validate.middleware");

router.use(authMw);

// Any logged-in user
router.get  ("/me/logs",           ctrl.getMyLogs);
router.put  ("/me/password",       changePasswordRules, ctrl.changeMyPassword);

// Admin only below
router.use(requireAdmin);
router.get  ("/",                  ctrl.listUsers);
router.post ("/",                  createUserRules,       ctrl.createUser);
router.put  ("/:id",               idParam,               ctrl.updateUser);
router.put  ("/:id/password",      idParam, resetPasswordRules, ctrl.changeUserPassword);
router.delete("/:id",              idParam,               ctrl.deleteUser);
router.get  ("/logs",              ctrl.getLoginLogs);

// Super admin only
router.post ("/:id/force-logout",  idParam, requireSuperAdmin, ctrl.forceLogout);

module.exports = router;
