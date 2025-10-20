DROP TABLE IF EXISTS device_labels;
DROP TABLE IF EXISTS sensor_data;

CREATE TABLE sensor_data (
  id BIGSERIAL PRIMARY KEY,
  node_id INTEGER NOT NULL,
  wheel_id INTEGER NOT NULL,
  distance DOUBLE PRECISION,
  status INTEGER,
  motion INTEGER,
  direction INTEGER,
  rssi INTEGER,
  stale BOOLEAN,
  ts TIMESTAMPTZ,
  route_recovered BOOLEAN,
  route_latency_ms INTEGER,
  route_recovery_ms INTEGER,
  route_path JSONB NOT NULL DEFAULT '[]'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX idx_sensor_unique ON sensor_data (node_id, wheel_id);
CREATE INDEX idx_sensor_node ON sensor_data (node_id);
CREATE INDEX idx_sensor_wheel ON sensor_data (wheel_id);
CREATE INDEX idx_sensor_ts ON sensor_data (ts DESC);

CREATE TABLE device_labels (
  node_id INTEGER NOT NULL,
  wheel_id INTEGER NOT NULL,
  node_label TEXT,
  wheel_label TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (node_id, wheel_id)
);

CREATE INDEX idx_labels_node ON device_labels (node_id);
CREATE INDEX idx_labels_wheel ON device_labels (wheel_id);

CREATE TABLE map_layout (
  room_id INTEGER PRIMARY KEY,
  room_name TEXT,
  x_pos INTEGER NOT NULL DEFAULT 0,
  y_pos INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
