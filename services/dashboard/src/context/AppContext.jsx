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

    // Current user (for user mode) - Loaded from Database
    const [currentUser, setCurrentUser] = useState(null);

    // Notifications - Loaded from Database and real-time updates
    const [notifications, setNotifications] = useState([]);

    // Removed all buffering logic - simplified to immediate updates

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

    // Fetch data from API - Auto-loads all data from database on startup
    // Retries automatically if API returns 503 (backend initializing)
    const fetchData = useCallback(async (retryCount = 0) => {
        const MAX_RETRIES = 5;
        const RETRY_DELAY = 3000; // 3 seconds

        setIsLoading(true);
        setError(null);

        try {
            // Fetch all data from database
            const [roomsData, patientsData, devicesData, mapConfig, buildingsData, floorsData, wheelchairsData, appliancesData] = await Promise.all([
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
                                    newState[room] = {
                                        detected: true,
                                        confidence: confidence || 0.0,
                                        timestamp: timestamp || new Date().toISOString(),
                                        device_id: device_id || 'unknown'
                                    };
                                    console.log(`[AppContext] 🟢 Wheelchair moved to "${room}" - cleared detection from other rooms`);
                                    return newState;
                                } else {
                                    // Just update the current room
                                    return {
                                        ...prev,
                                        [room]: {
                                            detected: false,
                                            confidence: confidence || 0.0,
                                            timestamp: timestamp || new Date().toISOString(),
                                            device_id: device_id || 'unknown'
                                        }
                                    };
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

                    } catch (e) {
                        console.error('[AppContext] WebSocket message parse error:', e);
                    }
                };

                ws.onerror = (error) => {
                    console.error('[AppContext] WebSocket error:', error);
                };

                ws.onclose = () => {
                    console.log('[AppContext] WebSocket disconnected, reconnecting in 5s...');
                    // Reconnect after 5 seconds
                    reconnectTimeout = setTimeout(connectWebSocket, 5000);
                };

            } catch (error) {
                console.error('[AppContext] Failed to connect WebSocket:', error);
                // Retry after 5 seconds
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

        // Update local state
        setAppliances(prev => ({
            ...prev,
            [roomKey]: (prev[roomKey] || []).map(app =>
                app.id === applianceId ? { ...app, state: newState } : app
            )
        }));

        // Send control command to ESP8266 via MQTT
        try {
            console.log(`[toggleAppliance] Sending MQTT: room=${roomKey}, appliance=${appliance.type}, state=${newState}`);
            await api.controlAppliance(roomKey, appliance.type, newState);
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

        setAppliances(prev => ({
            ...prev,
            [roomKey]: (prev[roomKey] || []).map(app =>
                app.id === applianceId ? { ...app, [key]: value } : app
            )
        }));

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
        devices, setDevices,
        rooms, setRooms,
        appliances, setAppliances, toggleAppliance, setApplianceValue,
        timeline, setTimeline,
        routines, addRoutine, updateRoutine, deleteRoutine,
        emergencies, setEmergencies, resolveEmergency,
        aiAnalysis, setAiAnalysis,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within AppProvider');
    return context;
}
