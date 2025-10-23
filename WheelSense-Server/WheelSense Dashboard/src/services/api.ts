/**
 * WheelSense API Client
 * Handles all communication with the REST API backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// ============================================
// Type Definitions
// ============================================

export interface SensorData {
  id: number;
  node: number;
  wheel: number;
  node_label: string;
  wheel_label: string;
  distance: number | null;
  status: number | null;
  motion: number | null;
  direction: number | null;
  rssi: number | null;
  stale: boolean;
  ts: string;
  received_at: string;
  route_recovered: boolean;
  route_latency_ms: number | null;
  route_recovery_ms: number | null;
  route_path: string[];
  x_pos?: number | null;
  y_pos?: number | null;
  map_node_name?: string | null;
  age_seconds?: number;
}

export interface SystemStats {
  nodes: {
    total: number;
  };
  devices: {
    total: number;
    online: number;
    offline: number;
    moving: number;
  };
  signal: {
    average_rssi: string;
    min_rssi: number;
    max_rssi: number;
    weak_signals: number;
  };
  timestamp: string;
}

export interface DeviceLabels {
  node: number;
  wheel: number;
  node_label: string | null;
  wheel_label: string | null;
}

export interface MapLayout {
  node: number;
  node_name: string | null;
  x_pos: number;
  y_pos: number;
  updated_at: string;
}

export interface HistoryDataPoint {
  ts: string;
  distance: number | null;
  rssi: number | null;
  motion: number | null;
  direction: number | null;
}

export interface ApiResponse<T> {
  data: T;
  count?: number;
  timestamp?: string;
}

// ============================================
// Helper Functions
// ============================================

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API request failed: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

// ============================================
// Sensor Data APIs
// ============================================

export async function getSensorData(): Promise<SensorData[]> {
  const response = await fetchApi<ApiResponse<SensorData[]>>('/sensor-data');
  return response.data;
}

export async function getSensorDataByDevice(node: number, wheel: number): Promise<SensorData> {
  const response = await fetchApi<ApiResponse<SensorData>>(`/sensor-data/${node}/${wheel}`);
  return response.data;
}

export async function getSensorHistory(
  node: number,
  wheel: number,
  limit: number = 100
): Promise<HistoryDataPoint[]> {
  const response = await fetchApi<ApiResponse<HistoryDataPoint[]>>(
    `/sensor-data/${node}/${wheel}/history?limit=${limit}`
  );
  return response.data;
}

// ============================================
// Statistics APIs
// ============================================

export async function getSystemStats(): Promise<SystemStats> {
  return fetchApi<SystemStats>('/stats');
}

// ============================================
// Device Labels APIs
// ============================================

export async function updateDeviceLabels(
  node: number,
  wheel: number,
  labels: { node_label?: string; wheel_label?: string }
): Promise<DeviceLabels> {
  const response = await fetchApi<{ success: boolean; data: DeviceLabels }>(
    `/labels/${node}/${wheel}`,
    {
      method: 'PUT',
      body: JSON.stringify(labels),
    }
  );
  return response.data;
}

// ============================================
// Map Layout APIs
// ============================================

export async function getMapLayout(): Promise<MapLayout[]> {
  const response = await fetchApi<ApiResponse<MapLayout[]>>('/map-layout');
  return response.data;
}

export async function updateMapLayout(layout: Partial<MapLayout>[]): Promise<void> {
  await fetchApi('/map-layout', {
    method: 'POST',
    body: JSON.stringify({ layout }),
  });
}

// ============================================
// Server-Sent Events (SSE)
// ============================================

export type SSEMessageType = 
  | 'connected'
  | 'keepalive'
  | 'sensor_update'
  | 'labels_updated'
  | 'layout_updated';

export interface SSEMessage {
  type: SSEMessageType;
  [key: string]: any;
}

export function createSSEConnection(
  onMessage: (message: SSEMessage) => void,
  onError?: (error: Event) => void,
  onOpen?: () => void
): EventSource {
  const eventSource = new EventSource(`${API_BASE_URL}/events`);
  
  eventSource.onopen = () => {
    console.log('[SSE] Connection established');
    onOpen?.();
  };
  
  eventSource.onmessage = (event) => {
    try {
      const message: SSEMessage = JSON.parse(event.data);
      onMessage(message);
    } catch (error) {
      console.error('[SSE] Failed to parse message:', error);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('[SSE] Connection error:', error);
    onError?.(error);
  };
  
  return eventSource;
}

// ============================================
// Health Check
// ============================================

export async function checkHealth(): Promise<{
  status: string;
  uptime?: number;
  timestamp?: string;
  sse_clients?: number;
}> {
  const response = await fetch(`${API_BASE_URL.replace('/api', '')}/health`);
  return response.json();
}

// ============================================
// Admin APIs
// ============================================

export interface ClearDataParams {
  scope: 'sensor' | 'labels' | 'layout' | 'all';
  date?: string;
  start?: string;
  end?: string;
}

export interface ClearDataResponse {
  message: string;
  affected: number;
}

export async function clearData(params: ClearDataParams): Promise<ClearDataResponse> {
  const queryParams = new URLSearchParams();
  queryParams.append('scope', params.scope);
  
  if (params.date) {
    queryParams.append('date', params.date);
  } else if (params.start && params.end) {
    queryParams.append('start', params.start);
    queryParams.append('end', params.end);
  }
  
  return fetchApi<ClearDataResponse>(`/admin/clear?${queryParams.toString()}`, {
    method: 'DELETE',
  });
}

// ============================================
// Legacy API Service Object (for compatibility)
// ============================================

export const apiService = {
  clearData,
};

// ============================================
// Error Handling Utilities
// ============================================

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

// ============================================
// Buildings, Floors, Pathways Types
// ============================================

export interface Building {
  id: number;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Floor {
  id: number;
  building_id: number;
  floor_number: number;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Pathway {
  id: number;
  floor_id: number;
  name?: string;
  points: { x: number; y: number }[];
  width: number;
  type: 'corridor' | 'hallway' | 'entrance' | 'exit';
  created_at?: string;
  updated_at?: string;
}

// ============================================
// Buildings API
// ============================================

export async function getBuildings(): Promise<Building[]> {
  const response = await fetch(`${API_BASE_URL}/buildings`);
  if (!response.ok) {
    throw new ApiError('Failed to fetch buildings', response.status);
  }
  return response.json();
}

export async function createBuilding(data: { name: string; description?: string }): Promise<Building> {
  const response = await fetch(`${API_BASE_URL}/buildings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new ApiError('Failed to create building', response.status);
  }
  return response.json();
}

// ============================================
// Floors API
// ============================================

export async function getFloors(buildingId: number): Promise<Floor[]> {
  const response = await fetch(`${API_BASE_URL}/buildings/${buildingId}/floors`);
  if (!response.ok) {
    throw new ApiError('Failed to fetch floors', response.status);
  }
  return response.json();
}

export async function createFloor(data: {
  building_id: number;
  floor_number: number;
  name: string;
  description?: string;
}): Promise<Floor> {
  const response = await fetch(`${API_BASE_URL}/floors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new ApiError('Failed to create floor', response.status);
  }
  return response.json();
}

// ============================================
// Pathways API
// ============================================

export async function getPathways(floorId: number): Promise<Pathway[]> {
  const response = await fetch(`${API_BASE_URL}/floors/${floorId}/pathways`);
  if (!response.ok) {
    throw new ApiError('Failed to fetch pathways', response.status);
  }
  const data = await response.json();
  // Parse JSONB points field
  return data.map((p: any) => ({
    ...p,
    points: typeof p.points === 'string' ? JSON.parse(p.points) : p.points,
  }));
}

export async function createPathway(data: {
  floor_id: number;
  name?: string;
  points: { x: number; y: number }[];
  width?: number;
  type?: string;
}): Promise<Pathway> {
  const response = await fetch(`${API_BASE_URL}/pathways`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new ApiError('Failed to create pathway', response.status);
  }
  const result = await response.json();
  return {
    ...result,
    points: typeof result.points === 'string' ? JSON.parse(result.points) : result.points,
  };
}

export async function deletePathway(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/pathways/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new ApiError('Failed to delete pathway', response.status);
  }
}

// ============================================
// Room Management (Map Layout Extended)
// ============================================

export interface Room {
  node: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  border_color?: string;
  floor_id?: number;
  building_id?: number;
  created_at?: string;
  updated_at?: string;
}

export async function getRooms(): Promise<Room[]> {
  const response = await fetchApi<ApiResponse<any[]>>('/map-layout');
  // Transform map_layout to Room format with defaults
  return response.data.map(item => ({
    node: item.node,
    name: item.node_name || `Room ${item.node}`,
    x: item.x_pos || 100,
    y: item.y_pos || 100,
    width: item.width || 120,
    height: item.height || 80,
    color: item.color || '#0056B3',
    border_color: item.border_color || '#9ca3af',
    floor_id: item.floor_id,
    building_id: item.building_id,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }));
}

export async function updateRooms(rooms: Partial<Room>[]): Promise<void> {
  await fetchApi('/map-layout/advanced', {
    method: 'POST',
    body: JSON.stringify({ rooms }),
  });
}

export async function updateRoom(room: Partial<Room> & { node: number }): Promise<void> {
  await updateRooms([room]);
}

export async function deleteRoom(node: number): Promise<void> {
  await fetchApi(`/map-layout/${node}`, {
    method: 'DELETE',
  });
}
