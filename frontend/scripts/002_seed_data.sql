-- BrotherEye Factory Management Seed Data
-- Run this after 001_create_factory_tables.sql

-- Insert 3 shifts (matching common shift naming)
INSERT INTO shifts (shift_name, start_time, end_time) VALUES
  ('Shift 1', '06:00:00', '14:30:00'),
  ('Shift 2', '14:30:00', '22:00:00'),
  ('Shift 3', '22:00:00', '06:00:00')
ON CONFLICT DO NOTHING;

-- Also add alternate shift names for flexibility
INSERT INTO shifts (shift_name, start_time, end_time) VALUES
  ('Morning', '06:00:00', '14:00:00'),
  ('Evening', '14:00:00', '22:00:00'),
  ('Night', '22:00:00', '06:00:00')
ON CONFLICT DO NOTHING;

-- Insert cycle templates
INSERT INTO cycle_templates (station_type, template_name, tolerance_percent) VALUES
  ('Assembly', 'Standard Assembly Cycle', 20),
  ('Assembly', 'Quick Assembly Cycle', 15)
ON CONFLICT DO NOTHING;

-- Insert cycle steps for the Assembly template
INSERT INTO cycle_steps (template_id, step_name, expected_seconds, step_order) VALUES
  ((SELECT id FROM cycle_templates WHERE template_name = 'Standard Assembly Cycle'), 'Pick Parts', 15, 1),
  ((SELECT id FROM cycle_templates WHERE template_name = 'Standard Assembly Cycle'), 'Assemble', 45, 2),
  ((SELECT id FROM cycle_templates WHERE template_name = 'Standard Assembly Cycle'), 'Inspect', 20, 3),
  ((SELECT id FROM cycle_templates WHERE template_name = 'Standard Assembly Cycle'), 'Package', 10, 4)
ON CONFLICT DO NOTHING;

-- Insert default stations with common naming convention (Station 1, Station 2, etc.)
INSERT INTO stations (name, station_type, has_robot, is_active, notes, cycle_template_id) VALUES
  ('Station 1', 'Assembly', FALSE, TRUE, 'Assembly station 1', (SELECT id FROM cycle_templates WHERE template_name = 'Standard Assembly Cycle')),
  ('Station 2', 'Assembly', FALSE, TRUE, 'Assembly station 2', (SELECT id FROM cycle_templates WHERE template_name = 'Standard Assembly Cycle')),
  ('Station 3', 'Assembly', FALSE, TRUE, 'Assembly station 3', (SELECT id FROM cycle_templates WHERE template_name = 'Standard Assembly Cycle')),
  ('Station 4', 'Assembly', FALSE, TRUE, 'Assembly station 4', (SELECT id FROM cycle_templates WHERE template_name = 'Standard Assembly Cycle')),
  ('Station 5', 'Assembly', FALSE, TRUE, 'Assembly station 5', (SELECT id FROM cycle_templates WHERE template_name = 'Standard Assembly Cycle'))
ON CONFLICT (name) DO NOTHING;

-- Also keep the descriptive station names as alternatives
INSERT INTO stations (name, station_type, has_robot, is_active, notes, cycle_template_id) VALUES
  ('Assembly Line A', 'Assembly', FALSE, TRUE, 'Main assembly station for product X', (SELECT id FROM cycle_templates WHERE template_name = 'Standard Assembly Cycle')),
  ('Soldering Station 1', 'Soldering', FALSE, TRUE, 'PCB soldering workstation', NULL)
ON CONFLICT (name) DO NOTHING;

-- Insert default activity step mappings for Assembly
INSERT INTO activity_step_mapping (station_type, activity_type, mapped_step_name) VALUES
  ('Assembly', 'Working', 'Assemble'),
  ('Assembly', 'Moving', 'Pick Parts'),
  ('Assembly', 'Researching', 'Inspect')
ON CONFLICT (station_type, activity_type) DO NOTHING;

-- Create workers table if not exists (for storing known operators)
CREATE TABLE IF NOT EXISTS workers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default operators with common naming
INSERT INTO workers (name, is_active) VALUES
  ('Operator 1', TRUE),
  ('Operator 2', TRUE),
  ('Operator 3', TRUE),
  ('Operator 4', TRUE),
  ('Operator 5', TRUE),
  ('John Smith', TRUE),
  ('Maria Garcia', TRUE),
  ('James Wilson', TRUE),
  ('Sarah Johnson', TRUE),
  ('Michael Brown', TRUE),
  ('Emily Davis', TRUE),
  ('Robert Taylor', TRUE),
  ('Jennifer Martinez', TRUE)
ON CONFLICT (name) DO NOTHING;
