/* ═══════════════════════════════════════════════════════════════════════════
   WheelSense TypeScript types — mirrors backend Pydantic schemas exactly
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Auth ────────────────────────────────────────────────────────────────────

export interface Token {
  access_token: string;
  token_type: string;
}

export interface User {
  id: number;
  workspace_id: number;
  username: string;
  role: "admin" | "head_nurse" | "supervisor" | "observer" | "patient";
  is_active: boolean;
  caregiver_id: number | null;
  patient_id: number | null;
  /** Hosted platform path or external http(s) URL for avatar */
  profile_image_url?: string | null;
  email?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

// ── Workspace ───────────────────────────────────────────────────────────────

export interface Workspace {
  id: number;
  name: string;
  mode: string;
  is_active: boolean;
}

// ── Patient ─────────────────────────────────────────────────────────────────

export type MedicalConditionEntry = string | Record<string, unknown>;

export interface PatientPastSurgery {
  procedure?: string;
  facility?: string;
  year?: number | string;
}

export interface PatientMedication {
  name?: string;
  dosage?: string;
  frequency?: string;
  instructions?: string;
}

export interface Patient {
  id: number;
  workspace_id: number;
  first_name: string;
  last_name: string;
  nickname: string;
  date_of_birth: string | null;
  gender: string;
  height_cm: number | null;
  weight_kg: number | null;
  blood_type: string;
  photo_url: string | null;
  medical_conditions: MedicalConditionEntry[];
  allergies: string[];
  medications: PatientMedication[];
  past_surgeries: PatientPastSurgery[];
  care_level: "normal" | "special" | "critical";
  mobility_type: string;
  current_mode: string;
  notes: string;
  admitted_at: string;
  is_active: boolean;
  room_id: number | null;
  created_at: string;
}

export interface PatientContact {
  id: number;
  patient_id: number;
  contact_type: string;
  name: string;
  relationship: string;
  phone: string;
  email: string;
  is_primary: boolean;
  notes?: string;
}

// ── Device (registry /api/devices) ───────────────────────────────────────────

export type HardwareType =
  | "wheelchair"
  | "node"
  | "polar_sense"
  | "mobile_phone";

/** List/summary row from GET /api/devices */
export interface Device {
  id: number;
  device_id: string;
  device_type: string;
  hardware_type: string;
  display_name: string;
  ip_address?: string;
  firmware?: string;
  last_seen: string | null;
  config: Record<string, unknown>;
}

/** Home Assistant mapping from GET /api/ha/devices */
export interface SmartDevice {
  id: number;
  workspace_id: number;
  name: string;
  ha_entity_id: string;
  device_type: string;
  room_id: number | null;
  is_active: boolean;
  config: Record<string, unknown>;
  state: string;
  created_at: string;
}

/** Device fleet activity from GET /api/devices/activity */
export interface DeviceActivityEvent {
  id: number;
  workspace_id: number;
  occurred_at: string;
  event_type: string;
  summary: string;
  registry_device_id: string | null;
  smart_device_id: number | null;
  details: Record<string, unknown>;
}

export interface DevicePatientLink {
  patient_id: number;
  patient_name: string;
  device_role: string;
  assigned_at: string | null;
}

export interface DeviceCaregiverLink {
  caregiver_id: number;
  caregiver_name: string;
  device_role: string;
  assigned_at: string | null;
}

export interface DeviceLocationInfo {
  room_id?: number;
  room_name?: string;
  floor_id?: number | null;
  node_device_id?: string | null;
  predicted_room_id?: number | null;
  predicted_room_name?: string | null;
  prediction_confidence?: number | null;
  prediction_at?: string | null;
}

export interface DeviceRealtimeSnapshot {
  timestamp: string | null;
  battery_pct: number | null;
  battery_v: number | null;
  charging: boolean | null;
  velocity_ms: number | null;
  distance_m: number | null;
  ax: number | null;
  ay: number | null;
  az: number | null;
  gx: number | null;
  gy: number | null;
  gz: number | null;
  accel_ms2: number | null;
  direction: number | null;
}

export interface DevicePolarVitals {
  timestamp: string | null;
  heart_rate_bpm: number | null;
  rr_interval_ms: number | null;
  sensor_battery: number | null;
  source: string | null;
}

export interface DeviceLatestPhoto {
  id: number;
  photo_id: string;
  timestamp: string | null;
  url: string;
}

/** GET /api/devices/{device_id} */
export interface DeviceDetail extends Device {
  realtime: DeviceRealtimeSnapshot;
  location: DeviceLocationInfo | null;
  patient: DevicePatientLink | null;
  caregiver: DeviceCaregiverLink | null;
  latest_photo: DeviceLatestPhoto | null;
  camera_status: Record<string, unknown>;
  polar_vitals: DevicePolarVitals | null;
}

// ── Room ────────────────────────────────────────────────────────────────────

export interface Room {
  id: number;
  workspace_id?: number;
  floor_id: number | null;
  name: string;
  description: string;
  node_device_id: string | null;
  room_type: string;
  adjacent_rooms: number[];
  config: Record<string, unknown>;
  floor_name?: string | null;
  floor_number?: number | null;
  facility_id?: number | null;
  facility_name?: string | null;
  created_at?: string;
}

