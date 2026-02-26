const router = require("express").Router();
const auth   = require("../controllers/auth.controller");
const authMw = require("../middleware/auth.middleware");
const { loginRules, otpRules } = require("../middleware/validate.middleware");

router.post("/login",      loginRules, auth.login);
router.post("/verify-otp", otpRules,   auth.verifyOtp);
router.post("/refresh",    auth.refresh);          // No auth middleware — uses refresh cookie
router.post("/logout",     authMw,     auth.logout);
router.get ("/me",         authMw,     auth.me);

module.exports = router;
