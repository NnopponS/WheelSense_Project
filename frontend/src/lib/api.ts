const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ApiResponse<T> {
    data?: T;
    error?: string;
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
            ...options,
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        return { data };
    } catch (error) {
        console.error('API Error:', error);
        return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ===== Health =====
export const getHealth = () => fetchApi<HealthResponse>('/api/health');

// ===== Rooms =====
export const getRooms = (floorId?: string) => {
    const query = floorId ? `?floor_id=${floorId}` : '';
    return fetchApi<{ rooms: Room[] }>(`/api/rooms${query}`);
};
export const createRoom = (room: Partial<Room>) =>
    fetchApi<{ id: string }>('/api/rooms', { method: 'POST', body: JSON.stringify(room) });
export const updateRoom = (id: string, room: Partial<Room>) =>
    fetchApi('/api/rooms/' + id, { method: 'PUT', body: JSON.stringify(room) });
export const deleteRoom = (id: string) =>
    fetchApi('/api/rooms/' + id, { method: 'DELETE' });

// ===== Buildings & Floors =====
export const getBuildings = () => fetchApi<{ buildings: Building[] }>('/api/buildings');
export const getFloors = (buildingId?: string) => {
    const query = buildingId ? `?building_id=${buildingId}` : '';
    return fetchApi<{ floors: Floor[] }>(`/api/floors${query}`);
};

// ===== Map (Combined) =====
export const getMapData = (buildingId?: string, floorId?: string) => {
    const params = new URLSearchParams();
    if (buildingId) params.append('building_id', buildingId);
    if (floorId) params.append('floor_id', floorId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchApi<MapData>(`/api/map${query}`);
};

// ===== Appliances =====
export const getAppliances = () => fetchApi<{ appliances: Appliance[] }>('/api/appliances');
export const getRoomAppliances = (roomId: string) =>
    fetchApi<{ appliances: Appliance[] }>(`/api/appliances/room/${roomId}`);
export const controlAppliance = (id: string, state: boolean, value?: number) =>
    fetchApi<{ success: boolean }>(`/api/appliances/${id}/control`, {
        method: 'POST',
        body: JSON.stringify({ state, value })
    });

// ===== Patients =====
export const getPatients = () => fetchApi<{ patients: Patient[] }>('/api/patients');
export const getPatient = (id: string) => fetchApi<Patient>(`/api/patients/${id}`);
export const createPatient = (patient: Partial<Patient>) =>
    fetchApi<{ id: string }>('/api/patients', { method: 'POST', body: JSON.stringify(patient) });
export const updatePatient = (id: string, patient: Partial<Patient>) =>
    fetchApi('/api/patients/' + id, { method: 'PUT', body: JSON.stringify(patient) });
export const deletePatient = (id: string) =>
    fetchApi('/api/patients/' + id, { method: 'DELETE' });

// ===== Wheelchairs =====
export const getWheelchairs = () => fetchApi<{ wheelchairs: Wheelchair[] }>('/api/wheelchairs');
export const getWheelchair = (id: string) => fetchApi<Wheelchair>('/api/wheelchairs/' + id);
export const updateWheelchair = (id: string, data: Record<string, any>) =>
    fetchApi('/api/wheelchairs/' + id, { method: 'PUT', body: JSON.stringify(data) });
export const getWheelchairPosition = (id: string) => fetchApi<WheelchairPosition>('/api/wheelchairs/' + id + '/position');
export const getWheelchairHistory = (id: string, limit?: number) =>
    fetchApi<{ history: WheelchairHistory[] }>(`/api/wheelchairs/${id}/history${limit ? `?limit=${limit}` : ''}`);
export const getWheelchairStats = (id: string) => fetchApi('/api/wheelchairs/' + id + '/stats');

// ===== Nodes =====
export const getNodes = () => fetchApi<{ nodes: Node[] }>('/api/nodes');
export const getNode = (id: string) => fetchApi<Node>(`/api/nodes/${id}`);
export const createNode = (node: Partial<Node>) =>
    fetchApi<{ id: string }>('/api/nodes', { method: 'POST', body: JSON.stringify(node) });
export const updateNode = (id: string, node: Partial<Node>) =>
    fetchApi('/api/nodes/' + id, { method: 'PUT', body: JSON.stringify(node) });
export const deleteNode = (id: string) =>
    fetchApi('/api/nodes/' + id, { method: 'DELETE' });

// ===== Devices =====
export const getDevices = () => fetchApi<{ devices: Device[] }>('/api/devices');
export const getOnlineDevices = () => fetchApi<{ devices: Device[] }>('/api/devices/online');
export const getDeviceStats = () => fetchApi<DeviceStats>('/api/devices/stats');
export const updateDevice = (id: string, data: Record<string, any>) =>
    fetchApi('/api/devices/' + id, { method: 'PUT', body: JSON.stringify(data) });

// ===== Timeline =====
export const getTimeline = (params?: { patient_id?: string; wheelchair_id?: string; date?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.patient_id) query.append('patient_id', params.patient_id);
    if (params?.wheelchair_id) query.append('wheelchair_id', params.wheelchair_id);
    if (params?.date) query.append('date', params.date);
    if (params?.limit) query.append('limit', String(params.limit));
    const qs = query.toString();
    return fetchApi<{ timeline: TimelineEvent[]; total: number }>(`/api/timeline${qs ? '?' + qs : ''}`);
};
export const getTodayTimeline = (limit?: number) =>
    fetchApi<{ timeline: TimelineEvent[] }>(`/api/timeline/today${limit ? `?limit=${limit}` : ''}`);
export const getTimelineStats = () => fetchApi('/api/timeline/stats');

// ===== Chat =====
export const sendChatMessage = (message: string, patientId?: string) =>
    fetchApi<ChatResponse>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message, patient_id: patientId })
    });
