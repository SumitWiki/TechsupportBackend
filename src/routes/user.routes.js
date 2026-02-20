const router      = require("express").Router();
const ctrl        = require("../controllers/user.controller");
const authMw      = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

router.use(authMw);

router.get  ("/me/logs",   ctrl.getMyLogs);               // any logged-in user

router.use(requireAdmin);                                  // admin only below
router.get  ("/",          ctrl.listUsers);
router.post ("/",          ctrl.createUser);
router.put  ("/:id",       ctrl.updateUser);
router.delete("/:id",      ctrl.deleteUser);
router.get  ("/logs",      ctrl.getLoginLogs);

module.exports = router;
