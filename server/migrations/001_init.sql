-- SafeRoute schema (MySQL 8.0.16+, InnoDB, utf8mb4). Run MySQL in UTC: default-time-zone='+00:00'.

-- ───────── Identity ─────────
CREATE TABLE users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,                       -- argon2id
  display_name  VARCHAR(100) NOT NULL,
  role          ENUM('user','moderator','admin') NOT NULL DEFAULT 'user',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE refresh_tokens (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,                       -- sha256 of the opaque token
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Replaces the hardcoded Mom / Riya / Warden
CREATE TABLE trusted_contacts (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT UNSIGNED NOT NULL,
  name              VARCHAR(100) NOT NULL,
  relationship      VARCHAR(50) NULL,                        -- 'Parent', 'Friend', 'Hostel warden'
  phone_e164        VARCHAR(16) NULL,
  email             VARCHAR(255) NULL,
  default_selected  TINYINT(1) NOT NULL DEFAULT 0,           -- pre-ticked in Safe Walk, used by SOS
  verified_at       DATETIME NULL,                           -- contact consented via a code
  verify_code_hash  CHAR(64) NULL,
  verify_expires_at DATETIME NULL,
  verify_attempts   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_phone (user_id, phone_e164),
  UNIQUE KEY uq_user_email (user_id, email),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL)
) ENGINE=InnoDB;

-- ───────── Map & routing data ─────────
CREATE TABLE map_nodes (
  id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code      VARCHAR(40) NOT NULL UNIQUE,
  name      VARCHAR(120) NULL,
  node_type ENUM('landmark','waypoint','junction') NOT NULL DEFAULT 'waypoint',
  lat       DECIMAL(9,6) NOT NULL,
  lng       DECIMAL(9,6) NOT NULL,
  KEY idx_geo (lat, lng)
) ENGINE=InnoDB;

CREATE TABLE travel_modes (                                  -- prototype object M
  id        TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code      VARCHAR(20) NOT NULL UNIQUE,
  label     VARCHAR(40) NOT NULL,
  speed_kmh DECIMAL(4,1) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE time_slots (                                    -- prototype arrays W and TT
  id          TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20) NOT NULL UNIQUE,
  label       VARCHAR(40) NOT NULL,
  start_hour  TINYINT UNSIGNED NOT NULL,                     -- only used to pick a default slot from the clock
  end_hour    TINYINT UNSIGNED NOT NULL,                     -- start > end means the slot wraps past midnight
  w_lighting  DECIMAL(3,2) NOT NULL,
  w_activity  DECIMAL(3,2) NOT NULL,
  w_help      DECIMAL(3,2) NOT NULL,
  w_reports   DECIMAL(3,2) NOT NULL,
  CHECK (w_lighting + w_activity + w_help + w_reports = 1.00)
) ENGINE=InnoDB;

CREATE TABLE routes (                                        -- prototype object R (one row per candidate route)
  id                  SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code                VARCHAR(20) NOT NULL,                  -- fastest | balanced | safest
  label               VARCHAR(40) NOT NULL,
  area_name           VARCHAR(80) NOT NULL,                  -- 'Market lane', shown in reports and insights
  origin_node_id      BIGINT UNSIGNED NOT NULL,
  destination_node_id BIGINT UNSIGNED NOT NULL,
  distance_km         DECIMAL(5,2) NOT NULL,
  base_report_score   TINYINT UNSIGNED NOT NULL DEFAULT 100, -- prototype f.r
  sort_order          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_pair_code (origin_node_id, destination_node_id, code),
  FOREIGN KEY (origin_node_id)      REFERENCES map_nodes(id),
  FOREIGN KEY (destination_node_id) REFERENCES map_nodes(id)
) ENGINE=InnoDB;

CREATE TABLE route_waypoints (                               -- prototype p (the drawn path)
  route_id SMALLINT UNSIGNED NOT NULL,
  seq      SMALLINT UNSIGNED NOT NULL,
  node_id  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (route_id, seq),
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  FOREIGN KEY (node_id)  REFERENCES map_nodes(id)
) ENGINE=InnoDB;

CREATE TABLE route_time_profiles (                           -- prototype f.l[t], f.a[t], f.h[t]
  route_id     SMALLINT UNSIGNED NOT NULL,
  time_slot_id TINYINT UNSIGNED NOT NULL,
  lighting     TINYINT UNSIGNED NOT NULL,
  activity     TINYINT UNSIGNED NOT NULL,
  help         TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (route_id, time_slot_id),
  FOREIGN KEY (route_id)     REFERENCES routes(id) ON DELETE CASCADE,
  FOREIGN KEY (time_slot_id) REFERENCES time_slots(id),
  CHECK (lighting <= 100 AND activity <= 100 AND help <= 100)
) ENGINE=InnoDB;