export const getChatStatus = () => fetchApi('/api/chat/status');

// ===== Types =====
export interface HealthResponse {
    status: string;
    mqtt_connected: boolean;
    ha_connected: boolean;
    database: string;
    wheelchairs: number;
    online_nodes: number;
}

export interface Building {
    id: string;
    name: string;
    name_en?: string;
    description?: string;
}

export interface Floor {
    id: string;
    building_id: string;
    name: string;
    level: number;
    description?: string;
}

export interface Room {
    id: string;
    floor_id: string;
    name: string;
    name_en?: string;
    room_type?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
    node_id?: string;
    node_name?: string;
    node_status?: string;
    node_rssi?: number;
    wheelchair_count?: number;
    description?: string;
}

export interface Node {
    id: string;
    name: string;
    room_id?: string;
    room_name?: string;
    x?: number;
    y?: number;
    status: string;
    rssi?: number;
    last_seen_by?: string;
}

export interface Appliance {
    id: string;
    room_id: string;
    room_name?: string;
    name: string;
    type: string;
    ha_entity_id?: string;
    state: number;
    value?: number;
}

export interface Patient {
    id: string;
    name: string;
    name_en?: string;
    age?: number;
    gender?: string;
    condition?: string;
    notes?: string;
    wheelchair_id?: string;
    wheelchair_name?: string;
    current_room_name?: string;
}

export interface Wheelchair {
    id: string;
    name: string;
    mac_address?: string;
    patient_id?: string;
    patient_name?: string;
    battery_level: number;
    status: string;
    current_room_id?: string;
    current_node_id?: string;
    room_name?: string;
    distance_m?: number;
    speed_ms?: number;
    status_message?: string;
    rssi?: number;
    stale?: number;
    last_seen?: string;
}

export interface WheelchairPosition {
    id: string;
    name: string;
    current_room_id?: string;
    current_node_id?: string;
    status: string;
    distance_m?: number;
    speed_ms?: number;
    rssi?: number;
    room_name?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    node_name?: string;
}

