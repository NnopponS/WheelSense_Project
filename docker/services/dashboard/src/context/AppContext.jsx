import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

const AppContext = createContext(null);

// Check if running with backend
const USE_API = import.meta.env.VITE_USE_API === 'true' || false;

export function AppProvider({ children }) {
    // Language state (TH/EN) - STEP 2: Enable bilingual support
    const [language, setLanguage] = useState(() => {
        // Read from localStorage, default to 'en'
        const saved = localStorage.getItem('wheelsense_language');
        const lang = saved === 'th' ? 'th' : 'en';
        console.log('[AppContext] Initial language:', lang);
        return lang;
    });

    // Save language to localStorage when it changes
    useEffect(() => {
        console.log('[AppContext] Language changed to:', language);
        localStorage.setItem('wheelsense_language', language);
    }, [language]);

    // Wrapper to log language changes
    const setLanguageWithLog = (newLang) => {
        console.log('[AppContext] Setting language to:', newLang);
        setLanguage(newLang);
    };

    const [theme, setTheme] = useState('dark'); // 'dark' or 'light'
    const [role, setRole] = useState('admin'); // 'admin' or 'user'
    const [selectedBuilding, setSelectedBuilding] = useState('building-1');
    const [selectedFloor, setSelectedFloor] = useState('floor-1');
    const [currentPage, setCurrentPage] = useState('monitoring');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerContent, setDrawerContent] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [showNotifications, setShowNotifications] = useState(false);
    const [compactMode, setCompactMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Custom time state - null means use real time, otherwise use custom HH:MM
    const [customTime, setCustomTime] = useState(null);

    // Get current time - returns customTime if set, otherwise real time
    const getCurrentTime = useCallback(() => {
        if (customTime) {
            const [hours, minutes] = customTime.split(':');
            const now = new Date();
            now.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            return now;
        }
        return new Date();
    }, [customTime]);

    // Current user (for user mode) - Loaded from Database
    const [currentUser, setCurrentUser] = useState(null);

    // Notifications - Loaded from Database and real-time updates
    const [notifications, setNotifications] = useState([]);

    // Removed all buffering logic - simplified to immediate updates

    // Chat message callback ref for WebSocket notifications
    const chatMessageCallbackRef = useRef(null);

    // Pending notification for auto-popup (from schedule or room change alerts)
    const [pendingNotification, setPendingNotification] = useState(null);

    // Clear pending notification
    const clearPendingNotification = useCallback(() => {
        setPendingNotification(null);
    }, []);

    // Load notifications from API on startup
    useEffect(() => {
        const loadNotifications = async () => {
            try {
                const apiNotifications = await api.getNotifications();
                // Merge with existing notifications, avoiding duplicates
                setNotifications(prev => {
                    const existingIds = new Set(prev.map(n => n.id));
                    const newNotifications = apiNotifications.filter(n => !existingIds.has(n.id));
                    // Limit to 50 most recent
                    return [...prev, ...newNotifications].sort((a, b) =>
                        new Date(b.time) - new Date(a.time)
                    ).slice(0, 50);
                });
            } catch (error) {
                console.error('[AppContext] Failed to load notifications:', error);
            }
        };

        loadNotifications();
        // Refresh notifications every 30 seconds
        const interval = setInterval(loadNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    // Load chat history from database on startup and poll for updates
    useEffect(() => {
        const loadChatHistory = async () => {
            try {
                const result = await api.getChatHistory(50);
                if (result.messages && result.messages.length > 0) {
                    // Convert database messages to chat history format
                    const dbMessages = result.messages.map((msg, idx) => ({
                        id: msg.id || Date.now() + idx,
                        role: msg.role,
                        content: msg.content,
                        isNotification: msg.isNotification || false
                    }));

                    // Merge with existing chat history, avoiding duplicates
                    setChatHistory(prev => {
                        // Keep welcome message if it exists
                        const welcomeMsg = prev.find(m => m.id === 1 && m.role === 'assistant');
                        const existingIds = new Set(prev.map(m => m.id));
                        const newMessages = dbMessages.filter(m => !existingIds.has(m.id));

                        // Combine: welcome message (if exists) + database messages
                        const combined = welcomeMsg ? [welcomeMsg, ...newMessages] : newMessages;
                        return combined.sort((a, b) => (a.id || 0) - (b.id || 0));
                    });
                }
            } catch (error) {
                console.error('[AppContext] Failed to load chat history:', error);
            }
        };

        // Load on startup
        loadChatHistory();

        // Refresh chat history every 5 seconds to get new notifications
        const interval = setInterval(loadChatHistory, 5000);
        return () => clearInterval(interval);
    }, []);

    // Wheelchairs - Loaded from Database
    const [wheelchairs, setWheelchairs] = useState([]);

    // Wheelchair positions on map - stored as percentage (x, y) relative to map canvas
    const [wheelchairPositions, setWheelchairPositions] = useState({});

    // Detection state per room - stores latest detection results
    // Structure: { [roomId]: { detected: bool, confidence: float, timestamp: string, device_id: string } }
    const [detectionState, setDetectionState] = useState({});

    // Patients - Loaded from Database
    const [patients, setPatients] = useState([]);

    // Devices - Loaded from Database
    const [devices, setDevices] = useState([]);

    // Buildings & Floors - Loaded from Database
    const [buildings, setBuildings] = useState([]);
    const [floors, setFloors] = useState([]);

    // Rooms - Loaded from Database
    const [rooms, setRooms] = useState([]);

    // Appliances - Loaded from Database (grouped by room)
    // Structure: { [roomType]: [{ id, name, type, state, ... }] }
    const [appliances, setAppliances] = useState({});

    // Timeline/Activities - Loaded from Database
    const [timeline, setTimeline] = useState([]);

    // Routines - Loaded from Database
    const [routines, setRoutines] = useState([]);

    // Device States - MCP device state management (room -> device -> state)
    const [deviceStates, setDeviceStates] = useState({});

    // User Info - MCP user information
    const [userInfo, setUserInfo] = useState({ name_thai: '', name_english: '', condition: '', current_location: '' });

    // Schedule Items - MCP schedule items (for user role)
    const [scheduleItems, setScheduleItems] = useState([]);

    // Emergency alerts
    const [emergencies, setEmergencies] = useState([]);

    // AI Analysis History
    const [aiAnalysis, setAiAnalysis] = useState({
        lastAnalysis: new Date(),
        dailySummary: 'Normal activity with movement throughout the day',
        weeklyTrend: 'up',
        recommendations: [
            'Should increase exercise slightly',
            'Should drink more water',
        ],
        anomalies: [],
    });

    // Chat History - Shared across all chat interfaces
    const getWelcomeMessage = (lang) => {
        if (lang === 'th') {
            return 'สวัสดี! ฉันคือ WheelSense AI 🤖\nพิมพ์คำสั่งหรือคำถาม!\nหรือกดปุ่มไมโครโฟนเพื่อพูดคุย 🎤';
        }
        return 'Hello! I am WheelSense AI 🤖\nType commands or questions!\nOr click the microphone button to chat 🎤';
    };

    const [chatHistory, setChatHistory] = useState(() => {
        const initialLang = localStorage.getItem('wheelsense_language') || 'en';
        return [{ id: 1, role: 'assistant', content: getWelcomeMessage(initialLang === 'th' ? 'th' : 'en') }];
    });

    // Update welcome message when language changes
    useEffect(() => {
        setChatHistory(prev => {
            // If first message is welcome message, update it
            if (prev.length > 0 && prev[0].id === 1 && prev[0].role === 'assistant') {
                return [
                    { id: 1, role: 'assistant', content: getWelcomeMessage(language) },
                    ...prev.slice(1)
                ];
            }
            return prev;
        });
    }, [language]);

    // Helper function to add chat message with duplicate prevention
    const addChatMessage = useCallback((message) => {
        setChatHistory(prev => {
            // Check if message already exists (avoid duplicates based on content and timing)
            const exists = prev.some(m =>
                m.role === message.role &&
                m.content === message.content &&
                Math.abs((m.id || 0) - (message.id || 0)) < 5000 // Same message within 5 seconds
            );
            if (exists) {
                console.log('%c⚠️ [AppContext] Duplicate chat message detected, skipping', 'color: #ffa94d;');
                return prev;
            }
            console.log('%c✅ [AppContext] Adding message to chat history', 'color: #51cf66; font-weight: bold;', message.content);
            return [...prev, { ...message, id: message.id || Date.now() }];
        });
    }, []);

    // Helper function to clear chat history (reset to welcome message)
    const clearChatHistory = useCallback(() => {
        setChatHistory([{ id: 1, role: 'assistant', content: getWelcomeMessage(language) }]);
    }, [language]);

    // Fetch data from API - Auto-loads all data from database on startup
    // Retries automatically if API returns 503 (backend initializing)
    const fetchData = useCallback(async (retryCount = 0) => {
        const MAX_RETRIES = 5;
        const RETRY_DELAY = 3000; // 3 seconds

        setIsLoading(true);
        setError(null);

        try {
            // Fetch all data from database
            const [roomsData, patientsData, devicesData, mapConfig, buildingsData, floorsData, wheelchairsData, appliancesData, userInfoData] = await Promise.all([
                api.getRooms().catch((err) => {
                    // If 503 and haven't exceeded retries, return null to trigger retry
                    if (err.message?.includes('503') || err.message?.includes('Service temporarily unavailable')) {
                        if (retryCount < MAX_RETRIES) {
                            console.log(`[AppContext] API returned 503 for rooms, will retry (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                            return null; // Signal to retry
                        }
                    }
                    return [];
                }),
                api.getPatients().catch(() => []),
                api.getDevices().catch(() => []),
                api.getMapConfig().catch(() => null),
                api.getBuildings().catch(() => []),
                api.getFloors().catch(() => []),
                api.getWheelchairs().catch((err) => {
                    // If 503 and haven't exceeded retries, return null to trigger retry
                    if (err.message?.includes('503') || err.message?.includes('Service temporarily unavailable')) {
                        if (retryCount < MAX_RETRIES) {
                            console.log(`[AppContext] API returned 503 for wheelchairs, will retry (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                            return null; // Signal to retry
                        }
                    }
                    return [];
                }),
                api.getAllAppliances().catch(() => ({})),
                api.getUserInfo().catch(() => null), // Load userInfo from database
            ]);

            // Check if critical data (rooms/wheelchairs) failed with 503 and need retry
            const needsRetry = (roomsData === null || wheelchairsData === null) && retryCount < MAX_RETRIES;

            if (needsRetry) {
                console.log(`[AppContext] Critical data unavailable (503), retrying in ${RETRY_DELAY}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                setIsLoading(false);
                setTimeout(() => {
                    fetchData(retryCount + 1);
                }, RETRY_DELAY);
                return;
            }

            // Update rooms if API returns data
            if (roomsData && roomsData.length > 0) {
                console.log('[AppContext] Auto-loaded rooms from API:', roomsData.length);
                setRooms(roomsData);
            } else if (roomsData === null) {
                console.warn('[AppContext] Failed to load rooms after retries, using empty array');
            }

            // Update patients if API returns data
            if (patientsData && patientsData.length > 0) {
                console.log('[AppContext] Auto-loaded patients from API:', patientsData.length);
                setPatients(patientsData);
                // Set first patient as current user (for user mode)
                setCurrentUser(patientsData[0]);
            }

            // Update wheelchairs if API returns data
            if (wheelchairsData && wheelchairsData.length > 0) {
                console.log('[AppContext] Auto-loaded wheelchairs from API:', wheelchairsData.length);
                setWheelchairs(wheelchairsData);
            } else if (wheelchairsData === null) {
                console.warn('[AppContext] Failed to load wheelchairs after retries, using empty array');
            }

            // Update appliances if API returns data
            if (appliancesData && Object.keys(appliancesData).length > 0) {
                console.log('[AppContext] Auto-loaded appliances from API:', Object.keys(appliancesData).length, 'rooms');
                setAppliances(appliancesData);
            }

            // Update userInfo if API returns data
            if (userInfoData) {
                console.log('[AppContext] Auto-loaded userInfo from API:', userInfoData);
                // Normalize the API response format (nested name object) to flat format used by state
                setUserInfo({
                    name_thai: userInfoData.name?.thai || '',
                    name_english: userInfoData.name?.english || '',
                    condition: userInfoData.condition || '',
                    current_location: userInfoData.current_location || ''
                });
            }

            // Update devices if API returns data
            if (devicesData && devicesData.length > 0) setDevices(devicesData);

            // Update buildings/floors - primary source is dedicated collections
            if (buildingsData && buildingsData.length > 0) {
                console.log('[AppContext] Auto-loaded buildings from API:', buildingsData.length, buildingsData);
                setBuildings(buildingsData);
                // Update selectedBuilding if current selection is not in the list
                if (!buildingsData.find(b => b.id === selectedBuilding) && buildingsData[0]) {
                    console.log('[AppContext] Setting selectedBuilding to:', buildingsData[0].id);
                    setSelectedBuilding(buildingsData[0].id);
                }
            }
            if (floorsData && floorsData.length > 0) {
                console.log('[AppContext] Auto-loaded floors from API:', floorsData.length, floorsData);
                setFloors(floorsData);
                // Update selectedFloor if current selection is not in the list
                if (!floorsData.find(f => f.id === selectedFloor) && floorsData[0]) {
                    console.log('[AppContext] Setting selectedFloor to:', floorsData[0].id);
                    setSelectedFloor(floorsData[0].id);
                }
            }

            // Update wheelchair positions (and fallback buildings/floors) from map config
            if (mapConfig) {
                if (mapConfig.wheelchairPositions) {
                    setWheelchairPositions(mapConfig.wheelchairPositions);
                }

                // Only use map config buildings/floors as fallback if collections are empty
                if ((!buildingsData || buildingsData.length === 0) && Array.isArray(mapConfig.buildings) && mapConfig.buildings.length > 0) {
                    setBuildings(mapConfig.buildings);
                }
                if ((!floorsData || floorsData.length === 0) && Array.isArray(mapConfig.floors) && mapConfig.floors.length > 0) {
                    setFloors(mapConfig.floors);
                }
            }

        } catch (err) {
            console.error('Failed to fetch data:', err);
            setError(err.message);

            // Retry on 503 errors
            if ((err.message?.includes('503') || err.message?.includes('Service temporarily unavailable')) && retryCount < MAX_RETRIES) {
                console.log(`[AppContext] API error (503), retrying in ${RETRY_DELAY}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                setIsLoading(false);
                setTimeout(() => {
                    fetchData(retryCount + 1);
                }, RETRY_DELAY);
                return;
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial data fetch - Auto-load map and rooms on startup
    useEffect(() => {
        console.log('[AppContext] Initializing - auto-loading rooms and map data');
        fetchData();
    }, [fetchData]);

    // Periodic refresh: If rooms or wheelchairs are empty, retry every 10 seconds
    // This helps when backend is initializing and returns 503
    useEffect(() => {
        // Only set up refresh if critical data is missing
        if (rooms.length === 0 || wheelchairs.length === 0) {
            const refreshInterval = setInterval(() => {
                console.log('[AppContext] Critical data missing (rooms:', rooms.length, ', wheelchairs:', wheelchairs.length, '), refreshing...');
                fetchData();
            }, 10000); // Check every 10 seconds

            return () => clearInterval(refreshInterval);
        }
    }, [fetchData, rooms.length, wheelchairs.length]);

    // Simple periodic refresh for rooms to see updated isOccupied status
    useEffect(() => {
        const refreshRooms = async () => {
            try {
                const roomsData = await api.getRooms();
                if (roomsData && roomsData.length > 0) {
                    setRooms(roomsData);
                }
            } catch (error) {
                console.error('[AppContext] Failed to refresh rooms:', error);
            }
        };

        // Refresh rooms every 2 seconds to see updated occupancy status
        const interval = setInterval(refreshRooms, 2000);
        return () => clearInterval(interval);
    }, []);

    // Periodically fetch live node status to keep device status updated across the app
    useEffect(() => {
        const updateDeviceStatus = async () => {
            try {
                const liveNodes = await api.getNodesLiveStatus();
                if (!liveNodes || !Array.isArray(liveNodes)) return;

                setDevices(prevDevices => {
                    let hasChanges = false;
                    const updated = prevDevices.map(device => {
                        // Match by multiple ID strategies
                        const liveNode = liveNodes.find(n =>
                            n.id === device.id ||
                            n.deviceId === device.id ||
                            n.id === device.deviceId ||
                            n.device_id === device.id
                        );

                        if (liveNode) {
                            const newStatus = liveNode.online ? 'online' : 'offline';
                            const newLastSeen = liveNode.last_seen || liveNode.lastSeen || device.lastSeen;
                            const newIp = liveNode.ip || device.ip;

                            // Only update if changed prevents unnecessary re-renders
                            if (device.status !== newStatus || device.lastSeen !== newLastSeen || device.ip !== newIp) {
                                hasChanges = true;
                                return {
                                    ...device,
                                    status: newStatus,
                                    lastSeen: newLastSeen,
                                    ip: newIp
                                };
                            }
                        }
                        return device;
                    });

                    return hasChanges ? updated : prevDevices;
                });
            } catch (err) {
                // Silent error to avoid console spam
            }
        };

        // Initial update
        updateDeviceStatus();

        // Check every 5 seconds
        const interval = setInterval(updateDeviceStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    // Refs to hold current state for WebSocket callbacks (prevents dependency issues)
    const wheelchairsRef = useRef(wheelchairs);
    const roomsRef = useRef(rooms);
    const devicesRef = useRef(devices);
    const currentUserRef = useRef(currentUser);

    // Keep refs updated
    useEffect(() => {
        wheelchairsRef.current = wheelchairs;
    }, [wheelchairs]);

    useEffect(() => {
        roomsRef.current = rooms;
    }, [rooms]);

    useEffect(() => {
        devicesRef.current = devices;
    }, [devices]);

    useEffect(() => {
        currentUserRef.current = currentUser;
    }, [currentUser]);

    // WebSocket connection for real-time updates (wheelchair detection, device registration, etc.)
    // Note: Appliance control uses MQTT via API endpoint /appliances/control
    useEffect(() => {
        let ws = null;
        let reconnectTimeout = null;

        const connectWebSocket = () => {
            try {
                const baseUrl = import.meta.env.VITE_API_URL || '/api';
                const wsUrl = baseUrl.startsWith('http')
                    ? baseUrl.replace('http', 'ws') + '/ws'
                    : (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + baseUrl + '/ws';

                console.log('[AppContext] Connecting to WebSocket:', wsUrl);
                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    console.log('[AppContext] WebSocket connected for real-time updates');
                };

                ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        console.log('[AppContext] WebSocket message:', message);
                        // #region agent log
                        if (message.type === 'schedule_notification') {
                            fetch('http://127.0.0.1:7242/ingest/124fafc7-2206-4943-b3f5-6f57d1dae272', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'AppContext.jsx:409', message: 'WebSocket schedule_notification received', data: message, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'D' }) }).catch(() => { });
                        }
                        // #endregion

                        // Use refs to access current state
                        const currentWheelchairs = wheelchairsRef.current;
                        const currentRooms = roomsRef.current;
                        const currentDevices = devicesRef.current;
                        const currentUserVal = currentUserRef.current;

                        // Handle wheelchair detection - ONLY from detection-test page (localhost:3001)
                        // Ignore direct detections from camera-service
                        if (message.type === 'wheelchair_detection') {
                            const { room, detected, bbox, frame_size, confidence, device_id, timestamp, source } = message;

                            // IMPORTANT: Only accept detection from detection-test page
                            if (source !== 'detection-test') {
                                console.log(`[AppContext] Ignoring detection from source: ${source || 'unknown'} (only accepting from detection-test)`);
                                return;
                            }

                            // STEP 1: Update room color immediately (green when detected=true)
                            // When wheelchair is detected in a new room, clear all other rooms to detected=false
                            // This ensures only ONE room shows green at a time

                            // Normalize room name (lowercase, no spaces) to match backend format
                            const normalizeRoomName = (name) => name?.toLowerCase()?.replace(/\s+/g, '') || '';
                            const normalizedRoom = normalizeRoomName(room);

                            setDetectionState(prev => {
                                if (detected) {
                                    // Clear all rooms and set only the current room as detected
                                    const newState = {};
                                    Object.keys(prev).forEach(key => {
                                        newState[key] = {
                                            ...prev[key],
                                            detected: false
                                        };
                                    });
                                    newState[normalizedRoom] = {
                                        detected: true,
                                        confidence: confidence || 0.0,
                                        timestamp: timestamp || new Date().toISOString(),
                                        device_id: device_id || 'unknown'
                                    };
                                    console.log(`[AppContext] 🟢 Wheelchair moved to "${normalizedRoom}" - cleared detection from other rooms`);
                                    return newState;
                                } else {
                                    // Update the current room to false
                                    // Also ensure all other rooms are cleared when receiving false for a room
                                    const newState = { ...prev };
                                    newState[normalizedRoom] = {
                                        detected: false,
                                        confidence: confidence || 0.0,
                                        timestamp: timestamp || new Date().toISOString(),
                                        device_id: device_id || 'unknown'
                                    };
                                    console.log(`[AppContext] 🔴 Room "${normalizedRoom}" cleared (detected=false)`);
                                    return newState;
                                }
                            });

                            console.log(`[AppContext] 🟢 Room "${room}" detection from detection-test: detected=${detected}`);
                            // Detection state is updated - room will show green icon when detected=true
                            // No wheelchair position tracking needed in new simplified system
                        }

                        // Handle device registration
                        // Only show notification once when device first registers (to prevent spam)
                        if (message.type === 'device_registered') {
                            console.log('[AppContext] Device registered:', message);

                            // Check if this device was already registered (to prevent duplicate notifications)
                            const deviceId = message.device_id;
                            const existingDevice = currentDevices.find(d =>
                                (d.id === deviceId || d.deviceId === deviceId)
                            );

                            // Only notify if this is a new device registration
                            if (!existingDevice) {
                                const roomName = currentRooms.find(r =>
                                    r.id === message.room ||
                                    r.roomType === message.room ||
                                    r.nameEn?.toLowerCase() === message.room?.toLowerCase()
                                )?.nameEn ||
                                    currentRooms.find(r =>
                                        r.id === message.room ||
                                        r.roomType === message.room ||
                                        r.nameEn?.toLowerCase() === message.room?.toLowerCase()
                                    )?.name ||
                                    message.room ||
                                    'Unknown Room';

                                addNotification({
                                    type: 'success',
                                    title: 'Device Registered',
                                    message: `${deviceId} has been registered - Room: ${roomName}`
                                });
                            }
                        }

                        // Handle status updates
                        if (message.type === 'status_update') {
                            // Update room status if needed
                            console.log('[AppContext] Status update:', message);
                        }

                        // Handle wheelchair updates from backend - SIMPLIFIED: no debouncing
                        if (message.type === 'wheelchair_updated') {
                            const updatedWheelchair = message.wheelchair;
                            const newPosition = message.position;
                            const newRoomId = message.room_id;

                            // Update wheelchair in local state
                            setWheelchairs(prev => prev.map(w =>
                                w.id === updatedWheelchair.id ? { ...w, ...updatedWheelchair } : w
                            ));

                            // Update position if provided
                            if (updatedWheelchair.room || newRoomId) {
                                const targetRoomId = newRoomId || updatedWheelchair.room;
                                const roomData = currentRooms.find(r =>
                                    r.id === targetRoomId ||
                                    r.roomType?.toLowerCase() === targetRoomId?.toLowerCase() ||
                                    r.nameEn?.toLowerCase() === targetRoomId?.toLowerCase()
                                );

                                if (roomData) {
                                    if (newPosition && newPosition.x !== undefined && newPosition.y !== undefined) {
                                        setWheelchairPositions(prev => ({
                                            ...prev,
                                            [updatedWheelchair.id]: { x: newPosition.x, y: newPosition.y, room: roomData.id }
                                        }));
                                    } else {
                                        // Use center of room if no position provided
                                        const centerX = (roomData.x || 50) + (roomData.width || 20) / 2;
                                        const centerY = (roomData.y || 50) + (roomData.height || 20) / 2;
                                        setWheelchairPositions(prev => ({
                                            ...prev,
                                            [updatedWheelchair.id]: { x: centerX, y: centerY, room: roomData.id }
                                        }));
                                    }
                                }
                            }
                        }

                        // Handle appliance state updates from backend (real-time sync)
                        // Also sync device states since they're the source of truth
                        if (message.type === 'appliance_update') {
                            const { room, appliance, state, value } = message;
                            console.log(`[AppContext] 🔌 Appliance update received: ${room}/${appliance} = ${state}`);

                            setAppliances(prev => {
                                // Find the room key that matches
                                let roomKey = room;
                                const roomKeys = Object.keys(prev);

                                // Try to find matching room key
                                if (!roomKeys.includes(room)) {
                                    // Try lowercase match
                                    const lowerRoom = room.toLowerCase();
                                    roomKey = roomKeys.find(k => k.toLowerCase() === lowerRoom) || room;
                                }

                                const roomAppliances = prev[roomKey] || [];
                                const updatedAppliances = roomAppliances.map(app => {
                                    if (app.type === appliance || app.type?.toLowerCase() === appliance?.toLowerCase()) {
                                        const updated = { ...app, state };
                                        if (value !== null && value !== undefined) {
                                            updated.value = value;
                                        }
                                        return updated;
                                    }
                                    return app;
                                });

                                return {
                                    ...prev,
                                    [roomKey]: updatedAppliances
                                };
                            });

                            // WebSocket update IS the source of truth - no need to refetch
                            // REMOVED: setTimeout refresh that was overwriting WS updates with stale data
                        }

                        // Handle user_info_update
                        if (message.type === 'user_info_update') {
                            const { data } = message;
                            console.log('[AppContext] 👤 User info update received:', data);

                            // Normalize: handle both API format (nested name) and WebSocket format (flat)
                            const normalizedData = {
                                name_thai: data.name_thai || data.name?.thai || '',
                                name_english: data.name_english || data.name?.english || '',
                                condition: data.condition || '',
                                current_location: data.current_location || ''
                            };

                            setUserInfo(prev => ({ ...prev, ...normalizedData }));
                        }

                        // Handle device_state_update
                        // Refresh from database to ensure consistency (database is source of truth)
                        if (message.type === 'device_state_update') {
                            const { room, device, state } = message;
                            console.log(`[AppContext] 🔌 Device state update received: ${room}/${device} = ${state}`);

                            setDeviceStates(prev => ({
                                ...prev,
                                [room]: {
                                    ...prev[room],
                                    [device]: state
                                }
                            }));

                            // WebSocket update IS the source of truth - no need to refetch
                            // REMOVED: setTimeout refresh that was overwriting WS updates with stale data
                        }

                        // Handle notification (schedule, room change alerts)
                        if (message.type === 'notification') {
                            const notificationData = message.data || message;
                            console.log('[AppContext] 🔔 Notification received:', notificationData);

                            // Set pending notification for AIChatPopup to handle
                            setPendingNotification(notificationData);
                        }

                        // Handle schedule_item_update
                        if (message.type === 'schedule_item_update') {
                            const { action, item, item_id } = message;
                            console.log('[AppContext] 📅 Schedule item update received:', action, item);

                            if (action === 'reset') {
                                // Reload all schedule items from API
                                const loadScheduleItems = async () => {
                                    try {
                                        const response = await api.getScheduleItems();
                                        setScheduleItems(response.schedule_items || response || []);
                                    } catch (err) {
                                        console.error('[AppContext] Failed to reload schedule items:', err);
                                    }
                                };
                                loadScheduleItems();
                            } else {
                                // Update local state based on action
                                setScheduleItems(prev => {
                                    if (action === 'created') {
                                        return [...prev, { ...item, id: item_id }];
                                    } else if (action === 'updated') {
                                        return prev.map(si => si.id === item_id ? { ...si, ...item } : si);
                                    } else if (action === 'deleted') {
                                        return prev.filter(si => si.id !== item_id);
                                    }
                                    return prev;
                                });
                            }
                        }

                        // Handle house_check_notification (immediate WebSocket delivery)
                        if (message.type === 'house_check_notification') {
                            const { message: notificationMessage, content, data } = message;
                            console.log('[AppContext] 🔔 House check notification received:', notificationMessage);

                            // Add notification to chat history immediately (without waiting for database poll)
                            const notificationEntry = {
                                id: Date.now(),
                                role: 'assistant',
                                content: content || `🔔 ${notificationMessage}`,
                                isNotification: true,
                                devices: data?.devices || []
                            };

                            setChatHistory(prev => {
                                // Check if notification already exists (avoid duplicates)
                                const exists = prev.some(m =>
                                    m.isNotification &&
                                    m.content === notificationEntry.content &&
                                    Math.abs((m.id || 0) - notificationEntry.id) < 1000 // Within 1 second
                                );
                                if (exists) {
                                    console.log('[AppContext] Notification already exists, skipping duplicate');
                                    return prev;
                                }
                                return [...prev, notificationEntry];
                            });
                        }

                        // Note: schedule_notification is still handled via database polling
                        // House check notifications now use WebSocket for immediate delivery (above)
                        // Database polling continues as fallback for both types

                    } catch (e) {
                        console.error('[AppContext] WebSocket message parse error:', e);
                    }
                };

                ws.onerror = (error) => {
                    // WebSocket is optional - log silently, don't show errors to user
                    console.debug('[AppContext] WebSocket error (optional):', error);
                };

                ws.onclose = () => {
                    // WebSocket is optional - disconnect silently, system works via REST polling
                    console.debug('[AppContext] WebSocket disconnected (optional, will reconnect silently)');
                    // Reconnect after 5 seconds (silent reconnection)
                    reconnectTimeout = setTimeout(connectWebSocket, 5000);
                };

            } catch (error) {
                // WebSocket is optional - log silently, system works via REST polling
                console.debug('[AppContext] Failed to connect WebSocket (optional):', error);
                // Retry after 5 seconds (silent retry)
                reconnectTimeout = setTimeout(connectWebSocket, 5000);
            }
        };

        connectWebSocket();

        return () => {
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
            if (ws) {
                ws.close();
            }
        };
    }, []); // Empty dependency array - WebSocket connects once and uses refs for current state

    // REST polling for wheelchair detection (fallback when WebSocket unavailable)
    useEffect(() => {
        const pollWheelchairPositions = async () => {
            try {
                const positions = await api.getWheelchairPositions();
                if (positions && positions.positions) {
                    // Update detection state based on wheelchair positions
                    // Find which room has a wheelchair
                    const roomsWithWheelchairs = new Set();
                    Object.values(positions.positions).forEach(pos => {
                        if (pos && pos.room) {
                            roomsWithWheelchairs.add(pos.room.toLowerCase().replace(/\s+/g, ''));
                        }
                    });

                    // Update detection state: detected=true for rooms with wheelchairs, false for others
                    setDetectionState(prev => {
                        const newState = { ...prev };
                        // Clear all rooms first
                        Object.keys(newState).forEach(room => {
                            newState[room] = { ...newState[room], detected: false };
                        });
                        // Set detected=true for rooms with wheelchairs
                        roomsWithWheelchairs.forEach(room => {
                            newState[room] = {
                                detected: true,
                                confidence: 1.0,
                                timestamp: new Date().toISOString(),
                                device_id: 'rest-poll'
                            };
                        });
                        return newState;
                    });
                }
            } catch (error) {
                // Silent error - polling is fallback only
                console.debug('[AppContext] Failed to poll wheelchair positions:', error);
            }
        };

        // Poll every 3 seconds (less frequent than WebSocket, but ensures updates)
        pollWheelchairPositions();
        const interval = setInterval(pollWheelchairPositions, 3000);
        return () => clearInterval(interval);
    }, []);

    // REST polling for schedule items (fallback when WebSocket unavailable)
    useEffect(() => {
        const pollScheduleItems = async () => {
            try {
                const response = await api.getScheduleItems();
                if (response && response.schedule_items) {
                    setScheduleItems(response.schedule_items || []);
                }
            } catch (error) {
                // Silent error - polling is fallback only
                console.debug('[AppContext] Failed to poll schedule items:', error);
            }
        };

        // Poll every 10 seconds (schedule changes are infrequent)
        pollScheduleItems();
        const interval = setInterval(pollScheduleItems, 10000);
        return () => clearInterval(interval);
    }, []);

    // Load appliances once on startup
    // Real-time updates are handled by WebSocket (appliance_update event)
    // REMOVED: 5-second polling which was overwriting WebSocket updates with stale data
    useEffect(() => {
        const loadAppliances = async () => {
            try {
                const allAppliances = await api.getAllAppliances();
                if (allAppliances) {
                    console.log('[AppContext] Loaded appliances on startup');
                    setAppliances(allAppliances);
                }
            } catch (error) {
                console.error('[AppContext] Failed to load appliances:', error);
            }
        };

        // Load only once on startup
        loadAppliances();
        // NO POLLING - rely on WebSocket updates from backend
    }, []);

    // Load device states once on startup
    // Real-time updates are handled by WebSocket (device_state_update event)
    // REMOVED: 3-second polling which was overwriting WebSocket updates with stale data
    useEffect(() => {
        const loadDeviceStates = async () => {
            try {
                const response = await api.getAllDeviceStates();
                if (response && response.device_states) {
                    console.log('[AppContext] Loaded device states on startup:', response.device_states);
                    setDeviceStates(response.device_states);
                }
            } catch (error) {
                console.error('[AppContext] Failed to load device states:', error);
            }
        };

        // Load only once on startup
        loadDeviceStates();
        // NO POLLING - rely on WebSocket updates from backend
    }, []);

    // Theme effect
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    // Compact mode effect
    useEffect(() => {
        if (compactMode) {
            document.body.classList.add('compact-mode');
        } else {
            document.body.classList.remove('compact-mode');
        }
    }, [compactMode]);

    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

    const openDrawer = (content) => {
        setDrawerContent(content);
        setDrawerOpen(true);
    };

    const closeDrawer = () => {
        setDrawerOpen(false);
        setTimeout(() => setDrawerContent(null), 300);
    };

    const openModal = (content) => {
        console.log('[AppContext] openModal called with content:', content);
        console.log('[AppContext] Content type:', typeof content);
        if (content && typeof content === 'object' && content.$$typeof) {
            console.log('[AppContext] Content is React element');
        }
        if (!content) {
            console.warn('[AppContext] openModal called with null/undefined content');
            return;
        }
        setModalContent(content);
        setModalOpen(true);
        console.log('[AppContext] Modal state updated: modalOpen = true');
    };

    const closeModal = () => {
        console.log('[AppContext] closeModal called');
        setModalOpen(false);
        setTimeout(() => {
            setModalContent(null);
            console.log('[AppContext] Modal content cleared');
        }, 300);
    };

    const addNotification = (notification) => {
        setNotifications(prev => {
            // Prevent duplicates - check if notification with same title and message already exists
            const isDuplicate = prev.some(n =>
                n.title === notification.title &&
                n.message === notification.message &&
                Math.abs(new Date(n.time).getTime() - new Date(notification.time || Date.now()).getTime()) < 5000 // Within 5 seconds
            );

            if (isDuplicate) {
                console.log('[AppContext] Duplicate notification prevented:', notification.title);
                return prev;
            }

            // Limit to last 50 notifications to prevent memory issues
            const newNotification = { id: Date.now(), time: new Date(), read: false, ...notification };
            const updated = [newNotification, ...prev].slice(0, 50);
            return updated;
        });
    };

    const markNotificationRead = (id) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllNotificationsRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const toggleAppliance = async (room, applianceId) => {
        // Find room key - could be roomId, roomType, or nameEn
        let roomKey = room;
        const roomData = rooms.find(r => r.id === room);
        if (roomData) {
            // Use roomType or nameEn as the key for appliances
            roomKey = roomData.roomType || roomData.nameEn?.toLowerCase() || room;
        }

        // Try multiple room key options
        let roomAppliances = appliances[roomKey] || appliances[room] || [];

        // If not found by roomKey, try to find by roomType mapping
        if (roomAppliances.length === 0) {
            const roomMapping = {
                'bedroom': ['bed room', 'bedroom', 'Bedroom'],
                'bathroom': ['bathroom', 'Bathroom'],
                'livingroom': ['living room', 'livingroom', 'Living Room'],
                'kitchen': ['kitchen', 'Kitchen']
            };

            for (const [key, names] of Object.entries(roomMapping)) {
                if (names.some(n => room.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(room.toLowerCase()))) {
                    roomAppliances = appliances[key] || [];
                    roomKey = key;
                    break;
                }
            }
        }

        const appliance = roomAppliances.find(a => a.id === applianceId);
        if (!appliance) {
            console.warn(`[toggleAppliance] Appliance ${applianceId} not found in room ${room} (key: ${roomKey})`);
            return;
        }

        const newState = !appliance.state;

        // Local state update removed - synced via WebSocket

        // Send control command to ESP8266 via MQTT
        try {
            console.log(`[toggleAppliance] Sending MQTT: room=${roomKey}, appliance=${appliance.type}, state=${newState}`);
            await api.controlAppliance(roomKey, appliance.type, newState);

            // Refetch appliances immediately after control (REST fallback if WebSocket unavailable)
            try {
                const allAppliances = await api.getAllAppliances();
                if (allAppliances) {
                    setAppliances(allAppliances);
                }
            } catch (refetchErr) {
                console.debug('[AppContext] Failed to refetch appliances after control:', refetchErr);
            }
        } catch (err) {
            console.error('Failed to control appliance via MQTT:', err);
        }
    };

    const setApplianceValue = async (room, applianceId, key, value) => {
        // Find room key similar to toggleAppliance
        let roomKey = room;
        const roomData = rooms.find(r => r.id === room);
        if (roomData) {
            roomKey = roomData.roomType || roomData.nameEn?.toLowerCase() || room;
        }

        // Try multiple room key options
        let roomAppliances = appliances[roomKey] || appliances[room] || [];

        // If not found by roomKey, try to find by roomType mapping
        if (roomAppliances.length === 0) {
            const roomMapping = {
                'bedroom': ['bed room', 'bedroom', 'Bedroom'],
                'bathroom': ['bathroom', 'Bathroom'],
                'livingroom': ['living room', 'livingroom', 'Living Room'],
                'kitchen': ['kitchen', 'Kitchen']
            };

            for (const [key, names] of Object.entries(roomMapping)) {
                if (names.some(n => room.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(room.toLowerCase()))) {
                    roomAppliances = appliances[key] || [];
                    roomKey = key;
                    break;
                }
            }
        }

        const appliance = roomAppliances.find(a => a.id === applianceId);
        if (!appliance) {
            console.warn(`[setApplianceValue] Appliance ${applianceId} not found in room ${room} (key: ${roomKey})`);
            return;
        }

        // Local state update removed - synced via WebSocket

        // Send control command to ESP8266 via MQTT
        // Map value keys to ESP8266 format:
        // - brightness -> appliance: "light", value name: "brightness"
        // - temperature -> appliance: "AC", value name: "temperature"
        // - volume -> appliance: "tv", value name: "volume"
        // - speed -> appliance: "fan", value name: "speed"
        try {
            // ESP8266 expects: appliance type and value name separately
            // For now, send the value with the appliance type
            // The backend will forward it correctly
            console.log(`[setApplianceValue] Sending MQTT: room=${roomKey}, appliance=${appliance.type}, ${key}=${value}`);
            await api.controlAppliance(roomKey, appliance.type, true, value);

            // Refetch appliances immediately after control (REST fallback if WebSocket unavailable)
            try {
                const allAppliances = await api.getAllAppliances();
                if (allAppliances) {
                    setAppliances(allAppliances);
                }
            } catch (refetchErr) {
                console.debug('[AppContext] Failed to refetch appliances after control:', refetchErr);
            }
        } catch (err) {
            console.error('Failed to set appliance value via MQTT:', err);
        }
    };

    const addRoutine = (routine) => {
        const newRoutine = { id: `R${Date.now()}`, completed: false, ...routine };
        setRoutines(prev => [...prev, newRoutine]);

        // Add to timeline
        setTimeline(prev => [{
            id: Date.now(),
            type: 'routine',
            room: null,
            patientId: routine.patientId,
            patient: patients.find(p => p.id === routine.patientId)?.name,
            time: new Date(),
            message: `Added activity: ${routine.title}`
        }, ...prev]);
    };

    const updateRoutine = (id, updates) => {
        setRoutines(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));

        if (updates.completed !== undefined) {
            const routine = routines.find(r => r.id === id);
            if (routine) {
                setTimeline(prev => [{
                    id: Date.now(),
                    type: 'routine',
                    room: null,
                    patientId: routine.patientId,
                    patient: patients.find(p => p.id === routine.patientId)?.name,
                    time: new Date(),
                    message: `${routine.title} - ${updates.completed ? 'Completed' : 'Not Completed'}`
                }, ...prev]);
            }
        }
    };

    const deleteRoutine = (id) => {
        const routine = routines.find(r => r.id === id);
        setRoutines(prev => prev.filter(r => r.id !== id));

        if (routine) {
            setTimeline(prev => [{
                id: Date.now(),
                type: 'routine',
                room: null,
                patientId: routine.patientId,
                patient: patients.find(p => p.id === routine.patientId)?.name,
                time: new Date(),
                message: `Deleted activity: ${routine.title}`
            }, ...prev]);
        }
    };

    const resolveEmergency = (id) => {
        setEmergencies(prev => prev.map(e => e.id === id ? { ...e, resolved: true } : e));
    };

    // Delete device - removes from local state and calls API
    const deleteDevice = async (deviceId) => {
        try {
            await api.deleteDevice(deviceId);
            setDevices(prev => prev.filter(d => d.id !== deviceId && d.deviceId !== deviceId));
        } catch (error) {
            console.error('[AppContext] Failed to delete device:', error);
            throw error;
        }
    };

    // Update device - updates local state and calls API  
    const updateDevice = async (deviceId, updates) => {
        try {
            await api.updateDevice(deviceId, updates);
            setDevices(prev => prev.map(d =>
                (d.id === deviceId || d.deviceId === deviceId)
                    ? { ...d, ...updates }
                    : d
            ));
        } catch (error) {
            console.error('[AppContext] Failed to update device:', error);
            throw error;
        }
    };

    // Function to register chat message callback (backward compatibility)
    // Now internally uses addChatMessage
    const registerChatMessageCallback = useCallback((callback) => {
        console.log('[AppContext] Registering chat message callback (using addChatMessage internally)');
        chatMessageCallbackRef.current = (message) => {
            // Call the original callback if provided
            if (callback) {
                callback(message);
            }
            // Also add to chatHistory
            addChatMessage(message);
        };
        // Return cleanup function
        return () => {
            console.log('[AppContext] Unregistering chat message callback');
            chatMessageCallbackRef.current = null;
        };
    }, [addChatMessage]);

    const value = {
        language, setLanguage: setLanguageWithLog,
        theme, setTheme, toggleTheme,
        role, setRole,
        currentUser, setCurrentUser,
        selectedBuilding, setSelectedBuilding,
        selectedFloor, setSelectedFloor,
        buildings, setBuildings,
        floors, setFloors,
        currentPage, setCurrentPage,
        sidebarOpen, setSidebarOpen,
        drawerOpen, drawerContent, openDrawer, closeDrawer,
        modalOpen, modalContent, openModal, closeModal,
        showNotifications, setShowNotifications,
        compactMode, setCompactMode,
        isLoading, error, fetchData,
        notifications, addNotification, markNotificationRead, markAllNotificationsRead,
        wheelchairs, setWheelchairs,
        wheelchairPositions, setWheelchairPositions,
        detectionState,
        patients, setPatients,
        devices, setDevices, deleteDevice, updateDevice,
        rooms, setRooms,
        appliances, setAppliances, toggleAppliance, setApplianceValue,
        timeline, setTimeline,
        routines, addRoutine, updateRoutine, deleteRoutine,
        deviceStates, setDeviceStates,
        userInfo, setUserInfo,
        scheduleItems, setScheduleItems,
        emergencies, setEmergencies, resolveEmergency,
        aiAnalysis, setAiAnalysis,
        customTime, setCustomTime, getCurrentTime,
        registerChatMessageCallback,
        chatHistory, addChatMessage, clearChatHistory, setChatHistory,
        pendingNotification, clearPendingNotification,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within AppProvider');
    return context;
}