CREATE TABLE help_points (                                   -- prototype array HP
  id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type      ENUM('security_booth','medical_point','help_desk') NOT NULL,
  name      VARCHAR(120) NOT NULL,
  lat       DECIMAL(9,6) NOT NULL,
  lng       DECIMAL(9,6) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_geo (lat, lng)
) ENGINE=InnoDB;

-- ───────── Community reports ─────────
CREATE TABLE reports (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  route_id        SMALLINT UNSIGNED NOT NULL,                -- the prototype's "Where" picker is a route/area
  category        ENUM('broken_light','unsafe_path','harassment_concern','hazard') NOT NULL,
  description     VARCHAR(140) NOT NULL,                     -- plain text; prototype textarea maxlength is 140
  lat             DECIMAL(9,6) NULL,                         -- optional pin; the map falls back to a point on the route
  lng             DECIMAL(9,6) NULL,
  status          ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  moderated_by    BIGINT UNSIGNED NULL,
  moderated_at    DATETIME NULL,
  moderation_note VARCHAR(255) NULL,
  resolved_at     DATETIME NULL,                             -- fixed by facilities; stops lowering the score
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)      REFERENCES users(id),
  FOREIGN KEY (moderated_by) REFERENCES users(id),
  FOREIGN KEY (route_id)     REFERENCES routes(id),
  KEY idx_queue (status, created_at),
  KEY idx_rate  (user_id, created_at),
  KEY idx_route (route_id, status, resolved_at)
) ENGINE=InnoDB;

-- ───────── Safe Walk (data-minimised: latest position only, no trail) ─────────
CREATE TABLE safe_walk_sessions (
  id                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                BIGINT UNSIGNED NOT NULL,
  route_id               SMALLINT UNSIGNED NOT NULL,
  status                 ENUM('active','arrived','stopped','expired') NOT NULL DEFAULT 'active',
  duration_min           SMALLINT UNSIGNED NOT NULL,
  share_token_hash       CHAR(64) NOT NULL UNIQUE,
  last_lat               DECIMAL(9,6) NULL,
  last_lng               DECIMAL(9,6) NULL,
  last_accuracy_m        SMALLINT UNSIGNED NULL,
  last_seen_at           DATETIME NULL,
  destination_reached_at DATETIME NULL,
  last_checkin_at        DATETIME NULL,
  next_checkin_due_at    DATETIME NULL,
  missed_notified_at     DATETIME NULL,
  started_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at             DATETIME NOT NULL,
  ended_at               DATETIME NULL,
  active_user_id BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', user_id, NULL)) STORED,
  UNIQUE KEY uq_one_active_walk (active_user_id),            -- at most one active walk per user
  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (route_id) REFERENCES routes(id),
  KEY idx_sweep (status, expires_at),
  CHECK (duration_min IN (30, 60, 90))
) ENGINE=InnoDB;

CREATE TABLE safe_walk_contacts (
  session_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (session_id, contact_id),
  FOREIGN KEY (session_id) REFERENCES safe_walk_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id)   ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE safe_walk_events (                              -- the "What your contacts see" log; holds no coordinates
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('started','check_in','destination_reached','arrived','missed_check_in','stopped','expired') NOT NULL,
  message    VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES safe_walk_sessions(id) ON DELETE CASCADE,
  KEY idx_session (session_id, id)
) ENGINE=InnoDB;

-- ───────── SOS ─────────
CREATE TABLE sos_events (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT UNSIGNED NOT NULL,
  idempotency_key  CHAR(36) NOT NULL,                        -- client UUID: retries cannot double-fire
  status           ENUM('active','resolved') NOT NULL DEFAULT 'active',
  share_token_hash CHAR(64) NOT NULL UNIQUE,
  last_lat         DECIMAL(9,6) NULL,
  last_lng         DECIMAL(9,6) NULL,
  last_accuracy_m  SMALLINT UNSIGNED NULL,
  last_seen_at     DATETIME NULL,
  triggered_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at         DATETIME NULL,
  UNIQUE KEY uq_idem (user_id, idempotency_key),
  FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id) 
) ENGINE=InnoDB;

-- ───────── Notification outbox (written in the same transaction as the event) ─────────
CREATE TABLE notification_outbox (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind           ENUM('contact_verify','safe_walk_started','safe_walk_arrived','safe_walk_missed','sos') NOT NULL,
  recipient_type ENUM('contact','campus_security') NOT NULL,
  contact_id     BIGINT UNSIGNED NULL,
  channel        ENUM('sms','email') NOT NULL,
  body           TEXT NULL,                                  -- cleared once sent (it can contain a live-location link)
  status         ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued',
  attempts       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error     VARCHAR(255) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at        DATETIME NULL,
  FOREIGN KEY (contact_id) REFERENCES trusted_contacts(id) ON DELETE CASCADE,
  KEY idx_queue (status, id)
) ENGINE=InnoDB;
