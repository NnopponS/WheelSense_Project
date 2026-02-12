// WheelSense v2.0 - RSSI Fingerprint Localization Types

// ===== MQTT Message Format from M5StickCPlus2 =====
export interface MQTTWheelchairMessage {
  device_id: string;
  timestamp: string;
  wheelchair: {
    distance: number;
    speed: number;
    motion_state: 'stationary' | 'moving' | 'unknown';
    direction: 'forward' | 'backward' | 'left' | 'right' | 'stationary' | 'unknown';
  };
  selected_node: string;
  nearby_nodes: NearbyNode[];
}

export interface NearbyNode {
  node_id: string;
  rssi: number;
  distance_estimate: number;
}

// ===== Core Entities =====
export interface Wheelchair {
  id: string;
  name: string;
  patientId?: string;
  patientName?: string;
  status: 'online' | 'offline' | 'warning' | 'alert';
  currentRoom?: string;
  lastSeen?: string;
  battery?: number;
}

export interface Patient {
  id: string;
  name: string;
  nameEn?: string;
  avatar?: string;
  wheelchairId?: string;
  condition?: string;
  currentLocation?: string;
}

export interface Device {
  id: string;
  deviceId?: string;
  name: string;
  type: 'node' | 'gateway';
  room?: string;
  ip?: string;
  status: 'online' | 'offline';
  lastSeen?: string;
  rssi?: number;
}

export interface Room {
  id: string;
  name: string;
  nameEn?: string;
  roomType?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  floorId?: string;
  buildingId?: string;
  temperature?: number;
  humidity?: number;
  isOccupied?: boolean;
}

export interface Building {
  id: string;
  name: string;
  nameEn?: string;
}

export interface Floor {
  id: string;
  name: string;
  buildingId: string;
}

// ===== RSSI Fingerprinting =====
export interface RSSIFingerprint {
  id: string;
  roomId: string;
  nodeReadings: Record<string, number>; // node_id -> rssi
  timestamp: string;
}

export interface LocationEstimate {
  roomId: string;
  confidence: number;
  method: 'fingerprint' | 'trilateration' | 'nearest';
  nearbyNodes: NearbyNode[];
}

// ===== Appliances =====
export interface Appliance {
  id: string;
  name: string;
  type: 'light' | 'AC' | 'fan' | 'tv' | 'heater' | 'alarm' | 'curtain';
  room: string;
  state: boolean;
  value?: number; // For dimmable lights, AC temperature, etc.
}

// ===== Routines & Schedule =====
export interface DeviceAction {
  device: string;
  state: string; // "on" | "off"
}

export interface Routine {
  id: string;
  title: string;
  description?: string;
  time: string; // HH:MM format
  patient_id?: string;
  patient_name?: string;
  room_id?: string;
  room_name?: string;
  room_name_en?: string;
  days?: string[]; // ['Mon', 'Tue', ...]
  actions?: DeviceAction[];
  enabled?: boolean;
  last_triggered?: string;
  created_at?: string;
  updated_at?: string;
}

// ===== Timeline & Notifications =====
export interface TimelineEvent {
  id: string;
  type: 'enter' | 'exit' | 'alert' | 'appliance' | 'system' | 'ai';
  title: string;
  description?: string;
  timestamp: string;
  roomId?: string;
  wheelchairId?: string;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

// ===== Analytics =====
export interface DailyActivity {
  date: string;
  roomVisits: Record<string, number>;
  totalDistance: number;
  activeMinutes: number;
}

export interface RoomOccupancy {
  roomId: string;
  roomName: string;
  totalTime: number; // minutes
  visits: number;
}

// ===== Alerts =====
export interface Alert {
  id: number;
  alert_type: string;
  severity: string;
  message: string;
  patient_id?: string;
  patient_name?: string;
  resolved: boolean;
  resolved_at?: string;
  created_at: string;
}

// ===== Health Scores =====
export interface HealthScore {
  id: number;
  patient_id: string;
  score: number;
  components: {
    wheelchair_active: number;
    activity_score: number;
    routine_adherence: number;
    alert_penalty: number;
  };
  ai_summary?: string;
  created_at: string;
}

// ===== Chat Sessions =====
export interface ChatSession {
  id: string;
  patient_id?: string;
  title: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: { success: boolean; message: string }[];
  created_at: string;
}

// ===== Analytics =====
export interface AnalyticsSummary {
  total_patients: number;
  active_wheelchairs: number;
  online_nodes: number;
  total_alerts: number;
  unresolved_alerts: number;
  avg_health_score: number;
}

export interface PatientAnalytics {
  patient: Patient;
  timeline: TimelineEvent[];
  health_scores: HealthScore[];
  room_visits: { room_id: string; room_name: string; visit_count: number; total_minutes: number }[];
  routines: Routine[];
}

// ===== App State =====
export type Role = 'admin' | 'user';
export type Theme = 'dark' | 'light';

export interface AppState {
  theme: Theme;
  role: Role;
  language: 'en' | 'th';
  selectedBuilding: string | null;
  selectedFloor: string | null;
  currentPage: string;
  sidebarOpen: boolean;
}
