const router = require("express").Router();
const auth   = require("../controllers/auth.controller");
const authMw = require("../middleware/auth.middleware");

router.post("/login",      auth.login);
router.post("/verify-otp", auth.verifyOtp);
router.post("/logout",     authMw, auth.logout);
router.get ("/me",         authMw, auth.me);

module.exports = router;
