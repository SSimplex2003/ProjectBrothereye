-- BrotherEye Complete Database Schema
-- This migration ensures ALL required tables exist with correct columns

-- =====================================================
-- CORE TABLES
-- =====================================================

-- A) cameras table
CREATE TABLE IF NOT EXISTS cameras (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  location TEXT NULL,
  stream_url TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'mjpeg',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- B) shifts table (must be before stations due to foreign key)
CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  shift_name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL
);

-- C) cycle_templates table (must be before stations due to foreign key)
CREATE TABLE IF NOT EXISTS cycle_templates (
  id SERIAL PRIMARY KEY,
  station_type TEXT NOT NULL,
  template_name TEXT NOT NULL,
  tolerance_percent INT NOT NULL DEFAULT 20
);

-- D) stations table
CREATE TABLE IF NOT EXISTS stations (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  station_type TEXT NOT NULL,
  has_robot BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NULL,
  cycle_template_id INT NULL,
  camera_id INT NULL,
  camera_mode TEXT NOT NULL DEFAULT 'mjpeg',
  camera_stream_url TEXT NULL,
  expected_operator_name TEXT NULL
);

-- E) cycle_steps table
CREATE TABLE IF NOT EXISTS cycle_steps (
  id SERIAL PRIMARY KEY,
  template_id INT REFERENCES cycle_templates(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  expected_seconds INT NOT NULL,
  step_order INT NOT NULL
);

-- F) station_plan (daily assignments)
CREATE TABLE IF NOT EXISTS station_plan (
  id SERIAL PRIMARY KEY,
  plan_date DATE NOT NULL,
  shift_id INT REFERENCES shifts(id) ON DELETE CASCADE,
  station_id INT REFERENCES stations(id) ON DELETE CASCADE,
  worker_name TEXT NULL,
  UNIQUE(plan_date, shift_id, station_id)
);

-- G) activity_step_mapping
CREATE TABLE IF NOT EXISTS activity_step_mapping (
  id SERIAL PRIMARY KEY,
  station_type TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  mapped_step_name TEXT NOT NULL,
  UNIQUE(station_type, activity_type)
);

-- H) alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  plan_date DATE NOT NULL,
  station_id INT REFERENCES stations(id) ON DELETE CASCADE,
  shift_id INT REFERENCES shifts(id) ON DELETE CASCADE,
  worker_name TEXT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- ACTIVITY TRACKING TABLES
-- =====================================================

-- I) activity_state - Current state of all workers (real-time tracking)
CREATE TABLE IF NOT EXISTS activity_state (
  id SERIAL PRIMARY KEY,
  worker_name TEXT NOT NULL UNIQUE,
  last_activity TEXT NULL,
  last_start_time TIMESTAMPTZ NULL,
  last_seen_time TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- J) activity_logs - Historical activity records
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  worker_name TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NULL,
  duration_minutes NUMERIC(10,2) NULL,
  station_id INT NULL REFERENCES stations(id) ON DELETE SET NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- DASHBOARD TABLES
-- =====================================================

-- K) dashboard_widgets - User dashboard configuration
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  page_index INT NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  widget_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- ADD FOREIGN KEYS (only if not exist)
-- =====================================================

DO $$
BEGIN
  -- stations -> cycle_templates
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_stations_cycle_template'
  ) THEN
    ALTER TABLE stations 
    ADD CONSTRAINT fk_stations_cycle_template 
    FOREIGN KEY (cycle_template_id) REFERENCES cycle_templates(id) ON DELETE SET NULL;
  END IF;

  -- stations -> cameras
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_stations_camera'
  ) THEN
    ALTER TABLE stations 
    ADD CONSTRAINT fk_stations_camera 
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- CREATE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_cameras_mode ON cameras(mode);
CREATE INDEX IF NOT EXISTS idx_stations_camera ON stations(camera_id);
CREATE INDEX IF NOT EXISTS idx_stations_active ON stations(is_active);
CREATE INDEX IF NOT EXISTS idx_station_plan_date ON station_plan(plan_date);
CREATE INDEX IF NOT EXISTS idx_station_plan_shift ON station_plan(shift_id);
CREATE INDEX IF NOT EXISTS idx_station_plan_station ON station_plan(station_id);
CREATE INDEX IF NOT EXISTS idx_station_plan_worker ON station_plan(worker_name);
CREATE INDEX IF NOT EXISTS idx_alerts_plan_date ON alerts(plan_date);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_cycle_steps_template ON cycle_steps(template_id);
CREATE INDEX IF NOT EXISTS idx_activity_state_worker ON activity_state(worker_name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_worker ON activity_logs(worker_name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_start_time ON activity_logs(start_time);
CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_type ON activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_user ON dashboard_widgets(user_id);

-- =====================================================
-- INSERT DEFAULT DATA
-- =====================================================

-- Insert default shifts if none exist
INSERT INTO shifts (shift_name, start_time, end_time)
SELECT * FROM (VALUES
  ('Morning', '06:00:00'::TIME, '14:00:00'::TIME),
  ('Afternoon', '14:00:00'::TIME, '22:00:00'::TIME),
  ('Night', '22:00:00'::TIME, '06:00:00'::TIME)
) AS v(shift_name, start_time, end_time)
WHERE NOT EXISTS (SELECT 1 FROM shifts LIMIT 1);

-- Insert default dashboard widgets if none exist
INSERT INTO dashboard_widgets (user_id, page_index, position, widget_type, config)
SELECT * FROM (VALUES
  ('default', 0, 0, 'stats', '{}'::JSONB),
  ('default', 0, 1, 'quick_links', '{}'::JSONB),
  ('default', 0, 2, 'live_operators', '{"limit": 6}'::JSONB),
  ('default', 0, 3, 'alerts_list', '{"limit": 5}'::JSONB)
) AS v(user_id, page_index, position, widget_type, config)
WHERE NOT EXISTS (SELECT 1 FROM dashboard_widgets WHERE user_id = 'default' LIMIT 1);

-- =====================================================
-- TABLE COMMENTS
-- =====================================================

COMMENT ON TABLE cameras IS 'CCTV cameras for live monitoring of workstations';
COMMENT ON TABLE stations IS 'Factory workstations where operators perform tasks';
COMMENT ON TABLE shifts IS 'Work shift definitions (Morning/Afternoon/Night)';
COMMENT ON TABLE station_plan IS 'Daily assignment of workers to stations per shift';
COMMENT ON TABLE cycle_templates IS 'Templates defining expected cycle times per station type';
COMMENT ON TABLE cycle_steps IS 'Individual steps within a cycle template';
COMMENT ON TABLE alerts IS 'System alerts for monitoring anomalies';
COMMENT ON TABLE activity_state IS 'Current real-time state of all workers';
COMMENT ON TABLE activity_logs IS 'Historical log of all worker activities';
COMMENT ON TABLE dashboard_widgets IS 'User dashboard widget configurations';
