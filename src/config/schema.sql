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
  role          ENUM('admin','agent') NOT NULL DEFAULT 'agent',
  permissions   JSON          NOT NULL DEFAULT (JSON_OBJECT('read',true,'write',false,'modify',false,'delete',false)),
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  otp_secret    VARCHAR(100)  NULL,               -- TOTP secret (optional Google Auth)
  created_by    INT UNSIGNED  NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ─── OTP CODES (email-based 2FA) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  otp        VARCHAR(10)  NOT NULL,
  expires_at DATETIME     NOT NULL,
  used       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  status     ENUM('success','failed') NOT NULL DEFAULT 'success',
  logged_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── CUSTOMERS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  email        VARCHAR(150) NOT NULL,
  phone        VARCHAR(20)  NOT NULL,
  address      TEXT         NULL,
  plan         VARCHAR(100) NULL,
  notes        TEXT         NULL,
  created_by   INT UNSIGNED NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_email (email),
  KEY idx_phone (phone)
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
  source       ENUM('contact_form','manual','crm_manual') NOT NULL DEFAULT 'contact_form',
  assigned_to  INT UNSIGNED NULL,
  closed_at    DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_email   (email),
  KEY idx_phone   (phone),
  KEY idx_status  (status),
  KEY idx_assigned (assigned_to),
  KEY idx_customer (customer_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id)     ON DELETE SET NULL
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

-- ─── DEFAULT ADMIN USER ──────────────────────────────────────────────────────
-- Password: Admin@1234  (bcrypt hash — change immediately after first login)
INSERT IGNORE INTO users (name, email, password_hash, role, permissions)
VALUES (
  'Super Admin',
  'support@techsupport4.com',
  '$2a$12$b2ksHikEOTd009WWy0yM0.AurlmG753BmakQlU7gHrIm6nFE0jOIW',
  'admin',
  JSON_OBJECT('read',true,'write',true,'modify',true,'delete',true)
);