export interface WheelchairHistory {
    id: number;
    wheelchair_id: string;
    timestamp: string;
    room_id?: string;
    room_name?: string;
    node_id?: string;
    node_name?: string;
    distance_m?: number;
    speed_ms?: number;
    status?: string;
    rssi?: number;
}

export interface Device {
    id: string;
    name: string;
    type: 'node' | 'gateway';
    mac_address?: string;
    room_id?: string;
    room_name?: string;
    x?: number;
    y?: number;
    status: string;
    rssi?: number;
    last_seen?: string;
}

export interface DeviceStats {
    total: number;
    online: number;
    offline: number;
}

export interface TimelineEvent {
    id: number;
    patient_id?: string;
    patient_name?: string;
    wheelchair_id?: string;
    wheelchair_name?: string;
    event_type: string;
    from_room_id?: string;
    from_room_name?: string;
    to_room_id?: string;
    to_room_name?: string;
    description?: string;
    timestamp: string;
}

export interface ChatResponse {
    response: string;
    actions: { success: boolean; message: string }[];
    context?: { patient_id?: string };
}

export interface MapData {
    buildings: Building[];
    floors: Floor[];
    rooms: Room[];
    wheelchairs: Wheelchair[];
}

// ===== Routines =====
export interface RoutineApi {
    id: string;
    patient_id?: string;
    patient_name?: string;
    title: string;
    description?: string;
    time: string;
    room_id?: string;
    room_name?: string;
    room_name_en?: string;
    days?: string[];
    actions?: { device: string; state: string }[];
    enabled?: boolean;
    last_triggered?: string;
    created_at?: string;
    updated_at?: string;
}

export const getRoutines = (patientId?: string) => {
    const query = patientId ? `?patient_id=${patientId}` : '';
    return fetchApi<{ routines: RoutineApi[] }>(`/api/routines${query}`);
};
export const getRoutine = (id: string) =>
    fetchApi<RoutineApi>(`/api/routines/${id}`);
export const createRoutine = (routine: Partial<RoutineApi>) =>
    fetchApi<RoutineApi>('/api/routines', { method: 'POST', body: JSON.stringify(routine) });
export const updateRoutine = (id: string, routine: Partial<RoutineApi>) =>
    fetchApi<RoutineApi>(`/api/routines/${id}`, { method: 'PUT', body: JSON.stringify(routine) });
export const deleteRoutine = (id: string) =>
    fetchApi<{ success: boolean }>(`/api/routines/${id}`, { method: 'DELETE' });
export const resetRoutines = (patientId?: string) =>
    fetchApi<{ success: boolean; routines: RoutineApi[] }>('/api/routines/reset', {
        method: 'POST',
        body: JSON.stringify(patientId ? { patient_id: patientId } : {})
    });

// ===== Notifications =====
export const getNotifications = (params?: { patient_id?: string; unread_only?: boolean; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.patient_id) query.append('patient_id', params.patient_id);
    if (params?.unread_only) query.append('unread_only', 'true');
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.offset) query.append('offset', String(params.offset));
    const qs = query.toString();
    return fetchApi<{ notifications: any[]; total: number }>(`/api/notifications${qs ? '?' + qs : ''}`);
};
export const createNotification = (data: { patient_id?: string; type: string; title: string; message: string }) =>
    fetchApi('/api/notifications', { method: 'POST', body: JSON.stringify(data) });
export const markNotificationRead = (id: number | string) =>
    fetchApi(`/api/notifications/${id}/read`, { method: 'PUT' });
export const deleteNotification = (id: number | string) =>
    fetchApi(`/api/notifications/${id}`, { method: 'DELETE' });
export const markAllNotificationsRead = (patientId?: string) =>
    fetchApi('/api/notifications/read-all', { method: 'PUT', body: JSON.stringify(patientId ? { patient_id: patientId } : {}) });
export const getUnreadCount = (patientId?: string) => {
    const qs = patientId ? `?patient_id=${patientId}` : '';
    return fetchApi<{ count: number }>(`/api/notifications/unread-count${qs}`);
};

