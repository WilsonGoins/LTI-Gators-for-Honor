-- ============================================================
-- Migration: Initial schema for quiz + SEB configuration tables
-- ============================================================

-- 1. Base quizzes table
--    Upserted every time we fetch from Canvas.
--    Stores just enough metadata to display in the dashboard
--    without re-calling Canvas.
-- ============================================================
CREATE TABLE IF NOT EXISTS quizzes (
  course_id   TEXT    NOT NULL,
  quiz_id     TEXT    NOT NULL,

  -- Canvas metadata (updated on every upsert)
  title       TEXT    NOT NULL DEFAULT 'Untitled Quiz',
  quiz_type   TEXT    NOT NULL DEFAULT 'classic',   -- 'classic' | 'new'

  -- Timestamps
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (course_id, quiz_id)
);


-- 2. SEB configuration files
--    One row per quiz. Inserted when the instructor completes
--    the SEB wizard and a .seb file is generated.
--    The file itself is stored as raw bytes.
-- ============================================================
CREATE TABLE IF NOT EXISTS seb_config_files (
  course_id       TEXT    NOT NULL,
  quiz_id         TEXT    NOT NULL,

  -- The generated .seb binary
  file_name       TEXT    NOT NULL,            -- e.g. 'Midterm_Exam_SEB_Config.seb'
  file_data       BYTEA   NOT NULL,            -- raw .seb file contents
  config_key      TEXT,                         -- SHA-256 config key hex string
  file_link       TEXT,                         -- URL for downloading the .seb file from Canvas

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (course_id, quiz_id),
  FOREIGN KEY (course_id, quiz_id)
    REFERENCES quizzes (course_id, quiz_id)
    ON DELETE CASCADE
);


-- 3. SEB security settings
--    One row per quiz. Stores the individual settings the
--    instructor selected in the wizard. Column list will grow
--    as we finalize which settings the UI exposes.
--
--    Every column beyond the PK is nullable so we can insert
--    a bare row during the Canvas upsert and fill settings later.
-- ============================================================
CREATE TABLE IF NOT EXISTS seb_settings (
  course_id               TEXT    NOT NULL,
  quiz_id                 TEXT    NOT NULL,

  -- Browser controls
  force_fullscreen        BOOLEAN,
  allow_quit              BOOLEAN,
  quit_password      TEXT,       -- proctor exit password

  -- System restrictions
  block_screen_sharing    BOOLEAN,
  block_virtual_machine   BOOLEAN,
  block_clipboard         BOOLEAN,
  block_printing          BOOLEAN,
  disable_spell_check     BOOLEAN,

  -- Network controls
  enable_url_filter       BOOLEAN,
  allowed_url_patterns    JSONB,     -- e.g. ["canvas.ufl.edu/*", "*.instructure.com/*"]

  -- Access control
  access_code             TEXT,
  ip_filter_enabled       BOOLEAN,
  allowed_ip_ranges       JSONB,     -- e.g. ["192.168.1.0/24"]

  -- Preset that was selected (if any)
  preset_name             TEXT,       -- 'standard' | 'high_security' | 'open_book' | 'testing_center' | null

  -- Timestamps
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (course_id, quiz_id),
  FOREIGN KEY (course_id, quiz_id)
    REFERENCES quizzes (course_id, quiz_id)
    ON DELETE CASCADE
);


-- ============================================================
-- Helper: auto-update updated_at on row changes
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_quizzes_updated_at
  BEFORE UPDATE ON quizzes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_seb_config_files_updated_at
  BEFORE UPDATE ON seb_config_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_seb_settings_updated_at
  BEFORE UPDATE ON seb_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
