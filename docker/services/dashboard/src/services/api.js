/**
 * WheelSense API Service
 * Connect Dashboard to Backend API & MCP Server
 */

// Construct API URLs - use relative paths when accessed through nginx
const getApiBase = () => {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl && !envUrl.startsWith('http')) {
        // Relative path - use as is
        return envUrl;
    }
    return envUrl || 'http://localhost:8000';
};

const getMcpBase = () => {
    const envUrl = import.meta.env.VITE_MCP_URL;
    if (envUrl) {
        // If environment variable is set, use it
        if (!envUrl.startsWith('http')) {
            // Relative path - use as is
            return envUrl;
        }
        return envUrl;
    }
    // Default: use /mcp for nginx proxy (production)
    // For local dev with Vite proxy, it will use /mcp which vite.config.js proxies to localhost:8080
    return '/mcp';
};

const getMqttWsUrl = () => {
    const envUrl = import.meta.env.VITE_MQTT_WS_URL;
    if (envUrl && envUrl.includes('localhost')) {
        // Replace localhost with current host for WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return envUrl.replace(/ws?:\/\/localhost/, `${protocol}//${host}`);
    }
    return envUrl || 'ws://localhost:9001';
};

const API_BASE = getApiBase();
const MCP_BASE = getMcpBase();
const MQTT_WS_URL = getMqttWsUrl();

// ==================== Generic Fetch Helpers ====================

