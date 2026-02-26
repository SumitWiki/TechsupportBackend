const router = require("express").Router();
const auth = require("../middleware/auth.middleware");
const ctrl = require("../controllers/notification.controller");

// All notification routes require authentication
router.use(auth);

router.get("/",          ctrl.list);
router.get("/count",     ctrl.countUnread);
router.put("/:id/read",  ctrl.markRead);
router.put("/read-all",  ctrl.markAllRead);

module.exports = router;
