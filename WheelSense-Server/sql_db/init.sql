-- WheelSense Database Schema
-- Optimized for ESP32 Mesh Network Data Structure
-- Created: 2025-10-23

-- Clean start
DROP TABLE IF EXISTS device_labels CASCADE;
DROP TABLE IF EXISTS sensor_data CASCADE;
DROP TABLE IF EXISTS map_layout CASCADE;
DROP TABLE IF EXISTS system_events CASCADE;

-- ============================================
-- Main sensor data table
-- Stores telemetry from wheelchair sensors
-- ============================================
CREATE TABLE sensor_data (
  id BIGSERIAL PRIMARY KEY,
  
  -- Device identifiers (matches ESP32 format)
  node INTEGER NOT NULL,
  wheel INTEGER NOT NULL,
  
  -- Sensor readings
  distance DOUBLE PRECISION,        -- Distance in meters from ultrasonic sensor
  status INTEGER,                   -- Device status code
  motion INTEGER,                   -- Motion detected (0=no, 1=yes)
  direction INTEGER,                -- Movement direction
  rssi INTEGER,                     -- Signal strength in dBm
  stale BOOLEAN DEFAULT FALSE,      -- Data freshness flag
  
  -- Timestamps
  ts TIMESTAMPTZ,                   -- Event timestamp from ESP32
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- Server receipt timestamp
  
  -- Mesh network metadata
  route_recovered BOOLEAN DEFAULT FALSE,
  route_latency_ms INTEGER,
  route_recovery_ms INTEGER,
  route_path JSONB DEFAULT '[]'::jsonb,
  
  -- Raw data backup
  raw JSONB DEFAULT '{}'::jsonb,
  
  -- Unique constraint: one current reading per node-wheel pair
  CONSTRAINT unique_node_wheel UNIQUE (node, wheel)
);

-- Indexes for fast queries
CREATE INDEX idx_sensor_node ON sensor_data (node);
CREATE INDEX idx_sensor_wheel ON sensor_data (wheel);
CREATE INDEX idx_sensor_node_wheel ON sensor_data (node, wheel);
CREATE INDEX idx_sensor_ts ON sensor_data (ts DESC);
CREATE INDEX idx_sensor_received ON sensor_data (received_at DESC);
CREATE INDEX idx_sensor_stale ON sensor_data (stale) WHERE stale = FALSE;
CREATE INDEX idx_sensor_motion ON sensor_data (motion) WHERE motion = 1;

-- ============================================
-- Device labels table
-- Stores custom names for nodes and wheelchairs
-- ============================================
CREATE TABLE device_labels (
  node INTEGER NOT NULL,
  wheel INTEGER NOT NULL,
  node_label TEXT,                  -- Custom name for node (e.g., "Room 301")
  wheel_label TEXT,                 -- Custom name for wheelchair (e.g., "Wheelchair A")
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (node, wheel)
);

CREATE INDEX idx_labels_node ON device_labels (node);
CREATE INDEX idx_labels_wheel ON device_labels (wheel);