// ===== Alerts =====
export const getAlerts = (params?: { resolved?: boolean; patient_id?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.resolved !== undefined) query.append('resolved', String(params.resolved));
    if (params?.patient_id) query.append('patient_id', params.patient_id);
    if (params?.limit) query.append('limit', String(params.limit));
    const qs = query.toString();
    return fetchApi<{ alerts: any[] }>(`/api/alerts${qs ? '?' + qs : ''}`);
};
export const createAlert = (data: { alert_type: string; message: string; patient_id?: string }) =>
    fetchApi('/api/alerts', { method: 'POST', body: JSON.stringify(data) });
export const sendEmergencyAlert = (data: { message: string; patient_id?: string }) =>
    fetchApi('/api/alerts/emergency', { method: 'POST', body: JSON.stringify(data) });
export const resolveAlert = (id: number | string) =>
    fetchApi(`/api/alerts/${id}/resolve`, { method: 'PUT' });
export const getActiveAlertCount = () =>
    fetchApi<{ count: number }>('/api/alerts/active-count');

// ===== Analytics =====
export const getBuildingAnalytics = (buildingId: string) =>
    fetchApi(`/api/analytics/building/${buildingId}`);
export const getFloorAnalytics = (floorId: string) =>
    fetchApi(`/api/analytics/floor/${floorId}`);
export const getPatientAnalytics = (patientId: string) =>
    fetchApi(`/api/analytics/patient/${patientId}`);
export const getRoomUsage = (params?: { floor_id?: string; days?: number }) => {
    const query = new URLSearchParams();
    if (params?.floor_id) query.append('floor_id', params.floor_id);
    if (params?.days) query.append('days', String(params.days));
    const qs = query.toString();
    return fetchApi(`/api/analytics/room-usage${qs ? '?' + qs : ''}`);
};
export const getAnalyticsSummary = () =>
    fetchApi(`/api/analytics/summary`);

// ===== Health Scores =====
export const getHealthScores = (patientId: string, limit?: number) =>
    fetchApi(`/api/health-scores/${patientId}${limit ? '?limit=' + limit : ''}`);
export const getLatestHealthScore = (patientId: string) =>
    fetchApi(`/api/health-scores/${patientId}/latest`);
export const calculateHealthScore = (patientId: string) =>
    fetchApi(`/api/health-scores/${patientId}/calculate`, { method: 'POST' });

// ===== Chat Sessions =====
export const createChatSession = (data?: { patient_id?: string; title?: string; role?: string }) =>
    fetchApi<{ session_id: string; title: string }>('/api/chat/sessions', { method: 'POST', body: JSON.stringify(data || {}) });
export const listChatSessions = (patientId?: string) => {
    const qs = patientId ? `?patient_id=${patientId}` : '';
    return fetchApi<{ sessions: any[] }>(`/api/chat/sessions${qs}`);
};
export const getSessionMessages = (sessionId: string) =>
    fetchApi<{ session_id: string; messages: any[] }>(`/api/chat/sessions/${sessionId}/messages`);
export const deleteChatSession = (sessionId: string) =>
    fetchApi<{ success: boolean }>(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' });

// ===== Building/Floor CRUD =====
export const createBuilding = (data: { name: string; name_en?: string; description?: string }) =>
    fetchApi('/api/buildings', { method: 'POST', body: JSON.stringify(data) });
export const updateBuilding = (id: string, data: Partial<Building>) =>
    fetchApi(`/api/buildings/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteBuilding = (id: string) =>
    fetchApi(`/api/buildings/${id}`, { method: 'DELETE' });
export const createFloor = (data: { building_id: string; name: string; level: number; description?: string }) =>
    fetchApi('/api/floors', { method: 'POST', body: JSON.stringify(data) });
export const updateFloor = (id: string, data: Partial<Floor>) =>
    fetchApi(`/api/floors/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteFloor = (id: string) =>
    fetchApi(`/api/floors/${id}`, { method: 'DELETE' });
