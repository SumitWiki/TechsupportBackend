const router = require("express").Router();
const ctrl   = require("../controllers/customer.controller");
const authMw = require("../middleware/auth.middleware");

router.use(authMw);

router.get  ("/",          ctrl.listCustomers);
router.get  ("/search",    ctrl.searchCustomer);
router.get  ("/:id",       ctrl.getCustomer);
router.post ("/",          ctrl.addCustomer);
router.put  ("/:id",       ctrl.updateCustomer);

module.exports = router;
