-- BrotherEye Factory Management Tables Migration
-- Run this script to add stations, shifts, planning, cycle templates, and alerts

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

-- B) stations table
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

-- B) shifts table
CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  shift_name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL
);

-- C) station_plan (daily assignments)
CREATE TABLE IF NOT EXISTS station_plan (
  id SERIAL PRIMARY KEY,
  plan_date DATE NOT NULL,
  shift_id INT REFERENCES shifts(id) ON DELETE CASCADE,
  station_id INT REFERENCES stations(id) ON DELETE CASCADE,
  worker_name TEXT NULL,
  UNIQUE(plan_date, shift_id, station_id)
);

-- D) cycle_templates
CREATE TABLE IF NOT EXISTS cycle_templates (
  id SERIAL PRIMARY KEY,
  station_type TEXT NOT NULL,
  template_name TEXT NOT NULL,
  tolerance_percent INT NOT NULL DEFAULT 20
);

-- E) cycle_steps
CREATE TABLE IF NOT EXISTS cycle_steps (
  id SERIAL PRIMARY KEY,
  template_id INT REFERENCES cycle_templates(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  expected_seconds INT NOT NULL,
  step_order INT NOT NULL
);

-- F) activity_step_mapping (optional MVP)
CREATE TABLE IF NOT EXISTS activity_step_mapping (
  id SERIAL PRIMARY KEY,
  station_type TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  mapped_step_name TEXT NOT NULL,
  UNIQUE(station_type, activity_type)
);

-- G) alerts
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

-- Add foreign keys for stations
ALTER TABLE stations 
ADD CONSTRAINT fk_stations_cycle_template 
FOREIGN KEY (cycle_template_id) REFERENCES cycle_templates(id) ON DELETE SET NULL;

ALTER TABLE stations 
ADD CONSTRAINT fk_stations_camera 
FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cameras_mode ON cameras(mode);
CREATE INDEX IF NOT EXISTS idx_stations_camera ON stations(camera_id);
CREATE INDEX IF NOT EXISTS idx_station_plan_date ON station_plan(plan_date);
CREATE INDEX IF NOT EXISTS idx_station_plan_shift ON station_plan(shift_id);
CREATE INDEX IF NOT EXISTS idx_station_plan_station ON station_plan(station_id);
CREATE INDEX IF NOT EXISTS idx_alerts_plan_date ON alerts(plan_date);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_cycle_steps_template ON cycle_steps(template_id);

COMMENT ON TABLE cameras IS 'CCTV cameras for live monitoring of workstations';
COMMENT ON TABLE stations IS 'Factory workstations where operators perform tasks';
COMMENT ON TABLE shifts IS 'Work shift definitions (Morning/Evening/Night)';
COMMENT ON TABLE station_plan IS 'Daily assignment of workers to stations per shift';
COMMENT ON TABLE cycle_templates IS 'Templates defining expected cycle times per station type';
COMMENT ON TABLE cycle_steps IS 'Individual steps within a cycle template';
COMMENT ON TABLE alerts IS 'System alerts for monitoring anomalies';
