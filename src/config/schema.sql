-- =============================================
-- TechSupport4 CRM — MySQL Schema
-- Run: mysql -u root -p < src/config/schema.sql
-- =============================================

CREATE DATABASE IF NOT EXISTS techsupport4_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE techsupport4_crm;

-- ─── USERS (Admins & Staff) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  email         VARCHAR(150)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('super_admin','admin','super_user','simple_user') NOT NULL DEFAULT 'simple_user',
  permissions   JSON          NOT NULL DEFAULT (JSON_OBJECT('read',true,'write',false,'modify',false,'delete',false)),
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  otp_secret    VARCHAR(100)  NULL,               -- TOTP secret (optional Google Auth)
  created_by    INT UNSIGNED  NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ─── OTP CODES (email-based 2FA) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  otp          VARCHAR(10)  NOT NULL,
  expires_at   DATETIME     NOT NULL,
  used         TINYINT(1)   NOT NULL DEFAULT 0,
  last_sent_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_otp_lookup (user_id, used, expires_at)
) ENGINE=InnoDB;

-- ─── OTP ATTEMPT TRACKING (brute-force protection) ───────────────────────────
CREATE TABLE IF NOT EXISTS otp_attempts (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  attempted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_attempts (user_id, attempted_at)
) ENGINE=InnoDB;

-- ─── LOGIN LOGS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_logs (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  ip_address VARCHAR(45)  NOT NULL,
  user_agent TEXT         NULL,
  country    VARCHAR(100) NULL,
  region     VARCHAR(100) NULL,
  city       VARCHAR(100) NULL,
  status     ENUM('success','failed','logout') NOT NULL DEFAULT 'success',
  logged_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── CUSTOMERS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(150) NOT NULL,
  email            VARCHAR(150) NOT NULL,
  phone            VARCHAR(20)  NOT NULL,
  address          TEXT         NULL,
  plan             VARCHAR(100) NULL,
  notes            TEXT         NULL,
  amount           DECIMAL(10,2) NULL DEFAULT NULL,
  paid_amount      DECIMAL(10,2) NULL DEFAULT NULL,
  offer            VARCHAR(255)  NULL DEFAULT NULL,
  validity_months  INT UNSIGNED  NULL DEFAULT NULL COMMENT 'Service validity in months',
  expiry_date      DATE          NULL DEFAULT NULL COMMENT 'Auto-calculated from validity_months',
  created_by       INT UNSIGNED NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_email (email),
  KEY idx_phone (phone)
) ENGINE=InnoDB;

-- ─── CUSTOMER EDIT AUDIT LOGS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_edit_logs (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id   INT UNSIGNED NOT NULL,
  edited_by     INT UNSIGNED NOT NULL,
  action        VARCHAR(50)  NOT NULL DEFAULT 'update',
  field_name    VARCHAR(100) NULL,
  old_value     TEXT         NULL,
  new_value     TEXT         NULL,
  note          TEXT         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (edited_by)   REFERENCES users(id)     ON DELETE CASCADE,
  KEY idx_customer (customer_id),
  KEY idx_edited_by (edited_by),
  KEY idx_created (created_at)
) ENGINE=InnoDB;

-- ─── CUSTOMER MODIFICATION REQUESTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_modification_requests (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT UNSIGNED NOT NULL,
  requested_by    INT UNSIGNED NOT NULL,
  status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  requested_changes JSON NOT NULL,
  reason          TEXT         NULL,
  reviewed_by     INT UNSIGNED NULL,
  reviewed_at     DATETIME     NULL,
  review_note     TEXT         NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id)  REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id)     ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by)  REFERENCES users(id)     ON DELETE SET NULL,
  KEY idx_customer (customer_id),
  KEY idx_status   (status),
  KEY idx_requested_by (requested_by),
  KEY idx_created (created_at)
) ENGINE=InnoDB;

-- ─── CASES / TICKETS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cases (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_id      VARCHAR(30)  NOT NULL UNIQUE,            -- e.g. TS4-20260218-A3F7
  customer_id  INT UNSIGNED NULL,
  name         VARCHAR(150) NOT NULL,
  email        VARCHAR(150) NOT NULL,
  phone        VARCHAR(20)  NOT NULL,
  subject      VARCHAR(255) NOT NULL,
  message      TEXT         NOT NULL,
  status       ENUM('open','in_progress','closed','reopened') NOT NULL DEFAULT 'open',
  priority     ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  source       ENUM('contact_form','manual','crm_manual') NOT NULL DEFAULT 'contact_form',
  assigned_to  INT UNSIGNED NULL,
  created_by   INT UNSIGNED NULL,
  closed_at    DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_email   (email),
  KEY idx_phone   (phone),
  KEY idx_status  (status),
  KEY idx_priority (priority),
  KEY idx_assigned (assigned_to),
  KEY idx_created_by (created_by),
  KEY idx_customer (customer_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id)     ON DELETE SET NULL,
  FOREIGN KEY (created_by)  REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1;

-- ─── CASE NOTES / TIMELINE ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_notes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  note       TEXT         NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── AUDIT LOGS (status change tracking) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  action      VARCHAR(50)  NOT NULL,
  old_status  VARCHAR(30)  NULL,
  new_status  VARCHAR(30)  NOT NULL,
  note        TEXT         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE,
  KEY idx_audit_case (case_id),
  KEY idx_audit_time (created_at)
) ENGINE=InnoDB;

-- ─── CALL LOGS (Twilio Voice SDK) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_logs (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  call_sid       VARCHAR(64)  NOT NULL UNIQUE,
  from_number    VARCHAR(30)  NOT NULL,
  to_number      VARCHAR(30)  NOT NULL,
  direction      ENUM('inbound','outbound') NOT NULL DEFAULT 'inbound',
  call_status    VARCHAR(30)  NOT NULL DEFAULT 'ringing',
  call_duration  INT UNSIGNED NOT NULL DEFAULT 0,
  recording_url  TEXT         NULL,
  recording_sid  VARCHAR(64)  NULL,
  answered_by    INT UNSIGNED NULL,
  customer_id    INT UNSIGNED NULL,
  case_id        INT UNSIGNED NULL,
  notes          TEXT         NULL,
  started_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at       DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (answered_by) REFERENCES users(id)     ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (case_id)     REFERENCES cases(id)     ON DELETE SET NULL,
  KEY idx_call_sid    (call_sid),
  KEY idx_from        (from_number),
  KEY idx_status      (call_status),
  KEY idx_answered_by (answered_by),
  KEY idx_started     (started_at)
) ENGINE=InnoDB;

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED   NULL COMMENT 'NULL = broadcast to all',
  type        VARCHAR(50)    NOT NULL DEFAULT 'info',
  title       VARCHAR(255)   NOT NULL,
  message     TEXT           NULL,
  link        VARCHAR(500)   NULL,
  is_read     TINYINT(1)     NOT NULL DEFAULT 0,
  created_at  TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_read (user_id, is_read),
  INDEX idx_created   (created_at)
) ENGINE=InnoDB;

-- ─── DEFAULT ADMIN USER ──────────────────────────────────────────────────────
-- Password: Admin@1234  (bcrypt hash — change immediately after first login)
INSERT IGNORE INTO users (name, email, password_hash, role, permissions)
VALUES (
  'Super Admin',
  'support@techsupport4.com',
  '$2a$12$b2ksHikEOTd009WWy0yM0.AurlmG753BmakQlU7gHrIm6nFE0jOIW',
  'super_admin',
  JSON_OBJECT('read',true,'write',true,'modify',true,'delete',true)
);
