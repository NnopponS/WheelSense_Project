/**
 * WheelSense Mobile App - Type Definitions
 * Mirrors backend contracts from WheelSense FastAPI
 */

// ==================== AUTH TYPES ====================

export type UserRole = 'admin' | 'head_nurse' | 'supervisor' | 'observer' | 'patient';

export interface User {
  id: number;
  username: string;
  email?: string;
  role: UserRole;
  workspace_id: number;
  is_active: boolean;
  linked_patient?: Patient;
  linked_caregiver?: Caregiver;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ==================== PATIENT TYPES ====================

export interface Patient {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  gender?: string;
  care_level?: string;
  mobility?: string;
  room_id?: number;
  room?: Room;
  allergies?: string;
  notes?: string;
  photo_url?: string;
}

export interface Caregiver {
  id: number;
  first_name: string;
  last_name: string;
  role: string;
  department?: string;
  phone?: string;
}

// ==================== ROOM & FACILITY TYPES ====================

export interface Room {
  id: number;
  name: string;
  floor_id: number;
  floor?: Floor;
  node_device_id?: string;
  smart_devices?: SmartDevice[];
}

export interface Floor {
  id: number;
  name: string;
  facility_id: number;
  facility?: Facility;
}

export interface Facility {
  id: number;
  name: string;
  address?: string;
}

export interface SmartDevice {
  id: number;
  name: string;
  device_type: string;
  entity_id: string;
  state?: string;
}

// ==================== DEVICE TYPES ====================

export interface Device {
  id: number;
  device_id: string;
  device_type: 'wheelchair' | 'camera' | 'node' | 'mobile_app';
  hardware_type: string;
  status: string;
  battery_percentage?: number;
  last_seen?: string;
  firmware_version?: string;
  config?: Record<string, any>;
}

export interface PatientDeviceAssignment {
  id: number;
  patient_id: number;
  device_id: string;
  assigned_at: string;
  unassigned_at?: string;
}

// ==================== TELEMETRY TYPES ====================

export interface IMUData {
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

export interface MotionData {
  distance_m: number;
  velocity_ms: number;
  accel_ms2: number;
  direction: number;
}

export interface RSSIReading {
  node: string;
  rssi: number;
  mac: string;
}

export interface BatteryData {
  percentage: number;
  voltage_v: number;
  charging: boolean;
}

export interface TelemetryPayload {
  device_id: string;
  device_type: 'mobile_app';
  hardware_type: 'mobile_app';
  firmware: string;
  seq: number;
  timestamp: string;
  uptime_ms: number;
  imu?: IMUData;
  motion?: MotionData;
  rssi?: RSSIReading[];
  hr?: HeartRateData;
  ppg?: PPGData;
  battery?: BatteryData;
  app_mode?: 'wheelchair' | 'walking';
  walk_steps?: WalkStepData;
}

// ==================== POLAR SENSOR TYPES ====================

export interface HeartRateData {
  bpm: number;
  rr_intervals?: number[];
  timestamp: number;
}

export interface PPGData {
  ppg0: number;
  ppg1: number;
  ppg2: number;
  ambient: number;
  timestamp: number;
}

export interface PolarDevice {
  deviceId: string;
  name: string;
  batteryLevel?: number;
  firmwareVersion?: string;
}

// ==================== WALK STEP TYPES ====================

export interface WalkStepData {
  steps: number;
  distance_m?: number;
  timestamp: number;
  session_start: number;
}

// ==================== MOBILE REGISTRATION TYPES ====================

export interface MobileRegistration {
  device_id: string;
  device_name: string;
  platform: string;
  os_version: string;
  app_version: string;
  hardware_type: 'mobile_app';
  timestamp: string;
}

// ==================== ROOM PREDICTION TYPES ====================

export interface RoomPredictionResult {
  room_id: number | null;
  room_name: string;
  confidence: number;
  model_type: string;
  strategy?: string;
}

// ==================== ALERT TYPES ====================

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';
export type AlertType = 'fall' | 'sos' | 'anomaly' | 'system' | 'medical';

export interface Alert {
  id: number;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description?: string;
  patient_id?: number;
  patient?: Patient;
  room_id?: number;
  room?: Room;
  device_id?: string;
  created_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
}

// ==================== WORKFLOW TYPES ====================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface WorkflowTask {
  id: number;
  title: string;
  description?: string;
  status: TaskStatus;
  patient_id?: number;
  patient?: Patient;
  assigned_role?: UserRole;
  assigned_user_id?: number;
  assigned_user?: User;
  due_at?: string;
  completed_at?: string;
}

// ==================== BLE BEACON TYPES ====================

export interface BLEBeacon {
  nodeKey: string;
  rssi: number;
  mac: string;
  timestamp: number;
  lastSeen: number;
}

// ==================== APP STATE TYPES ====================

export type AppMode = 'wheelchair' | 'walking';

export interface AppSettings {
  deviceName: string;
  mqttBroker: string;
  mqttPort: number;
  scanInterval: number;
  telemetryInterval: number;
}

// ==================== NOTIFICATION TYPES ====================

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  timestamp: number;
}

// ==================== API RESPONSE TYPES ====================

export interface ApiError {
  detail: string;
  status_code: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