async function fetchAPI(endpoint, options = {}, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const baseUrl = getApiBase();
            const url = baseUrl.startsWith('http')
                ? `${baseUrl}${endpoint}`
                : `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                ...options,
            });

            if (!response.ok) {
                // If 503 and not last attempt, retry with exponential backoff
                if (response.status === 503 && attempt < retries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff: 1s, 2s, 4s (max 5s)
                    console.warn(`API request failed (503 Service Unavailable) [${endpoint}], retrying in ${delay}ms... (attempt ${attempt}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // For 503 on last attempt, provide a more helpful error message
                if (response.status === 503) {
                    throw new Error(`Service temporarily unavailable. The backend may be initializing. Please wait a moment and try again.`);
                }

                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            // If this is the last attempt, throw the error
            if (attempt === retries) {
                console.error(`API Error [${endpoint}]:`, error);
                throw error;
            }

            // Retry on network errors (not 503, which is handled above)
            if (error.message && !error.message.includes('API Error:')) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                console.warn(`API request failed (network error) [${endpoint}], retrying in ${delay}ms... (attempt ${attempt}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // For API errors that aren't 503, don't retry
                throw error;
            }
        }
    }
}

async function fetchMCP(endpoint, options = {}, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const baseUrl = getMcpBase();
            // Ensure endpoint starts with / if baseUrl is relative
            const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            const url = baseUrl.startsWith('http')
                ? `${baseUrl}${normalizedEndpoint}`
                : `${baseUrl}${normalizedEndpoint}`;

            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                ...options,
            });

            if (!response.ok) {
                // If 503 and not last attempt, retry with exponential backoff
                if (response.status === 503 && attempt < retries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    console.warn(`MCP request failed (503 Service Unavailable) [${endpoint}], retrying in ${delay}ms... (attempt ${attempt}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                const errorText = await response.text();
                let errorMessage = `MCP Error: ${response.status} ${response.statusText}`;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.detail || errorJson.message || errorMessage;
                } catch {
                    // If not JSON, use the text or default message
                    if (errorText) {
                        errorMessage = errorText.length > 200 ? errorMessage : errorText;
                    }
                }

                // For 503 on last attempt, provide a more helpful error message
                if (response.status === 503) {
                    errorMessage = `Service temporarily unavailable. The MCP server may be initializing. Please wait a moment and try again.`;
                }

                throw new Error(errorMessage);
            }

            return await response.json();
        } catch (error) {
            // If this is the last attempt, throw the error
            if (attempt === retries) {
                console.error(`MCP Error [${endpoint}]:`, error);
                throw error;
            }

            // Retry on network errors (not 503, which is handled above)
            if (error.message && !error.message.includes('MCP Error:')) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                console.warn(`MCP request failed (network error) [${endpoint}], retrying in ${delay}ms... (attempt ${attempt}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // For MCP errors that aren't 503, don't retry
                throw error;
            }
        }
    }
}

// ==================== Health Check ====================

export async function checkHealth() {
    return fetchAPI('/health');
}

export async function checkMCPHealth() {
    return fetchMCP('/health');
}

// ==================== Translation ====================

// Translation removed - English only mode

// ==================== Rooms ====================

export async function getRooms() {
    const data = await fetchAPI('/rooms');
    return data.rooms || [];
}

export async function getRoom(roomId) {
    return fetchAPI(`/rooms/${roomId}`);
}

export async function createRoom(room) {
    return fetchAPI('/map/rooms', {
        method: 'POST',
        body: JSON.stringify(room),
    });
}

export async function updateRoom(roomId, updates) {
    return fetchAPI(`/map/rooms/${roomId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

export async function updateAllRooms(rooms) {
    return fetchAPI('/map/rooms', {
        method: 'PUT',
        body: JSON.stringify({ rooms }),
    });
}

export async function deleteRoom(roomId) {
    return fetchAPI(`/map/rooms/${roomId}`, {
        method: 'DELETE',
    });
}

// ==================== Patients ====================

export async function getPatients() {
    const data = await fetchAPI('/patients');
    return data.patients || [];
}

export async function getPatient(patientId) {
    return fetchAPI(`/users/${patientId}`);
}

export async function createPatient(patient) {
    return fetchAPI('/patients', {
        method: 'POST',
        body: JSON.stringify(patient),
    });
}

export async function updatePatient(patientId, updates) {
    return fetchAPI(`/patients/${patientId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

export async function deletePatient(patientId) {
    return fetchAPI(`/patients/${patientId}`, {
        method: 'DELETE',
    });
}

// ==================== Wheelchairs ====================

export async function getWheelchairs() {
    // Fetch wheelchairs directly from database
    const data = await fetchAPI('/wheelchairs');
    return data.wheelchairs || [];
}

export async function createWheelchair(wheelchair) {
    return fetchAPI('/wheelchairs', {
        method: 'POST',
        body: JSON.stringify(wheelchair),
    });
}

export async function updateWheelchair(wheelchairId, updates) {
    return fetchAPI(`/wheelchairs/${wheelchairId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

// ==================== Devices ====================

export async function getDevices() {
    const data = await fetchAPI('/map/devices');
    return data.devices || [];
}

export async function getNodesLiveStatus() {
    const data = await fetchAPI('/nodes/live-status');
    return data.nodes || [];
}

export async function createDevice(device) {
    return fetchAPI('/map/devices', {
        method: 'POST',
        body: JSON.stringify(device),
    });
}

export async function updateDevice(deviceId, updates) {
    return fetchAPI(`/map/devices/${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

export async function deleteDevice(deviceId) {
    return fetchAPI(`/map/devices/${deviceId}`, {
        method: 'DELETE',
    });
}

export async function deleteDevicesBulk(deviceIds) {
    return fetchAPI('/map/devices/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ device_ids: deviceIds }),
    });
}

export async function triggerConfigMode(deviceId) {
    return fetchAPI(`/nodes/${deviceId}/config-mode`, {
        method: 'POST',
    });
}

export async function rotateCamera(deviceId, degrees = 90) {
    const params = new URLSearchParams({ degrees: degrees.toString() });
    return fetchAPI(`/nodes/${deviceId}/rotate?${params}`, {
        method: 'POST',
    });
}

// ==================== Appliances ====================

export async function getAppliances(roomId) {
    const data = await fetchAPI(`/appliances/${roomId}`);
    return data.appliances || [];
}

export async function getAllAppliancesFlat() {
    // Get all appliances from database (flat list)
    const data = await fetchAPI('/appliances');
    return data.appliances || [];
}

export async function getAllAppliances() {
    // Get all appliances and group by room
    const allAppliances = await getAllAppliancesFlat();
    const appliancesByRoom = {};

    for (const appliance of allAppliances) {
        const roomKey = appliance.room || appliance.roomId || 'unknown';
        if (!appliancesByRoom[roomKey]) {
            appliancesByRoom[roomKey] = [];
        }
        appliancesByRoom[roomKey].push(appliance);
    }

    return appliancesByRoom;
}

/**
 * Control appliance via MQTT
 * Sends command to backend API which forwards to ESP8266 via MQTT topic: WheelSense/{room}/control
 * @param {string} room - Room name (bedroom, bathroom, kitchen, livingroom)
 * @param {string} appliance - Appliance type (light, AC, fan, tv, alarm)
 * @param {boolean} state - ON/OFF state
 * @param {number|null} value - Optional value for sliders (brightness, temperature, volume, speed)
 */
export async function controlAppliance(room, appliance, state, value = null) {
    return fetchAPI('/appliances/control', {
        method: 'POST',
        body: JSON.stringify({
            room,
            appliance,
            state,
            value,
        }),
    });
}

export async function createAppliance(appliance) {
    return fetchAPI('/appliances/create', {
        method: 'POST',
        body: JSON.stringify(appliance),
    });
}

export async function updateAppliance(applianceId, updates) {
    return fetchAPI(`/appliances/${applianceId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

export async function deleteAppliance(applianceId) {
    return fetchAPI(`/appliances/${applianceId}`, {
        method: 'DELETE',
    });
}

// ==================== Routines ====================

export async function getRoutines() {
    const data = await fetchAPI('/activities?event_type=routine&limit=100');
    // For now, we need a dedicated routines endpoint
    // Return mock-style data until backend has /routines endpoint
    return [];
}

export async function createRoutine(routine) {
    // TODO: Add /routines endpoint in backend
    console.log('Creating routine:', routine);
    return { id: Date.now().toString(), ...routine };
}

export async function updateRoutine(routineId, updates) {
    // TODO: Add /routines endpoint in backend
    console.log('Updating routine:', routineId, updates);
    return { success: true };
}

export async function deleteRoutine(routineId) {
    // TODO: Add /routines endpoint in backend
    console.log('Deleting routine:', routineId);
    return { success: true };
}

// ==================== Activity Logs / Timeline ====================

export async function getActivityLogs(options = {}) {
    const params = new URLSearchParams();
    if (options.roomId) params.append('room_id', options.roomId);
    if (options.eventType) params.append('event_type', options.eventType);
    if (options.limit) params.append('limit', options.limit);

    const data = await fetchAPI(`/activities?${params.toString()}`);
    return data.activities || [];
}

export async function getLocationHistory(limit = 100) {
    const data = await fetchAPI(`/location/history?limit=${limit}`);
    return data.history || [];
}

// ==================== Timeline API ====================

export async function getTimeline(options = {}) {
    const params = new URLSearchParams();
    if (options.userId) params.append('user_id', options.userId);
    if (options.roomId) params.append('room_id', options.roomId);
    if (options.eventType) params.append('event_type', options.eventType);
    if (options.limit) params.append('limit', options.limit || 100);

    const data = await fetchAPI(`/timeline?${params.toString()}`);
    // API returns { timeline: [...], count: N } or just array
    const timeline = Array.isArray(data) ? data : (data.timeline || data.events || []);
    console.log('[API] getTimeline returned:', timeline.length, 'events');
    return timeline;
}

export async function getTimelineHistory(date, userId = null) {
    const params = new URLSearchParams({ date });
    if (userId) params.append('user_id', userId);

    const data = await fetchAPI(`/timeline/history?${params.toString()}`);
    // API returns { timeline: [...], count: N, date: "..." } or just array
    const timeline = Array.isArray(data) ? data : (data.timeline || data.events || []);
    console.log('[API] getTimelineHistory returned:', timeline.length, 'events for date', date);
    return {
        timeline: Array.isArray(timeline) ? timeline : [],
        count: timeline.length,
        date: data.date || date
    };
}

export async function getTimelineSummary(userId, date = null) {
    const params = date ? `?date=${date}` : '';
    const data = await fetchAPI(`/timeline/summary/${userId}${params}`);
    return data;
}

export async function saveLocationEvent(event) {
    return fetchAPI('/timeline/location', {
        method: 'POST',
        body: JSON.stringify(event),
    });
}

// ==================== Location (Camera Detection) ====================

export async function getCurrentLocation() {
    return fetchAPI('/location/current');
}

// ==================== Emergency ====================

export async function getActiveEmergencies() {
    const data = await fetchAPI('/emergency/active');
    return data.emergencies || [];
}

export async function createEmergency(alert) {
    return fetchAPI('/emergency/alert', {
        method: 'POST',
        body: JSON.stringify(alert),
    });
}

export async function resolveEmergency(eventId) {
    return fetchAPI(`/emergency/${eventId}/resolve`, {
        method: 'POST',
    });
}

// ==================== AI / MCP ====================

export async function chat(messages, tools = null, sessionId = null) {
    return fetchAPI('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
            messages: messages.map(m => ({
                role: m.role,
                content: m.content,
            })),
            session_id: sessionId,
            tools: tools || [
                'control_appliance',
                'get_room_status',
                'get_user_location',
                'turn_off_all',
                'send_emergency',
                'set_scene'
            ],
            stream: false,
        }),
    });
}

export async function clearChatContext(sessionId) {
    return fetchAPI('/api/chat/clear-context', {
        method: 'POST',
        body: JSON.stringify({
            session_id: sessionId
        }),
    });
}

export async function getChatHistory(limit = 50, sessionId = null) {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (sessionId) {
        params.append('session_id', sessionId);
    }
    return fetchAPI(`/chat/history?${params.toString()}`);
}

export async function getMCPTools() {
    const data = await fetchMCP('/mcp', {
        method: 'POST',
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            id: 1,
        }),
    });
    return data.result?.tools || [];
}

export async function callMCPTool(toolName, args) {
    const data = await fetchMCP('/mcp', {
        method: 'POST',
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args,
            },
            id: Date.now(),
        }),
    });
    return data.result;
}

export async function analyzeBehavior(userId, date = null) {
    return fetchAPI('/ai/analyze-behavior', {
        method: 'POST',
        body: JSON.stringify({
            user_id: userId,
            date,
        }),
    });
}

export async function getAIRecommendations(userId) {
    const data = await fetchAPI(`/ai/recommendations/${userId}`);
    return data.recommendations || [];
}

// ==================== Gemini AI APIs ====================

export async function chatWithGemini(messages, systemPrompt = null, context = null) {
    return fetchAPI('/ai/gemini/chat', {
        method: 'POST',
        body: JSON.stringify({
            messages,
            system_prompt: systemPrompt,
            context,
        }),
    });
}

export async function getGeminiRoutineSuggestions(patientId = null) {
    const params = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : '';
    return fetchAPI(`/ai/gemini/suggest-routines${params}`, {
        method: 'POST',
    });
}

export async function getGeminiAnalysis(patientId = null, question = null) {
    const params = new URLSearchParams();
    if (patientId) params.append('patient_id', patientId);
    if (question) params.append('question', question);
    return fetchAPI(`/ai/gemini/analyze?${params.toString()}`, {
        method: 'POST',
    });
}

// ==================== Data Management APIs ====================

export async function exportPatientsCSV() {
    const response = await fetch('/api/data/export/patients');
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    return blob;
}

export async function exportTimelineCSV(days = 30) {
    const response = await fetch(`/api/data/export/timeline?days=${days}`);
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    return blob;
}

export async function exportAIReport(patientId = null) {
    const params = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : '';
    return fetchAPI(`/data/export/ai-report${params}`);
}

export async function exportBackupJSON() {
    const response = await fetch('/api/data/export/backup');
    if (!response.ok) throw new Error('Backup failed');
    const blob = await response.blob();
    return blob;
}

export async function importData(collection, data, replaceExisting = false) {
    return fetchAPI('/data/import', {
        method: 'POST',
        body: JSON.stringify({
            collection,
            data,
            replace_existing: replaceExisting,
        }),
    });
}

export async function clearTimelineData(daysAgo = 30) {
    return fetchAPI(`/data/timeline?days_ago=${daysAgo}`, {
        method: 'DELETE',
    });
}

export async function resetAllDefaults() {
    return fetchAPI('/data/reset-defaults', {
        method: 'POST',
    });
}

// ==================== Notifications ====================

export async function getNotifications() {
    // Notifications come from activity logs and emergencies
    const [activities, emergencies] = await Promise.all([
        getActivityLogs({ limit: 20 }),
        getActiveEmergencies(),
    ]);

    const notifications = [
        ...emergencies.map(e => ({
            id: e._id || e.id,
            type: 'alert',
            title: e.event_type,
            message: e.message,
            read: e.resolved,
            time: e.timestamp || e.createdAt,
        })),
        ...activities.slice(0, 10).map(a => ({
            id: a._id || a.id,
            type: a.eventType === 'alert' ? 'warning' : 'info',
            title: a.message,
            message: a.room ? `Room: ${a.room}` : '',
            read: true,
            time: a.timestamp || a.createdAt,
        })),
    ];

    return notifications.sort((a, b) => new Date(b.time) - new Date(a.time));
}

// ==================== Buildings & Floors ====================

export async function getBuildings() {
    const data = await fetchAPI('/map/buildings');
    return data.buildings || [];
}

export async function getFloors(buildingId = null) {
    const params = buildingId ? `?building_id=${buildingId}` : '';
    const data = await fetchAPI(`/map/floors${params}`);
    return data.floors || [];
}

export async function createBuilding(building) {
    return fetchAPI('/map/buildings', {
        method: 'POST',
        body: JSON.stringify(building),
    });
}

export async function deleteBuilding(buildingId) {
    return fetchAPI(`/map/buildings/${buildingId}`, {
        method: 'DELETE',
    });
}

export async function createFloor(floor) {
    return fetchAPI('/map/floors', {
        method: 'POST',
        body: JSON.stringify(floor),
    });
}

export async function deleteFloor(floorId) {
    return fetchAPI(`/map/floors/${floorId}`, {
        method: 'DELETE',
    });
}

export async function saveWheelchairPositions(positions) {
    return fetchAPI('/map/wheelchair-positions', {
        method: 'PUT',
        body: JSON.stringify(positions),
    });
}

export async function getWheelchairPositions() {
    const data = await fetchAPI('/map/wheelchair-positions');
    return data.positions || {};
}

export async function saveMapConfig(config) {
    return fetchAPI('/map/config', {
        method: 'PUT',
        body: JSON.stringify(config),
    });
}

export async function getMapConfig() {
    return fetchAPI('/map/config');
}

// ==================== Video Streaming ====================

export function getStreamUrl(roomId) {
    // Use nginx /stream/ route directly
    return `/stream/${roomId}`;
}

export function getVideoStreamUrl(roomId) {
    // Use polling endpoint instead of MJPEG stream (browser compatibility)
    return `/api/video/${roomId}?t=${Date.now()}`;
}

// Get WebSocket stream URL for video
export async function getStreamUrlInfo(roomId) {
    try {
        const response = await fetch(`/api/stream-url/${roomId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // Construct WebSocket URL using current host (nginx proxy)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Use window.location.host which includes port if needed
        // In production through nginx, this will be the nginx host
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/ws/stream/${roomId}`;
        return {
            ...data,
            ws_url: wsUrl,
            available: data.available || false
        };
    } catch (error) {
        console.error('Failed to get stream URL info:', error);
        // Fallback WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return {
            available: false,
            ws_url: `${protocol}//${host}/api/ws/stream/${roomId}`,
            stream_url: null
        };
    }
}

// ==================== WebSocket Connection ====================

export function createWebSocket(onMessage, onError, onClose) {
    const baseUrl = getApiBase();
    const wsUrl = baseUrl.startsWith('http')
        ? baseUrl.replace('http', 'ws') + '/ws'
        : (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + baseUrl + '/ws';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            onMessage(data);
        } catch (e) {
            console.error('WebSocket message parse error:', e);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (onError) onError(error);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (onClose) onClose();
    };

    return ws;
}

// ==================== MQTT WebSocket ====================

export function createMQTTConnection(onMessage) {
    // Construct MQTT WebSocket URL dynamically
    const wsUrl = getMqttWsUrl();
    console.log('MQTT WebSocket URL:', wsUrl);

    try {
        // Try to use native WebSocket for MQTT over WebSocket
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('MQTT WebSocket connected');
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (onMessage) onMessage(data);
            } catch (e) {
                console.error('MQTT message parse error:', e);
            }
        };

        ws.onerror = (error) => {
            console.error('MQTT WebSocket error:', error);
        };

        ws.onclose = () => {
            console.log('MQTT WebSocket disconnected');
        };

        return {
            subscribe: (topic) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'subscribe',
                        topic: topic
                    }));
                }
            },
            publish: (topic, message) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'publish',
                        topic: topic,
                        payload: message
                    }));
                }
            },
            disconnect: () => {
                if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                    ws.close();
                }
            },
            ws: ws
        };
    } catch (error) {
        console.error('Failed to create MQTT WebSocket connection:', error);
        // Return mock connection as fallback
        return {
            subscribe: (topic) => console.log('Subscribe:', topic),
            publish: (topic, message) => console.log('Publish:', topic, message),
            disconnect: () => console.log('MQTT Disconnected'),
        };
    }
}

