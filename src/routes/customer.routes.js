const router = require("express").Router();
const ctrl   = require("../controllers/customer.controller");
const authMw = require("../middleware/auth.middleware");
const { requirePerm, requireSuperAdmin } = require("../middleware/role.middleware");

router.use(authMw);

router.get  ("/",              requirePerm('read'),   ctrl.listCustomers);
router.get  ("/export",        requirePerm('read'),   ctrl.exportCustomers);
router.get  ("/search",        requirePerm('read'),   ctrl.searchCustomer);
router.get  ("/:id",           requirePerm('read'),   ctrl.getCustomer);
router.post ("/",              requirePerm('write'),  ctrl.addCustomer);
router.put  ("/:id",           requirePerm('modify'), ctrl.updateCustomer);
router.delete("/:id",          requirePerm('delete'), ctrl.deleteCustomer);

// Email sending
router.post ("/:id/email",     requirePerm('write'),  ctrl.sendCustomerEmail);
router.get  ("/:id/emails",    requirePerm('read'),   ctrl.getCustomerEmailLogs);

// Customer notes
router.get  ("/:id/notes",     requirePerm('read'),   ctrl.getCustomerNotes);
router.post ("/:id/notes",     requirePerm('write'),  ctrl.addCustomerNote);

module.exports = router;
