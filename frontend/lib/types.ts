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
  medical_conditions: Array<Record<string, string>>;
  allergies: string[];
  medications: Array<Record<string, unknown>>;
  care_level: "normal" | "special" | "critical";
  mobility_type: string;
  current_mode: string;
  notes: string;
  admitted_at: string;
  is_active: boolean;
  room_id: number | null;
  created_at: string;
}

// ── Device ──────────────────────────────────────────────────────────────────

export interface Device {
  id: number;
  workspace_id: number;
  device_id: string;
  device_type: string;
  last_seen: string | null;
  metadata: Record<string, unknown>;
}

// ── Room ────────────────────────────────────────────────────────────────────

export interface Room {
  id: number;
  workspace_id: number;
  floor_id: number | null;
  name: string;
  description: string;
  node_device_id: string | null;
  room_type: string;
  adjacent_rooms: number[];
  config: Record<string, unknown>;
  facility_id?: number;
  created_at: string;
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

// ── HomeAssistant ───────────────────────────────────────────────────────────

export interface SmartDevice {
  id: number;
  workspace_id: number;
  name: string;
  ha_entity_id: string;
  device_type: string;
  room_id: number | null;
  is_active: boolean;
  state: string;
  config: Record<string, unknown>;
  created_at: string;
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
