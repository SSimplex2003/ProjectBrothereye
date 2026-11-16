-- BrotherEye Activity Tracking and Dashboard Tables
-- This migration adds the missing tables for activity tracking and dashboard widgets

-- A) activity_state - Current state of all workers (real-time tracking)
CREATE TABLE IF NOT EXISTS activity_state (
  id SERIAL PRIMARY KEY,
  worker_name TEXT NOT NULL UNIQUE,
  last_activity TEXT NULL,
  last_start_time TIMESTAMPTZ NULL,
  last_seen_time TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- B) activity_logs - Historical activity records
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  worker_name TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NULL,
  duration_seconds INT NULL,
  station_id INT NULL REFERENCES stations(id) ON DELETE SET NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- C) dashboard_widgets - User dashboard configuration
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_state_worker ON activity_state(worker_name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_worker ON activity_logs(worker_name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_start_time ON activity_logs(start_time);
CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_type ON activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_user ON dashboard_widgets(user_id);

COMMENT ON TABLE activity_state IS 'Current real-time state of all workers';
COMMENT ON TABLE activity_logs IS 'Historical log of all worker activities';
COMMENT ON TABLE dashboard_widgets IS 'User dashboard widget configurations';

-- Insert default shifts if none exist
INSERT INTO shifts (shift_name, start_time, end_time)
SELECT * FROM (VALUES
  ('Morning', '06:00:00'::TIME, '14:00:00'::TIME),
  ('Afternoon', '14:00:00'::TIME, '22:00:00'::TIME),
  ('Night', '22:00:00'::TIME, '06:00:00'::TIME)
) AS v(shift_name, start_time, end_time)
WHERE NOT EXISTS (SELECT 1 FROM shifts LIMIT 1);
