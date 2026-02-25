const twilio   = require("twilio");
const CallLog  = require("../models/CallLog");
const VoiceResponse = twilio.twiml.VoiceResponse;

// ─── Twilio credentials from .env ─────────────────────────────────────────────
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_API_KEY      = process.env.TWILIO_API_KEY;
const TWILIO_API_SECRET   = process.env.TWILIO_API_SECRET;
const TWILIO_TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

/**
 * Check if Twilio is configured
 */
function isTwilioConfigured() {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_API_KEY && TWILIO_API_SECRET && TWILIO_TWIML_APP_SID);
}

// ─── Generate Twilio Access Token (for browser SDK) ───────────────────────────
// POST /api/twilio/token
exports.getToken = (req, res) => {
  if (!isTwilioConfigured()) {
    return res.status(503).json({ error: "Twilio not configured" });
  }

  try {
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant  = AccessToken.VoiceGrant;

    // Identity = logged-in user's unique identifier
    const identity = `agent_${req.user.id}`;

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: TWILIO_TWIML_APP_SID,
      incomingAllow: true, // Allow incoming calls to this browser
    });

    const token = new AccessToken(
      TWILIO_ACCOUNT_SID,
      TWILIO_API_KEY,
      TWILIO_API_SECRET,
      {
        identity: identity,
        ttl: 3600, // 1 hour
      }
    );

    token.addGrant(voiceGrant);

    res.json({
      token: token.toJwt(),
      identity: identity,
      phoneNumber: TWILIO_PHONE_NUMBER || null,
    });
  } catch (err) {
    console.error("Twilio token error:", err);
    res.status(500).json({ error: "Failed to generate token" });
  }
};

// ─── Twilio Voice Webhook — Incoming Call ─────────────────────────────────────
// POST /api/twilio/voice
// Twilio hits this URL when someone calls your Twilio number.
// We respond with TwiML that connects the call to the browser via <Client>.
exports.voiceIncoming = async (req, res) => {
  try {
    const callSid    = req.body.CallSid;
    const fromNumber = req.body.From || "Unknown";
    const toNumber   = req.body.To || TWILIO_PHONE_NUMBER || "";
    const direction  = req.body.Direction === "outbound-api" ? "outbound" : "inbound";

    console.log(`📞 [TWILIO] Incoming call: ${fromNumber} → ${toNumber} (SID: ${callSid})`);

    // Save call to database
    try {
      // Check if caller is an existing customer
      const customer = await CallLog.findCustomerByPhone(fromNumber);

      await CallLog.create({
        call_sid:    callSid,
        from_number: fromNumber,
        to_number:   toNumber,
        direction:   direction,
        call_status: "ringing",
        customer_id: customer?.id || null,
      });
    } catch (dbErr) {
      console.error("❌ Failed to save call log:", dbErr.message);
      // Continue — don't block the call
    }

    // Build TwiML response — ring ALL logged-in agents in the browser
    const twiml = new VoiceResponse();

    // Play a brief ringing tone while connecting
    const dial = twiml.dial({
      callerId: fromNumber,
      timeout: 30,          // Ring for 30 seconds
      record: "record-from-answer-dual", // Record both legs after answer
      recordingStatusCallback: `${process.env.CRM_URL || "https://crm.techsupport4.com"}/api/twilio/recording`,
      recordingStatusCallbackMethod: "POST",
      action: `${process.env.CRM_URL || "https://crm.techsupport4.com"}/api/twilio/call-complete`,
      method: "POST",
    });

    // Connect to ALL agents via browser (Twilio Client)
    // Each agent's Twilio Device is identified by identity "agent_{userId}"
    // For now, ring a general "support" client — all logged-in agents get it
    dial.client("support_line");

    res.type("text/xml");
    res.send(twiml.toString());
  } catch (err) {
    console.error("Voice webhook error:", err);
    const twiml = new VoiceResponse();
    twiml.say("We are currently experiencing technical difficulties. Please try again later.");
    res.type("text/xml");
    res.send(twiml.toString());
  }
};

