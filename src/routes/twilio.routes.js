const router       = require("express").Router();
const ctrl         = require("../controllers/twilio.controller");
const authMw       = require("../middleware/auth.middleware");
const { requirePerm } = require("../middleware/role.middleware");

// ─── PUBLIC Webhook Routes (Twilio hits these — NO auth) ─────────────────────
// These must be accessible without JWT so Twilio can reach them.
// Twilio validates via its own signature mechanism.
router.post("/voice",          ctrl.voiceIncoming);     // Incoming call TwiML
router.post("/status",         ctrl.callStatus);        // Call status updates
router.post("/call-complete",  ctrl.callComplete);      // Dial action callback
router.post("/recording",      ctrl.recordingStatus);   // Recording ready

// ─── PROTECTED Routes (require CRM login) ────────────────────────────────────
router.use(authMw);

router.get ("/token",                        ctrl.getToken);       // Get browser SDK token
router.get ("/config-status",                ctrl.configStatus);   // Check if Twilio configured
router.get ("/calls",          requirePerm("read"),  ctrl.listCalls);      // List all call logs
router.get ("/stats",                        ctrl.callStats);      // Call statistics
router.get ("/calls/:callSid",  requirePerm("read"),  ctrl.getCall);       // Single call detail
router.put ("/calls/:callSid/answer",                ctrl.answerCall);     // Mark call answered
router.put ("/calls/:callSid/notes",  requirePerm("write"), ctrl.addCallNote);   // Add notes
router.put ("/calls/:callSid/link-case", requirePerm("write"), ctrl.linkCase);   // Link to case

module.exports = router;