// ── Vital Reading ───────────────────────────────────────────────────────────

export interface VitalReading {
  id: number;
  workspace_id: number;
  patient_id: number;
  device_id: string;
  timestamp: string;
  heart_rate_bpm: number | null;
  rr_interval_ms: number | null;
  spo2: number | null;
  skin_temperature: number | null;
  sensor_battery: number | null;
  source: string;
}

// ── Alert ───────────────────────────────────────────────────────────────────

export interface Alert {
  id: number;
  workspace_id: number;
  patient_id: number | null;
  device_id: string | null;
  timestamp: string;
  alert_type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  data: Record<string, unknown>;
  status: "active" | "acknowledged" | "resolved";
  acknowledged_by: number | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface RoomOccupant {
  actor_type: "patient" | "staff";
  actor_id: number;
  display_name: string;
  subtitle?: string | null;
  role?: string | null;
  user_id?: number | null;
  patient_id?: number | null;
  caregiver_id?: number | null;
  room_id?: number | null;
  source?: string | null;
  updated_at?: string | null;
}

export interface RoomSmartDeviceStateSummary {
  id: number;
  name: string;
  device_type: string;
  ha_entity_id: string;
  state: string;
  is_active: boolean;
}

export interface RoomCameraSummary {
  device_id: string | null;
  latest_photo_id: number | null;
  latest_photo_url: string | null;
  captured_at: string | null;
  capture_available: boolean;
}

export interface WorkflowClaimRequest {
  note: string;
}

export interface WorkflowHandoffRequest {
  target_mode: "role" | "user";
  target_role?: string | null;
  target_user_id?: number | null;
  note: string;
}

export interface DemoActorMoveRequest {
  room_id: number;
  note: string;
}

// ── Timeline Event ──────────────────────────────────────────────────────────

export interface TimelineEvent {
  id: number;
  workspace_id: number;
  patient_id: number;
  timestamp: string;
  event_type: string;
  room_id: number | null;
  room_name: string;
  description: string;
  data: Record<string, unknown>;
  source: string;
  caregiver_id: number | null;
}

// ── Caregiver ───────────────────────────────────────────────────────────────

export interface Caregiver {
  id: number;
  workspace_id: number;
  first_name: string;
  last_name: string;
  role: string;
  phone: string;
  email: string;
  is_active: boolean;
  employee_code?: string | null;
  department?: string | null;
  employment_type?: string | null;
  specialty?: string | null;
  license_number?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  photo_url?: string | null;
  created_at: string;
}

// ── Facility ────────────────────────────────────────────────────────────────

export interface Facility {
  id: number;
  workspace_id: number;
  name: string;
  address: string;
  description: string;
  config: Record<string, unknown>;
  facility_type?: string;
  created_at: string;
}

export interface Floor {
  id: number;
  workspace_id: number;
  facility_id: number;
  floor_number: number;
  name: string;
  map_data: Record<string, unknown>;
  created_at: string;
}

export interface FacilityHierarchy {
  id: number;
  name: string;
  address: string;
  floors: Array<{
    id: number;
    floor_number: number;
    name: string;
    rooms: Array<{
      id: number;
      name: string;
      room_type: string;
      node_device_id: string | null;
    }>;
  }>;
}

// ── Health Observation ──────────────────────────────────────────────────────

export interface HealthObservation {
  id: number;
  workspace_id: number;
  patient_id: number;
  caregiver_id: number | null;
  timestamp: string;
  observation_type: string;
  blood_pressure_sys: number | null;
  blood_pressure_dia: number | null;
  temperature_c: number | null;
  weight_kg: number | null;
  pain_level: number | null;
  description: string;
  meal_type: string | null;
  meal_portion: string | null;
  water_ml: number | null;
}

// ── Device Assignment ───────────────────────────────────────────────────────

export interface DeviceAssignment {
  id: number;
  patient_id: number;
  device_id: string;
  device_role: string;
  assigned_at: string;
  is_active: boolean;
}

// -- Future Domains -----------------------------------------------------------

export interface FloorplanAsset {
  id: number;
  workspace_id: number;
  facility_id: number | null;
  floor_id: number | null;
  name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown>;
  file_url: string;
  created_at: string;
}

export interface Specialist {
  id: number;
  workspace_id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  license_number: string | null;
  phone: string | null;
  email: string | null;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Prescription {
  id: number;
  workspace_id: number;
  patient_id: number | null;
  specialist_id: number | null;
  prescribed_by_user_id: number | null;
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string;
  instructions: string;
  status: "active" | "paused" | "completed" | "cancelled";
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PharmacyOrder {
  id: number;
  workspace_id: number;
  prescription_id: number | null;
  patient_id: number | null;
  order_number: string;
  pharmacy_name: string;
  quantity: number;
  refills_remaining: number;
  status: "pending" | "verified" | "dispensed" | "cancelled";
  notes: string;
  requested_at: string;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
}
