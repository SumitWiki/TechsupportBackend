/**
 * Input Validation Middleware — express-validator based
 *
 * Centralized validation rules for all API endpoints.
 * Prevents SQL injection, XSS, and malformed input.
 */

const { body, param, query, validationResult } = require("express-validator");

/**
 * Run validation and return 400 with errors if any fail
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

/* ─── Auth validators ─── */
const loginRules = [
  body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("password").isLength({ min: 1 }).withMessage("Password required"),
  validate,
];

const otpRules = [
  body("userId").isInt({ min: 1 }).withMessage("Valid userId required"),
  body("otp").isLength({ min: 4, max: 10 }).isAlphanumeric().withMessage("Valid OTP required"),
  validate,
];

const resendOtpRules = [
  body("userId").isInt({ min: 1 }).withMessage("Valid userId required"),
  validate,
];

/* ─── Case validators ─── */
const contactFormRules = [
  body("name").trim().isLength({ min: 1, max: 150 }).escape().withMessage("Name required (max 150 chars)"),
  body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("phone").trim().isLength({ min: 5, max: 20 }).withMessage("Valid phone required"),
  body("subject").trim().isLength({ min: 1, max: 255 }).escape().withMessage("Subject required (max 255 chars)"),
  body("message").trim().isLength({ min: 1, max: 5000 }).withMessage("Message required (max 5000 chars)"),
  validate,
];

/* ─── User validators ─── */
const createUserRules = [
  body("name").trim().isLength({ min: 1, max: 100 }).escape().withMessage("Name required (max 100 chars)"),
  body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("password")
    .isLength({ min: 8 })
    .matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/)
    .withMessage("Password: min 8 chars, 1 uppercase, 1 number, 1 special char"),
  body("role")
    .optional()
    .isIn(["super_admin", "admin", "user"])
    .withMessage("Invalid role"),
  validate,
];

const changePasswordRules = [
  body("currentPassword").isLength({ min: 1 }).withMessage("Current password required"),
  body("newPassword")
    .isLength({ min: 8 })
    .matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/)
    .withMessage("New password: min 8 chars, 1 uppercase, 1 number, 1 special char"),
  validate,
];

const resetPasswordRules = [
  body("newPassword")
    .isLength({ min: 8 })
    .matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/)
    .withMessage("Password: min 8 chars, 1 uppercase, 1 number, 1 special char"),
  validate,
];

/* ─── Common param validators ─── */
const idParam = [
  param("id").isInt({ min: 1 }).withMessage("Valid numeric ID required"),
  validate,
];

const caseIdParam = [
  param("caseId").isLength({ min: 1, max: 30 }).withMessage("Valid case ID required"),
  validate,
];

/* ─── Query sanitizers for list endpoints ─── */
const paginationRules = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 200 }).toInt(),
  query("search").optional().trim().isLength({ max: 200 }),
  query("status").optional().isIn(["open", "in_progress", "closed", "reopened", ""]),
  validate,
];

module.exports = {
  validate,
  loginRules,
  otpRules,
  resendOtpRules,
  contactFormRules,
  createUserRules,
  changePasswordRules,
  resetPasswordRules,
  idParam,
  caseIdParam,
  paginationRules,
};
