-- Dashboard widgets table for storing user widget configurations
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL DEFAULT 'default', -- For now using 'default' until auth is implemented
  page_index INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  widget_type VARCHAR(50) NOT NULL,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_user_id ON dashboard_widgets(user_id);

-- Index for ordering widgets
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_order ON dashboard_widgets(user_id, page_index, position);

-- Insert default widgets for the 'default' user
INSERT INTO dashboard_widgets (user_id, page_index, position, widget_type, config) VALUES
  ('default', 0, 0, 'stats', '{"title": "Factory Stats"}'),
  ('default', 0, 1, 'quick_links', '{"title": "Quick Links"}'),
  ('default', 0, 2, 'alerts_list', '{"title": "Recent Alerts", "limit": 5}'),
  ('default', 0, 3, 'live_operators', '{"title": "Live Operators", "limit": 6}');
