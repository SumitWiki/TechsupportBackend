/**
 * Centralized Logger — Winston-based
 * 
 * - Logs to console (dev) + files (production)
 * - Structured JSON format for production
 * - Separate error log file
 * - Security event logging (failed logins, suspicious activity)
 */

const { createLogger, format, transports } = require("winston");
const path = require("path");

const isProduction = process.env.NODE_ENV === "production";

const logger = createLogger({
  level: isProduction ? "info" : "debug",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    isProduction
      ? format.json()
      : format.combine(format.colorize(), format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        }))
  ),
  defaultMeta: { service: "techsupport4-crm" },
  transports: [
    new transports.Console(),
    ...(isProduction
      ? [
          new transports.File({
            filename: path.join(__dirname, "../../logs/error.log"),
            level: "error",
            maxsize: 5 * 1024 * 1024, // 5MB
            maxFiles: 5,
          }),
          new transports.File({
            filename: path.join(__dirname, "../../logs/combined.log"),
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
          }),
          new transports.File({
            filename: path.join(__dirname, "../../logs/security.log"),
            level: "warn",
            maxsize: 5 * 1024 * 1024,
            maxFiles: 10,
          }),
        ]
      : []),
  ],
  // Don't exit on error
  exitOnError: false,
});

/**
 * Log a security event (failed login, brute force, suspicious activity)
 */
logger.security = (message, meta = {}) => {
  logger.warn(message, { category: "SECURITY", ...meta });
};

/**
 * Log an audit event (user actions that modify data)
 */
logger.audit = (message, meta = {}) => {
  logger.info(message, { category: "AUDIT", ...meta });
};

module.exports = logger;