// ==================== Speech APIs ====================

// Speech-to-Text (uses Web Speech API)
export function startSpeechRecognition(onResult, onError, language = 'th-TH') {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        onError(new Error('Speech recognition not supported'));
        return null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');
        const isFinal = event.results[event.results.length - 1].isFinal;
        onResult(transcript, isFinal);
    };

    recognition.onerror = (event) => {
        onError(new Error(event.error));
    };

    recognition.start();
    return recognition;
}

// Text-to-Speech (uses Web Speech API)
export function speak(text, lang = 'th-TH', rate = 1.0) {
    return new Promise((resolve, reject) => {
        if (!('speechSynthesis' in window)) {
            reject(new Error('Speech synthesis not supported'));
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = rate;

        // Try to find Thai female voice
        const voices = speechSynthesis.getVoices();
        // First try to find Thai female voice
        let thaiVoice = voices.find(v =>
            v.lang.startsWith('th') &&
            (v.name.toLowerCase().includes('female') ||
                v.name.toLowerCase().includes('woman') ||
                v.name.toLowerCase().includes('female') ||
                v.gender === 'female')
        );
        // If no female voice found, try any Thai voice
        if (!thaiVoice) {
            thaiVoice = voices.find(v => v.lang.startsWith('th'));
        }
        if (thaiVoice) {
            utterance.voice = thaiVoice;
        }

        utterance.onend = resolve;
        utterance.onerror = reject;

        speechSynthesis.speak(utterance);
    });
}

export function stopSpeaking() {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
}

// ==================== WiFi Management (ESP32 Direct) ====================

/**
 * Get WiFi status from ESP32 device directly
 * @param {string} deviceIp - IP address of the ESP32 device
 */
export async function getWifiStatus(deviceIp) {
    try {
        const response = await fetch(`http://${deviceIp}/wifi/status`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error('Failed to get WiFi status');
        return await response.json();
    } catch (error) {
        console.error('WiFi status error:', error);
        throw error;
    }
}

/**
 * Scan available WiFi networks from ESP32 device
 * @param {string} deviceIp - IP address of the ESP32 device
 */
export async function getWifiNetworks(deviceIp) {
    try {
        const response = await fetch(`http://${deviceIp}/wifi/networks`, {
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('Failed to scan WiFi networks');
        return await response.json();
    } catch (error) {
        console.error('WiFi scan error:', error);
        throw error;
    }
}

/**
 * Reset WiFi settings on ESP32 device (triggers config portal)
 * @param {string} deviceIp - IP address of the ESP32 device
 */
export async function resetWifi(deviceIp) {
    try {
        const response = await fetch(`http://${deviceIp}/wifi/reset`, {
            method: 'POST',
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error('Failed to reset WiFi');
        return await response.json();
    } catch (error) {
        console.error('WiFi reset error:', error);
        throw error;
    }
}

/**
 * Get device status directly from ESP32 device
 * @param {string} deviceIp - IP address of the ESP32 device
 */
export async function getDeviceDirectStatus(deviceIp) {
    try {
        const response = await fetch(`http://${deviceIp}/device/status`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error('Failed to get device status');
        return await response.json();
    } catch (error) {
        console.error('Device status error:', error);
        throw error;
    }
}

// ==================== User Info APIs ====================

/**
 * Get user information from user_info table
 */
export async function getUserInfo() {
    return await fetchAPI('/api/user-info');
}

/**
 * Update user information
 * @param {Object} update - {name_thai?, name_english?, condition?, current_location?}
 */
export async function updateUserInfo(update) {
    return await fetchAPI('/api/user-info', {
        method: 'PUT',
        body: JSON.stringify(update),
    });
}

// ==================== Schedule APIs ====================

/**
 * Get all schedule items
 */
export async function getScheduleItems() {
    return await fetchAPI('/api/schedule-items');
}

/**
 * Create a new schedule item
 * @param {Object} item - {time, activity, location?, action?}
 */
export async function createScheduleItem(item) {
    return await fetchAPI('/api/schedule-items', {
        method: 'POST',
        body: JSON.stringify(item),
    });
}

/**
 * Update a schedule item
 * @param {number} itemId - Schedule item ID (1-based)
 * @param {Object} update - {time?, activity?, location?, action?}
 */
export async function updateScheduleItem(itemId, update) {
    return await fetchAPI(`/api/schedule-items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(update),
    });
}

/**
 * Delete a schedule item
 * @param {number} itemId - Schedule item ID (1-based)
 */
export async function deleteScheduleItem(itemId) {
    return await fetchAPI(`/api/schedule-items/${itemId}`, {
        method: 'DELETE',
    });
}

/**
 * Reset daily schedule (clear one-time events, reset daily clone)
 */
export async function resetSchedule() {
    return await fetchAPI('/api/schedule/reset', {
        method: 'POST',
    });
}

export async function setCustomTime(time, date = null) {
    return await fetchAPI('/api/schedule/custom-time', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            time: time,
            date: date
        }),
    });
}

export async function getCustomTime() {
    return await fetchAPI('/api/schedule/custom-time', {
        method: 'GET',
    });
}

// ==================== Device States APIs ====================

/**
 * Get all device states organized by room
 */
export async function getAllDeviceStates() {
    return await fetchAPI('/device-states');
}

/**
 * Get device state for a specific room and device
 * @param {string} room - Room name
 * @param {string} device - Device name
 */
export async function getDeviceState(room, device) {
    return await fetchAPI(`/device-states/${encodeURIComponent(room)}/${encodeURIComponent(device)}`);
}

/**
 * Update device state
 * @param {string} room - Room name
 * @param {string} device - Device name
 * @param {boolean} state - Device state (true = ON, false = OFF)
 */
export async function updateDeviceState(room, device, state) {
    return await fetchAPI(`/device-states/${encodeURIComponent(room)}/${encodeURIComponent(device)}`, {
        method: 'PUT',
        body: JSON.stringify({ room, device, state }),
    });
}

// ==================== MCP Object ====================

export const mcp = {
    chat,
    getTools: getMCPTools,
    callTool: callMCPTool,
};

// ==================== Exports ====================

export default {
    // Health
    checkHealth,
    checkMCPHealth,

    // Data
    getRooms,
    getRoom,
    createRoom,
    updateRoom,
    updateAllRooms,
    deleteRoom,
    getPatients,
    getPatient,
    createPatient,
    updatePatient,
    deletePatient,
    getWheelchairs,
    createWheelchair,
    updateWheelchair,
    getDevices,
    getNodesLiveStatus,
    createDevice,
    updateDevice,
    deleteDevice,
    deleteDevicesBulk,
    getAppliances,
    getAllAppliances,
    getAllAppliancesFlat,
    controlAppliance,
    getRoutines,
    createRoutine,
    updateRoutine,
    deleteRoutine,

    // User Info
    getUserInfo,
    updateUserInfo,

    // Schedule
    getScheduleItems,
    createScheduleItem,
    updateScheduleItem,
    deleteScheduleItem,
    resetSchedule,
    setCustomTime,
    getCustomTime,

    // Device States
    getAllDeviceStates,
    getDeviceState,
    updateDeviceState,
    getActivityLogs,
    getLocationHistory,
    getCurrentLocation,
    getActiveEmergencies,
    createEmergency,
    resolveEmergency,
    getNotifications,
    getBuildings,
    getFloors,
    createBuilding,
    deleteBuilding,
    createFloor,
    deleteFloor,

    // Map Config
    getMapConfig,
    saveMapConfig,
    getWheelchairPositions,
    saveWheelchairPositions,

    // Timeline
    getTimeline,
    getTimelineHistory,
    getTimelineSummary,
    saveLocationEvent,


    // AI/MCP
    chat,
    clearChatContext,
    getChatHistory,
    getMCPTools,
    callMCPTool,
    analyzeBehavior,
    getAIRecommendations,

    // Gemini AI
    chatWithGemini,
    getGeminiRoutineSuggestions,
    getGeminiAnalysis,

    // Data Management
    exportPatientsCSV,
    exportTimelineCSV,
    exportAIReport,
    exportBackupJSON,
    importData,
    clearTimelineData,
    resetAllDefaults,

    // Streaming
    getStreamUrl,
    getVideoStreamUrl,
    getStreamUrlInfo,
    createWebSocket,
    createMQTTConnection,

    // Speech
    startSpeechRecognition,
    speak,
    stopSpeaking,

    // WiFi Management (ESP32 Direct)
    getWifiStatus,
    getWifiNetworks,
    resetWifi,
    getDeviceDirectStatus,
};
