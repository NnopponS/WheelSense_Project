// API service for WheelSense Dashboard
const API_BASE_URL = '/api';

export interface SensorData {
  id: string;
  node_id: number;
  node_label: string;
  wheel_id: number;
  wheel_label: string;
  distance: number;
  status: number;
  motion: number;
  direction: number;
  rssi: number;
  stale: boolean;
  ts: string;
  route_recovered: boolean;
  route_latency_ms: number;
  route_recovery_ms: number;
  route_path: number[];
  received_at: string;
  raw: any;
}

export interface SensorHistory {
  ts: string;
  rssi: number;
  distance: number;
}

export interface DeviceLabel {
  node_id: number;
  wheel_id: number;
  node_label: string;
  wheel_label: string;
}

export interface MapLayout {
  room_id: number;
  room_name: string;
  x_pos: number;
  y_pos: number;
}

export interface ApiResponse<T> {
  count?: number;
  data: T;
}

class ApiService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Get current sensor data
  async getSensorData(): Promise<ApiResponse<SensorData[]>> {
    return this.request<ApiResponse<SensorData[]>>('/sensor-data');
  }

  // Get sensor history for specific node and wheel
  async getSensorHistory(nodeId: number, wheelId: number, limit: number = 100): Promise<ApiResponse<SensorHistory[]>> {
    return this.request<ApiResponse<SensorHistory[]>>(`/sensor-data/history/${nodeId}/${wheelId}?limit=${limit}`);
  }

  // Update device labels
  async updateDeviceLabels(nodeId: number, wheelId: number, nodeLabel: string, wheelLabel: string): Promise<DeviceLabel> {
    return this.request<DeviceLabel>(`/labels/${nodeId}/${wheelId}`, {
      method: 'PUT',
      body: JSON.stringify({
        node_label: nodeLabel,
        wheel_label: wheelLabel,
      }),
    });
  }

  // Get map layout
  async getMapLayout(): Promise<ApiResponse<MapLayout[]>> {
    return this.request<ApiResponse<MapLayout[]>>('/map-layout');
  }

  // Save map layout
  async saveMapLayout(layout: MapLayout[]): Promise<{ message: string }> {
    return this.request<{ message: string }>('/map-layout', {
      method: 'POST',
      body: JSON.stringify({ layout }),
    });
  }

  // Admin: clear data by date or date range
  async clearData(params: { date?: string; start?: string; end?: string; scope?: 'sensor' | 'labels' | 'layout' | 'all' }): Promise<{ message: string; affected: number }> {
    const q = new URLSearchParams();
    if (params.date) q.set('date', params.date);
    if (params.start) q.set('start', params.start);
    if (params.end) q.set('end', params.end);
    if (params.scope) q.set('scope', params.scope);
    const qs = q.toString();
    return this.request<{ message: string; affected: number }>(`/admin/clear${qs ? `?${qs}` : ''}` , {
      method: 'DELETE',
    });
  }

  // Create SSE connection for real-time updates
  createSSEConnection(onMessage: (data: any) => void, onError?: (error: Event) => void): EventSource {
    const eventSource = new EventSource(`${API_BASE_URL}/events`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      if (onError) {
        onError(error);
      }
    };

    return eventSource;
  }
}

export const apiService = new ApiService();
