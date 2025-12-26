import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

    // WebSocket connection for real-time updates (wheelchair detection, device registration, etc.)
    // Note: Appliance control uses MQTT via API endpoint /appliances/control
    useEffect(() => {
        let ws = null;

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

                        // Handle wheelchair detection - update position on map
                        if (message.type === 'wheelchair_detection') {
                            const { room, detected, bbox, frame_size, confidence, device_id, timestamp } = message;
                            
                            // Update detection state for this room
                            setDetectionState(prev => ({
                                ...prev,
                                [room]: {
                                    detected: detected || false,
                                    confidence: confidence || 0.0,
                                    timestamp: timestamp || new Date().toISOString(),
                                    device_id: device_id || 'unknown'
                                }
                            }));

                            console.log(`[AppContext] 🔍 Received detection: room="${room}", detected=${detected}, bbox=${bbox ? 'yes' : 'no'}, frame_size=${frame_size ? 'yes' : 'no'}`);
                            console.log(`[AppContext] Available rooms:`, (rooms || []).map(r => ({ id: r.id, name: r.name, nameEn: r.nameEn, roomType: r.roomType })));
                            console.log(`[AppContext] Available wheelchairs:`, (wheelchairs || []).map(w => ({ id: w.id, room: w.room })));

                            if (detected && bbox && Array.isArray(bbox) && bbox.length === 4) {
                                // Find wheelchair - try multiple matching strategies
                                // 1. Direct match
                                let wheelchair = wheelchairs.find(w => w.room === room);

                                // 2. Match by room ID (room-xxx format)
                                if (!wheelchair) {
                                    wheelchair = wheelchairs.find(w => w.room === room.replace('room-', '') || w.room === `room-${room}`);
                                }

                                // 3. Match by roomType or nameEn - find room first, then wheelchair
                                if (!wheelchair) {
                                    const roomData = rooms.find(r => {
                                        const roomLower = room.toLowerCase();
                                        return r.id === room ||
                                            r.roomType?.toLowerCase() === roomLower ||
                                            r.nameEn?.toLowerCase() === roomLower ||
                                            r.name?.toLowerCase().includes(roomLower) ||
                                            roomLower.includes(r.nameEn?.toLowerCase() || '') ||
                                            roomLower.includes(r.name?.toLowerCase() || '');
                                    });

                                    if (roomData) {
                                        console.log(`[AppContext] Found room data:`, roomData);
                                        // Find wheelchair by matching room name/type
                                        wheelchair = wheelchairs.find(w =>
                                            w.room === roomData.id ||
                                            w.room === roomData.roomType ||
                                            w.room === roomData.nameEn?.toLowerCase() ||
                                            w.room === roomData.name?.toLowerCase()
                                        );
                                    }
                                }

                                // 4. If still not found, use first wheelchair (fallback)
                                if (!wheelchair && wheelchairs.length > 0) {
                                    wheelchair = wheelchairs[0];
                                    console.warn(`[AppContext] ⚠️ No wheelchair found for room "${room}", using first wheelchair: ${wheelchair.id}`);
                                }

                                if (wheelchair) {
                                    console.log(`[AppContext] ✅ Found wheelchair: ${wheelchair.id} for room: ${wheelchair.room}`);

                                    // Find room data - try multiple matching strategies with better matching
                                    const roomLower = room.toLowerCase();
                                    let roomData = rooms.find(r => r.id === room);

                                    if (!roomData) {
                                        roomData = rooms.find(r => r.roomType?.toLowerCase() === roomLower);
                                    }

                                    if (!roomData) {
                                        roomData = rooms.find(r => r.nameEn?.toLowerCase() === roomLower);
                                    }

                                    // Match by partial name (e.g., "livingroom" matches "living room" or "Living Room")
                                    if (!roomData) {
                                        roomData = rooms.find(r => {
                                            const rNameEn = r.nameEn?.toLowerCase() || '';
                                            const rName = r.name?.toLowerCase() || '';
                                            return rNameEn.includes(roomLower) ||
                                                roomLower.includes(rNameEn) ||
                                                rName.includes(roomLower) ||
                                                roomLower.includes(rName);
                                        });
                                    }

                                    // Special mapping for common room names
                                    if (!roomData) {
                                        const roomMapping = {
                                            'livingroom': ['living room', 'livingroom', 'Living Room'],
                                            'bedroom': ['bed room', 'bedroom', 'Bedroom'],
                                            'kitchen': ['kitchen', 'Kitchen'],
                                            'bathroom': ['bathroom', 'Bathroom']
                                        };

                                        const possibleNames = roomMapping[roomLower] || [];
                                        roomData = rooms.find(r => {
                                            const rNameEn = r.nameEn?.toLowerCase() || '';
                                            const rName = r.name?.toLowerCase() || '';
                                            return possibleNames.some(name =>
                                                rNameEn.includes(name) ||
                                                rName.includes(name) ||
                                                name.includes(rNameEn) ||
                                                name.includes(rName)
                                            );
                                        });
                                    }

                                    // If still not found, try to find by wheelchair's room
                                    if (!roomData) {
                                        roomData = rooms.find(r =>
                                            r.id === wheelchair.room ||
                                            r.roomType?.toLowerCase() === wheelchair.room?.toLowerCase() ||
                                            r.nameEn?.toLowerCase() === wheelchair.room?.toLowerCase() ||
                                            r.name?.toLowerCase() === wheelchair.room?.toLowerCase()
                                        );
                                    }

                                    if (roomData) {
                                        console.log(`[AppContext] ✅ Found room data:`, roomData);

                                        // Calculate center position of the room
                                        const centerX = (roomData.x || 50) + (roomData.width || 20) / 2;
                                        const centerY = (roomData.y || 50) + (roomData.height || 20) / 2;

                                        // Check if wheelchair is moving to a DIFFERENT room
                                        const isChangingRoom = wheelchair.room !== roomData.id &&
                                            wheelchair.room?.toLowerCase() !== roomData.id?.toLowerCase() &&
                                            wheelchair.room?.toLowerCase() !== roomData.roomType?.toLowerCase() &&
                                            wheelchair.room?.toLowerCase() !== roomData.nameEn?.toLowerCase();

                                        if (isChangingRoom) {
                                            // CHANGING ROOM: Use existing marker position if available, otherwise center of new room
                                            const existingPos = wheelchairPositions[wheelchair.id];
                                            const newX = existingPos ? existingPos.x : centerX;
                                            const newY = existingPos ? existingPos.y : centerY;
                                            
                                            console.log(`[AppContext] 🦽 Moving wheelchair ${wheelchair.id} from ${wheelchair.room} to ${roomData.id} (using marker position: ${newX.toFixed(1)}%, ${newY.toFixed(1)}%)`);

                                            setWheelchairPositions(prev => {
                                                const updated = {
                                                    ...prev,
                                                    [wheelchair.id]: { x: newX, y: newY }
                                                };

                                                api.saveWheelchairPositions(updated).catch(err => {
                                                    console.error('Failed to save wheelchair position:', err);
                                                });

                                                console.log(`[AppContext] 🦽 Wheelchair ${wheelchair.id} placed at ${roomData.name || room}: (${newX.toFixed(1)}%, ${newY.toFixed(1)}%)`);

                                                return updated;
                                            });

                                            // Update wheelchair.room
                                            setWheelchairs(prev => prev.map(w =>
                                                w.id === wheelchair.id
                                                    ? { ...w, room: roomData.id }
                                                    : w
                                            ));

                                            // Update patient(s) who use this wheelchair
                                            setPatients(prev => prev.map(p => {
                                                if (p.wheelchairId === wheelchair.id) {
                                                    console.log(`[AppContext] 📍 Updating patient ${p.id} room from ${p.room} to ${roomData.id}`);
                                                    // Save to API
                                                    api.updatePatient(p.id, { room: roomData.id }).catch(err => {
                                                        console.error('Failed to save patient room:', err);
                                                    });
                                                    return { ...p, room: roomData.id };
                                                }
                                                return p;
                                            }));

                                            // Also update currentUser.room if this is their wheelchair
                                            if (currentUser && wheelchair.id === currentUser.wheelchairId) {
                                                console.log(`[AppContext] 📍 Updating currentUser room from ${currentUser.room} to ${roomData.id}`);
                                                setCurrentUser(prev => ({ ...prev, room: roomData.id }));
                                            }
                                        } else {
                                            // SAME ROOM: Update position but also ensure patient.room is correct
                                            // Check if wheelchair.room needs to be updated to match detected room
                                            const needsRoomUpdate = wheelchair.room !== roomData.id &&
                                                wheelchair.room?.toLowerCase() !== roomData.id?.toLowerCase() &&
                                                wheelchair.room?.toLowerCase() !== roomData.roomType?.toLowerCase() &&
                                                wheelchair.room?.toLowerCase() !== roomData.nameEn?.toLowerCase();

                                            if (needsRoomUpdate) {
                                                console.log(`[AppContext] 📍 Updating wheelchair ${wheelchair.id} room from ${wheelchair.room} to ${roomData.id} (same room detection)`);
                                                
                                                // Update wheelchair.room
                                                setWheelchairs(prev => prev.map(w =>
                                                    w.id === wheelchair.id
                                                        ? { ...w, room: roomData.id }
                                                        : w
                                                ));

                                                // Update patient(s) who use this wheelchair
                                                setPatients(prev => prev.map(p => {
                                                    if (p.wheelchairId === wheelchair.id) {
                                                        console.log(`[AppContext] 📍 Updating patient ${p.id} room from ${p.room} to ${roomData.id}`);
                                                        // Save to API
                                                        api.updatePatient(p.id, { room: roomData.id }).catch(err => {
                                                            console.error('Failed to save patient room:', err);
                                                        });
                                                        return { ...p, room: roomData.id };
                                                    }
                                                    return p;
                                                }));

                                                // Also update currentUser.room if this is their wheelchair
                                                if (currentUser && wheelchair.id === currentUser.wheelchairId) {
                                                    console.log(`[AppContext] 📍 Updating currentUser room from ${currentUser.room} to ${roomData.id}`);
                                                    setCurrentUser(prev => ({ ...prev, room: roomData.id }));
                                                }
                                            }

                                            // Use existing marker position if available, don't override with bbox calculation
                                            const existingPos = wheelchairPositions[wheelchair.id];
                                            
                                            if (existingPos) {
                                                // Keep existing marker position - don't update from bbox
                                                console.log(`[AppContext] 🦽 Keeping wheelchair ${wheelchair.id} at existing marker position: (${existingPos.x.toFixed(1)}%, ${existingPos.y.toFixed(1)}%)`);
                                            } else {
                                                // No existing position: calculate from bbox or use center
                                                let newX, newY;
                                                
                                                if (frame_size && bbox) {
                                                    // SAME ROOM with valid bbox: Use bbox for precise position
                                                    const [x, y, w, h] = bbox;
                                                    const frameWidth = frame_size.width || 640;
                                                    const frameHeight = frame_size.height || 480;

                                                    // Calculate center of bbox in pixel coordinates
                                                    const bboxCenterX = x + w / 2;
                                                    const bboxCenterY = y + h / 2;

                                                    // Convert to percentage of video frame (0-100%)
                                                    const videoXPercent = (bboxCenterX / frameWidth) * 100;
                                                    const videoYPercent = (bboxCenterY / frameHeight) * 100;

                                                    // Map video percentage to room position on map
                                                    const roomX = roomData.x || 50;
                                                    const roomY = roomData.y || 50;
                                                    const roomWidth = roomData.width || 20;
                                                    const roomHeight = roomData.height || 20;

                                                    // Convert video percentage to map percentage
                                                    newX = roomX + (videoXPercent / 100) * roomWidth;
                                                    newY = roomY + (videoYPercent / 100) * roomHeight;

                                                    // Clamp to room bounds
                                                    newX = Math.max(roomX, Math.min(roomX + roomWidth, newX));
                                                    newY = Math.max(roomY, Math.min(roomY + roomHeight, newY));
                                                    
                                                    console.log(`[AppContext] 🦽 Calculated wheelchair ${wheelchair.id} position from bbox: (${newX.toFixed(1)}%, ${newY.toFixed(1)}%)`);
                                                } else {
                                                    // SAME ROOM without bbox: Use center of room
                                                    newX = centerX;
                                                    newY = centerY;
                                                    console.log(`[AppContext] 🦽 Using center position for wheelchair ${wheelchair.id}: (${newX.toFixed(1)}%, ${newY.toFixed(1)}%)`);
                                                }
                                                
                                                setWheelchairPositions(prev => {
                                                    const updated = {
                                                        ...prev,
                                                        [wheelchair.id]: { x: newX, y: newY }
                                                    };

                                                    api.saveWheelchairPositions(updated).catch(err => {
                                                        console.error('Failed to save wheelchair position:', err);
                                                    });

                                                    return updated;
                                                });
                                            }
                                        }
                                    } else {
                                        console.warn(`[AppContext] Room not found for detection: ${room}, wheelchair: ${wheelchair?.id}`);
                                    }
                                } else {
                                    console.warn(`[AppContext] No wheelchair available for detection in room: ${room}`);
                                }
                            }
                        }

                        // Handle device registration
                        // Only show notification once when device first registers (to prevent spam)
                        if (message.type === 'device_registered') {
                            console.log('[AppContext] Device registered:', message);
                            
                            // Check if this device was already registered (to prevent duplicate notifications)
                            const deviceId = message.device_id;
                            const existingDevice = devices.find(d => 
                                (d.id === deviceId || d.deviceId === deviceId)
                            );
                            
                            // Only notify if this is a new device registration
                            if (!existingDevice) {
                                const roomName = rooms.find(r => 
                                    r.id === message.room || 
                                    r.roomType === message.room ||
                                    r.nameEn?.toLowerCase() === message.room?.toLowerCase()
                                )?.nameEn || 
                                rooms.find(r => 
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
                    setTimeout(connectWebSocket, 5000);
                };

            } catch (error) {
                console.error('[AppContext] Failed to connect WebSocket:', error);
                // Retry after 5 seconds
                setTimeout(connectWebSocket, 5000);
            }
        };

        connectWebSocket();

        return () => {
            if (ws) {
                ws.close();
            }
        };
    }, [wheelchairs, rooms]); // Don't include wheelchairPositions to prevent infinite loop

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