-- ============================================
-- Map layout table
-- Stores 2D positions of nodes for visualization
-- ============================================
CREATE TABLE map_layout (
  node INTEGER PRIMARY KEY,
  node_name TEXT,
  x_pos INTEGER NOT NULL DEFAULT 0,
  y_pos INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- System events table
-- Stores important system events for monitoring
-- ============================================
CREATE TABLE system_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,         -- 'route_change', 'device_online', 'device_offline', etc.
  node INTEGER,
  wheel INTEGER,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_type ON system_events (event_type);
CREATE INDEX idx_events_node ON system_events (node);
CREATE INDEX idx_events_created ON system_events (created_at DESC);

-- ============================================
-- Historical data table (optional, for analytics)
-- Stores time-series data for trend analysis
-- ============================================
CREATE TABLE sensor_history (
  id BIGSERIAL PRIMARY KEY,
  node INTEGER NOT NULL,
  wheel INTEGER NOT NULL,
  distance DOUBLE PRECISION,
  rssi INTEGER,
  motion INTEGER,
  ts TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partition by time for better performance (optional)
CREATE INDEX idx_history_node_wheel_ts ON sensor_history (node, wheel, ts DESC);
CREATE INDEX idx_history_ts ON sensor_history (ts DESC);

-- ============================================
-- Functions and Triggers
-- ============================================

-- Function to archive sensor data to history before update
CREATE OR REPLACE FUNCTION archive_sensor_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Only archive if there's actual data change
  IF OLD.distance IS DISTINCT FROM NEW.distance 
     OR OLD.rssi IS DISTINCT FROM NEW.rssi 
     OR OLD.motion IS DISTINCT FROM NEW.motion THEN
    INSERT INTO sensor_history (node, wheel, distance, rssi, motion, ts, received_at)
    VALUES (OLD.node, OLD.wheel, OLD.distance, OLD.rssi, OLD.motion, OLD.ts, OLD.received_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically archive on update
CREATE TRIGGER trigger_archive_sensor_data
  BEFORE UPDATE ON sensor_data
  FOR EACH ROW
  EXECUTE FUNCTION archive_sensor_data();

-- Function to detect route changes and log events
CREATE OR REPLACE FUNCTION log_route_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.route_recovered = TRUE THEN
    INSERT INTO system_events (event_type, node, wheel, description, metadata)
    VALUES (
      'route_recovered',
      NEW.node,
      NEW.wheel,
      'Mesh route recovered after disruption',
      jsonb_build_object(
        'route_path', NEW.route_path,
        'recovery_ms', NEW.route_recovery_ms,
        'latency_ms', NEW.route_latency_ms
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for route change logging
CREATE TRIGGER trigger_log_route_change
  AFTER INSERT OR UPDATE ON sensor_data
  FOR EACH ROW
  WHEN (NEW.route_recovered = TRUE)
  EXECUTE FUNCTION log_route_change();

-- ============================================
-- Sample data for testing
-- ============================================

-- Insert some sample labels
INSERT INTO device_labels (node, wheel, node_label, wheel_label) VALUES
  (1, 1, 'Node 1', 'Wheelchair A'),
  (1, 2, 'Node 1', 'Wheelchair B'),
  (2, 1, 'Node 2', 'Wheelchair C'),
  (3, 1, 'Node 3', 'Wheelchair D'),
  (4, 1, 'Node 4', 'Wheelchair E'),
  (4, 2, 'Node 4', 'Wheelchair F')
ON CONFLICT (node, wheel) DO NOTHING;

-- Insert sample map layout
INSERT INTO map_layout (node, node_name, x_pos, y_pos) VALUES
  (1, 'Node 1', 100, 100),
  (2, 'Node 2', 300, 100),
  (3, 'Node 3', 200, 250),
  (4, 'Node 4', 400, 250)
ON CONFLICT (node) DO NOTHING;

-- ============================================
-- Utility Views
-- ============================================

-- View: Latest sensor data with labels
CREATE OR REPLACE VIEW v_current_sensors AS
SELECT 
  s.*,
  COALESCE(l.node_label, 'Node ' || s.node) as node_label,
  COALESCE(l.wheel_label, 'Wheel ' || s.wheel) as wheel_label,
  m.x_pos,
  m.y_pos,
  m.node_name as map_node_name,
  EXTRACT(EPOCH FROM (NOW() - s.ts)) as age_seconds
FROM sensor_data s
LEFT JOIN device_labels l ON l.node = s.node AND l.wheel = s.wheel
LEFT JOIN map_layout m ON m.node = s.node
ORDER BY s.node, s.wheel;

-- View: Online devices (not stale)
CREATE OR REPLACE VIEW v_online_devices AS
SELECT * FROM v_current_sensors WHERE stale = FALSE;

-- View: Moving wheelchairs
CREATE OR REPLACE VIEW v_moving_wheelchairs AS
SELECT * FROM v_current_sensors WHERE motion = 1 AND stale = FALSE;

-- View: Signal quality summary
CREATE OR REPLACE VIEW v_signal_summary AS
SELECT 
  node,
  COUNT(*) as total_devices,
  AVG(rssi) as avg_rssi,
  MIN(rssi) as min_rssi,
  MAX(rssi) as max_rssi,
  COUNT(CASE WHEN rssi < -75 THEN 1 END) as weak_signals,
  COUNT(CASE WHEN rssi >= -60 THEN 1 END) as strong_signals
FROM sensor_data
WHERE stale = FALSE
GROUP BY node;

-- ============================================
-- Database ready
-- ============================================
SELECT 'WheelSense Database initialized successfully!' as status;
