export interface TelemetryPayload {
  room: number;
  room_name?: string;
  wheel: number;
  wheel_name?: string;
  distance: number;
  status: number;
  motion: number;
  direction: number;
  rssi: number;
  stale?: boolean;
  ts: string;
  gateway_ts?: string;
  route_path?: string[];
  route_latency_ms?: number;
  route_recovery_ms?: number;
  route_recovered?: boolean;
}