// ─── Call Status Webhook ──────────────────────────────────────────────────────
// POST /api/twilio/status
// Twilio sends updates here as call status changes
exports.callStatus = async (req, res) => {
  try {
    const {
      CallSid,
      CallStatus,
      CallDuration,
      From,
      To,
      Direction,
    } = req.body;

    console.log(`📞 [TWILIO STATUS] SID: ${CallSid} → ${CallStatus} (Duration: ${CallDuration || 0}s)`);

    if (!CallSid) return res.sendStatus(200);

    const updates = {
      call_status: CallStatus || "unknown",
    };

    if (CallDuration) {
      updates.call_duration = parseInt(CallDuration) || 0;
    }

    // Mark end time for completed/no-answer/busy/failed/canceled
    const terminalStatuses = ["completed", "no-answer", "busy", "failed", "canceled"];
    if (terminalStatuses.includes(CallStatus)) {
      updates.ended_at = new Date().toISOString().slice(0, 19).replace("T", " ");
    }

    // Try to update existing record, or create if doesn't exist
    const existing = await CallLog.findByCallSid(CallSid);
    if (existing) {
      await CallLog.updateByCallSid(CallSid, updates);
    } else {
      await CallLog.create({
        call_sid:    CallSid,
        from_number: From || "Unknown",
        to_number:   To || "",
        direction:   Direction === "outbound-api" ? "outbound" : "inbound",
        call_status: CallStatus || "unknown",
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Status webhook error:", err);
    res.sendStatus(200); // Always 200 so Twilio doesn't retry
  }
};

// ─── Call Complete (Dial action URL) ──────────────────────────────────────────
// POST /api/twilio/call-complete
exports.callComplete = async (req, res) => {
  try {
    const { CallSid, DialCallStatus, DialCallDuration, RecordingUrl } = req.body;

    console.log(`📞 [TWILIO COMPLETE] SID: ${CallSid} → ${DialCallStatus}`);

    if (CallSid) {
      const updates = {
        call_status:   DialCallStatus || "completed",
        call_duration: parseInt(DialCallDuration) || 0,
        ended_at:      new Date().toISOString().slice(0, 19).replace("T", " "),
      };

      if (RecordingUrl) {
        updates.recording_url = RecordingUrl;
      }

      await CallLog.updateByCallSid(CallSid, updates);
    }

    // After dial completes, hang up
    const twiml = new VoiceResponse();
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
  } catch (err) {
    console.error("Call complete error:", err);
    const twiml = new VoiceResponse();
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
  }
};

// ─── Recording Status Webhook ─────────────────────────────────────────────────
// POST /api/twilio/recording
exports.recordingStatus = async (req, res) => {
  try {
    const { CallSid, RecordingUrl, RecordingSid, RecordingStatus, RecordingDuration } = req.body;

    console.log(`🎙️ [RECORDING] SID: ${CallSid} → ${RecordingStatus} (${RecordingDuration}s)`);

    if (CallSid && RecordingUrl && RecordingStatus === "completed") {
      await CallLog.updateByCallSid(CallSid, {
        recording_url: RecordingUrl,
        recording_sid: RecordingSid || null,
        call_duration: parseInt(RecordingDuration) || 0,
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Recording webhook error:", err);
    res.sendStatus(200);
  }
};

// ─── List Call Logs (CRM API) ─────────────────────────────────────────────────
// GET /api/twilio/calls
exports.listCalls = async (req, res) => {
  try {
    const { search, status, direction, page, limit } = req.query;
    const data = await CallLog.listAll({
      search,
      status,
      direction,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });
    res.json(data);
  } catch (err) {
    console.error("listCalls error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ─── Call Stats ───────────────────────────────────────────────────────────────
// GET /api/twilio/stats
exports.callStats = async (_req, res) => {
  try {
    const data = await CallLog.stats();
    res.json(data);
  } catch (err) {
    console.error("callStats error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ─── Mark call as answered by agent ───────────────────────────────────────────
// PUT /api/twilio/calls/:callSid/answer
exports.answerCall = async (req, res) => {
  try {
    const { callSid } = req.params;
    const log = await CallLog.findByCallSid(callSid);
    if (!log) return res.status(404).json({ error: "Call not found" });

    await CallLog.updateByCallSid(callSid, {
      answered_by: req.user.id,
      call_status: "in-progress",
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("answerCall error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ─── Add notes to a call log ──────────────────────────────────────────────────
// PUT /api/twilio/calls/:callSid/notes
exports.addCallNote = async (req, res) => {
  try {
    const { callSid } = req.params;
    const { notes } = req.body;
    if (!notes) return res.status(400).json({ error: "notes required" });

    const log = await CallLog.findByCallSid(callSid);
    if (!log) return res.status(404).json({ error: "Call not found" });

    await CallLog.updateByCallSid(callSid, { notes });
    res.json({ ok: true });
  } catch (err) {
    console.error("addCallNote error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ─── Link call to a case ──────────────────────────────────────────────────────
// PUT /api/twilio/calls/:callSid/link-case
exports.linkCase = async (req, res) => {
  try {
    const { callSid } = req.params;
    const { case_id } = req.body;

    const log = await CallLog.findByCallSid(callSid);
    if (!log) return res.status(404).json({ error: "Call not found" });

    await CallLog.updateByCallSid(callSid, { case_id: case_id || null });
    res.json({ ok: true });
  } catch (err) {
    console.error("linkCase error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ─── Get single call detail ──────────────────────────────────────────────────
// GET /api/twilio/calls/:callSid
exports.getCall = async (req, res) => {
  try {
    const log = await CallLog.findByCallSid(req.params.callSid);
    if (!log) return res.status(404).json({ error: "Call not found" });
    res.json(log);
  } catch (err) {
    console.error("getCall error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ─── Twilio Config Status ────────────────────────────────────────────────────
// GET /api/twilio/config-status
exports.configStatus = (_req, res) => {
  res.json({
    configured: isTwilioConfigured(),
    hasPhoneNumber: !!TWILIO_PHONE_NUMBER,
    phoneNumber: TWILIO_PHONE_NUMBER ? TWILIO_PHONE_NUMBER.replace(/.(?=.{4})/g, "*") : null,
  });
};
