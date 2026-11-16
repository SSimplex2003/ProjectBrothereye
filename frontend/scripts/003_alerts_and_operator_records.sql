-- Enhanced Alerts and Operator Records Migration
-- This script adds operator performance tracking and enhanced alert capabilities

-- A) Add show_stream column to stations if not exists
ALTER TABLE stations ADD COLUMN IF NOT EXISTS show_stream BOOLEAN DEFAULT FALSE;

-- B) Create operator_records table for tracking performance metrics
CREATE TABLE IF NOT EXISTS operator_records (
  id SERIAL PRIMARY KEY,
  worker_name TEXT NOT NULL,
  station_id INT REFERENCES stations(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('fastest_cycle', 'most_cycles_day', 'best_efficiency', 'longest_streak')),
  record_value NUMERIC NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  previous_value NUMERIC NULL,
  shift_id INT REFERENCES shifts(id) ON DELETE SET NULL,
  notes TEXT NULL,
  UNIQUE(worker_name, station_id, record_type)
);

-- C) Create operator_shifts table to track actual work time (clock in/out)
CREATE TABLE IF NOT EXISTS operator_shifts (
  id SERIAL PRIMARY KEY,
  worker_name TEXT NOT NULL,
  plan_date DATE NOT NULL,
  shift_id INT REFERENCES shifts(id) ON DELETE CASCADE,
  station_id INT REFERENCES stations(id) ON DELETE SET NULL,
  clock_in TIMESTAMPTZ NULL,
  clock_out TIMESTAMPTZ NULL,
  planned_start TIMESTAMPTZ NOT NULL,
  planned_end TIMESTAMPTZ NOT NULL,
  actual_work_minutes INT DEFAULT 0,
  actual_break_minutes INT DEFAULT 0,
  total_cycles INT DEFAULT 0,
  avg_cycle_seconds NUMERIC NULL,
  fastest_cycle_seconds NUMERIC NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'absent', 'overtime')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(worker_name, plan_date, shift_id)
);

-- D) Add extra columns to alerts for richer context
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_by TEXT NULL;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS related_record_id INT NULL;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS threshold_value NUMERIC NULL;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS actual_value NUMERIC NULL;

-- E) Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_operator_records_worker ON operator_records(worker_name);
CREATE INDEX IF NOT EXISTS idx_operator_records_station ON operator_records(station_id);
CREATE INDEX IF NOT EXISTS idx_operator_records_type ON operator_records(record_type);
CREATE INDEX IF NOT EXISTS idx_operator_shifts_worker ON operator_shifts(worker_name);
CREATE INDEX IF NOT EXISTS idx_operator_shifts_date ON operator_shifts(plan_date);
CREATE INDEX IF NOT EXISTS idx_operator_shifts_status ON operator_shifts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_worker ON alerts(worker_name);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);

-- F) Add comments
COMMENT ON TABLE operator_records IS 'Tracks operator performance records (fastest cycle, most cycles, etc.)';
COMMENT ON TABLE operator_shifts IS 'Tracks actual operator shift data including work time, breaks, and performance';
COMMENT ON COLUMN alerts.threshold_value IS 'The threshold that was exceeded to trigger the alert';
COMMENT ON COLUMN alerts.actual_value IS 'The actual measured value that triggered the alert';
