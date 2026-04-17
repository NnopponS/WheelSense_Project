/**
 * WheelSense Mobile App - API Service
 * REST API client for WheelSense backend
 */

import { Platform } from 'react-native';
import {
  User,
  AuthResponse,
  Patient,
  Alert,
  WorkflowTask,
  Device,
  Room,
  PaginatedResponse,
  ApiError,
} from '../types';
import { useAppStore } from '../store/useAppStore';

// ==================== API CONFIG ====================

const API_BASE = '/api';

// ==================== API SERVICE ====================

class APIService {
  private baseUrl: string = '';

  // ==================== CONFIGURATION ====================

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, ''); // Remove trailing slash
  }

  private getBaseUrl(): string {
    const store = useAppStore.getState();
    return this.baseUrl || store.settings.serverUrl;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const store = useAppStore.getState();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (store.authToken) {
      headers['Authorization'] = `Bearer ${store.authToken}`;
    }

    return headers;
  }

  // ==================== HTTP METHODS ====================

  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    customHeaders?: Record<string, string>
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${API_BASE}${endpoint}`;
    const headers = { ...(await this.getHeaders()), ...customHeaders };

    console.log(`[API] ${method} ${url}`);

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({
          detail: 'Unknown error',
          status_code: response.status,
        }));
        
        // Handle auth errors
        if (response.status === 401) {
          useAppStore.getState().clearAuth();
        }
        
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      // Handle empty responses
      if (response.status === 204) {
        return {} as T;
      }

      return await response.json();
    } catch (error) {
      console.error(`[API] ${method} ${endpoint} failed:`, error);
      throw error;
    }
  }

  private get<T>(endpoint: string): Promise<T> {
    return this.request<T>('GET', endpoint);
  }

  private post<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>('POST', endpoint, body);
  }

  private patch<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>('PATCH', endpoint, body);
  }

  private put<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>('PUT', endpoint, body);
  }

  private delete<T>(endpoint: string): Promise<T> {
    return this.request<T>('DELETE', endpoint);
  }

  // ==================== AUTH ====================

  async login(username: string, password: string): Promise<AuthResponse> {
    const response = await this.post<AuthResponse>('/auth/login', {
      username,
      password,
    });

    // Store auth data
    useAppStore.getState().setAuth(response.access_token, response.user);
    
    return response;
  }

  async logout(): Promise<void> {
    try {
      await this.post('/auth/logout');
    } finally {
      useAppStore.getState().clearAuth();
    }
  }

  async getCurrentUser(): Promise<User> {
    return this.get<User>('/auth/me');
  }

  async refreshSession(): Promise<void> {
    try {
      const user = await this.getCurrentUser();
      const store = useAppStore.getState();
      if (store.authToken) {
        store.setAuth(store.authToken, user);
      }
    } catch (error) {
      console.error('[API] Session refresh failed:', error);
      useAppStore.getState().clearAuth();
      throw error;
    }
  }

  // ==================== PATIENTS ====================

  async getPatients(): Promise<Patient[]> {
    return this.get<Patient[]>('/patients');
  }

  async getPatient(id: number): Promise<Patient> {
    return this.get<Patient>(`/patients/${id}`);
  }

  async updatePatient(id: number, data: Partial<Patient>): Promise<Patient> {
    return this.patch<Patient>(`/patients/${id}`, data);
  }

  // ==================== ALERTS ====================

  async getAlerts(params?: {
    status?: string;
    severity?: string;
    patient_id?: number;
  }): Promise<Alert[]> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.severity) queryParams.append('severity', params.severity);
    if (params?.patient_id) queryParams.append('patient_id', params.patient_id.toString());
    
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.get<Alert[]>(`/alerts${query}`);
  }

  async getAlert(id: number): Promise<Alert> {
    return this.get<Alert>(`/alerts/${id}`);
  }

  async acknowledgeAlert(id: number): Promise<void> {
    await this.post(`/alerts/${id}/acknowledge`);
  }

  async resolveAlert(id: number): Promise<void> {
    await this.post(`/alerts/${id}/resolve`);
  }

  // ==================== WORKFLOW ====================

  async getTasks(params?: {
    status?: string;
    patient_id?: number;
  }): Promise<WorkflowTask[]> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.patient_id) queryParams.append('patient_id', params.patient_id.toString());
    
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.get<WorkflowTask[]>(`/workflow/tasks${query}`);
  }

  async updateTask(id: number, data: Partial<WorkflowTask>): Promise<WorkflowTask> {
    return this.patch<WorkflowTask>(`/workflow/tasks/${id}`, data);
  }

  // ==================== DEVICES ====================

  async getDevices(): Promise<Device[]> {
    return this.get<Device[]>('/devices');
  }

  async getDevice(id: string): Promise<Device> {
    return this.get<Device>(`/devices/${id}`);
  }

  async sendDeviceCommand(id: string, command: string, params?: any): Promise<void> {
    await this.post(`/devices/${id}/commands`, {
      command,
      params,
    });
  }

  // ==================== ROOMS ====================

  async getRooms(): Promise<Room[]> {
    return this.get<Room[]>('/rooms');
  }

  async getRoom(id: number): Promise<Room> {
    return this.get<Room>(`/rooms/${id}`);
  }

  async getFloorplanPresence(): Promise<any> {
    return this.get('/floorplans/presence');
  }

  // ==================== LOCALIZATION ====================

  async getLocalizationReadiness(): Promise<any> {
    return this.get('/localization/readiness');
  }

  async repairLocalization(): Promise<any> {
    return this.post('/localization/readiness/repair');
  }

  // ==================== CHAT / AI ====================

  async proposeChatAction(message: string, pageContext?: any): Promise<any> {
    return this.post('/chat/actions/propose', {
      message,
      page_context: pageContext,
    });
  }

  async confirmChatAction(actionId: string): Promise<any> {
    return this.post(`/chat/actions/${actionId}/confirm`);
  }

  async executeChatAction(actionId: string): Promise<any> {
    return this.post(`/chat/actions/${actionId}/execute`);
  }
}

// ==================== SINGLETON INSTANCE ====================

export const API = new APIService();

// ==================== HOOK ====================

export function useAPI() {
  return {
    // Auth
    login: API.login.bind(API),
    logout: API.logout.bind(API),
    getCurrentUser: API.getCurrentUser.bind(API),
    refreshSession: API.refreshSession.bind(API),
    
    // Patients
    getPatients: API.getPatients.bind(API),
    getPatient: API.getPatient.bind(API),
    updatePatient: API.updatePatient.bind(API),
    
    // Alerts
    getAlerts: API.getAlerts.bind(API),
    getAlert: API.getAlert.bind(API),
    acknowledgeAlert: API.acknowledgeAlert.bind(API),
    resolveAlert: API.resolveAlert.bind(API),
    
    // Tasks
    getTasks: API.getTasks.bind(API),
    updateTask: API.updateTask.bind(API),
    
    // Devices
    getDevices: API.getDevices.bind(API),
    getDevice: API.getDevice.bind(API),
    sendDeviceCommand: API.sendDeviceCommand.bind(API),
    
    // Rooms
    getRooms: API.getRooms.bind(API),
    getRoom: API.getRoom.bind(API),
    getFloorplanPresence: API.getFloorplanPresence.bind(API),
    
    // AI
    proposeChatAction: API.proposeChatAction.bind(API),
    confirmChatAction: API.confirmChatAction.bind(API),
    executeChatAction: API.executeChatAction.bind(API),
    
    // Config
    setBaseUrl: API.setBaseUrl.bind(API),
  };
}
