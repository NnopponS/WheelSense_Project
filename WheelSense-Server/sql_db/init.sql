DROP TABLE IF EXISTS sensor_data;

CREATE TABLE sensor_data (
  id BIGSERIAL PRIMARY KEY,
  room INTEGER,
  room_name TEXT,
  wheel INTEGER,
  wheel_name TEXT,
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

CREATE INDEX idx_sensor_data_room ON sensor_data (room);
CREATE INDEX idx_sensor_data_wheel ON sensor_data (wheel);
CREATE INDEX idx_sensor_data_ts ON sensor_data (ts DESC);
CREATE UNIQUE INDEX idx_sensor_data_room_wheel ON sensor_data (room, wheel);
