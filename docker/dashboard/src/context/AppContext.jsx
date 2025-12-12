import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';

const AppContext = createContext(null);

// Check if running with backend
const USE_API = import.meta.env.VITE_USE_API === 'true' || false;

export function AppProvider({ children }) {
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

    // Current user (for user mode) - สมชาย ใจดี
    const [currentUser, setCurrentUser] = useState({
        id: 'P001',
        name: 'สมชาย ใจดี',
        avatar: '👴',
        age: 65,
        wheelchairId: 'WC001',
        room: 'bedroom',
        condition: 'ปกติ',
        healthScore: 87,
        todaySteps: 1247,
        lastActivity: new Date(),
    });

    // Notifications
    const [notifications, setNotifications] = useState([
        { id: 1, type: 'info', title: 'ระบบพร้อมใช้งาน', message: 'ยินดีต้อนรับสู่ WheelSense', time: new Date(), read: false },
    ]);

    // Wheelchairs - เฉพาะสมชาย
    const [wheelchairs, setWheelchairs] = useState([
        { id: 'WC001', name: 'รถเข็น A1', patientId: 'P001', patientName: 'สมชาย ใจดี', room: 'bedroom', status: 'active', battery: 85, lastSeen: new Date(), speed: 0 },
    ]);

    // Wheelchair positions on map - stored as percentage (x, y) relative to map canvas
    const [wheelchairPositions, setWheelchairPositions] = useState({});

    // Patients - เฉพาะสมชาย
    const [patients, setPatients] = useState([
        { id: 'P001', name: 'สมชาย ใจดี', age: 65, condition: 'ปกติ', wheelchairId: 'WC001', room: 'bedroom', avatar: '👴', phone: '081-234-5678', emergencyContact: '02-123-4567', notes: 'ยาความดันวันละ 1 ครั้ง', healthScore: 87, status: 'normal' },
    ]);

    // Devices - Loaded from Database (no hardcoded data)
    const [devices, setDevices] = useState([]);

    // Rooms - Loaded from Database (no hardcoded data)
    // Data structure: { id, name, nameEn, sizeLabel, x, y, width, height, occupied, temperature, humidity }
    const [rooms, setRooms] = useState([]);

    // Appliances - Default appliances per room based on WheelSense requirements
    // Structure: { [roomType]: [{ id, name, type, state, ... }] }
    // ห้องนอน: Light, Alarm, AC
    // ห้องน้ำ: Light
    // ห้องนั่งเล่น: Light, TV, AV, FAN
    // ห้องครัว: Light, Alarm
    const [appliances, setAppliances] = useState({
        bedroom: [
            { id: 'bedroom-light', name: 'ไฟ', type: 'light', state: false, brightness: 100 },
            { id: 'bedroom-alarm', name: 'สัญญาณเตือน', type: 'alarm', state: false },
            { id: 'bedroom-aircon', name: 'แอร์', type: 'aircon', state: false, temperature: 25 }
        ],
        bathroom: [
            { id: 'bathroom-light', name: 'ไฟ', type: 'light', state: false, brightness: 100 }
        ],
        livingroom: [
            { id: 'livingroom-light', name: 'ไฟ', type: 'light', state: false, brightness: 100 },
            { id: 'livingroom-tv', name: 'ทีวี', type: 'tv', state: false, volume: 50 },
            { id: 'livingroom-av', name: 'AV', type: 'av', state: false },
            { id: 'livingroom-fan', name: 'พัดลม', type: 'fan', state: false, speed: 50 }
        ],
        kitchen: [
            { id: 'kitchen-light', name: 'ไฟ', type: 'light', state: false, brightness: 100 },
            { id: 'kitchen-alarm', name: 'สัญญาณเตือน', type: 'alarm', state: false }
        ]
    });

    // Timeline/Activities
    const [timeline, setTimeline] = useState([
        { id: 1, type: 'enter', room: 'bedroom', patientId: 'P001', patient: 'สมชาย', time: new Date(Date.now() - 120 * 60000), message: 'เข้าห้องนอน' },
        { id: 2, type: 'appliance', room: 'bedroom', patientId: null, patient: null, time: new Date(Date.now() - 90 * 60000), message: 'เปิดไฟห้องนอน' },
        { id: 3, type: 'routine', room: 'bedroom', patientId: 'P001', patient: 'สมชาย', time: new Date(Date.now() - 60 * 60000), message: 'ตื่นนอน - เสร็จสิ้น' },
        { id: 4, type: 'exit', room: 'bedroom', patientId: 'P001', patient: 'สมชาย', time: new Date(Date.now() - 30 * 60000), message: 'ออกจากห้องนอน' },
        { id: 5, type: 'enter', room: 'kitchen', patientId: 'P001', patient: 'สมชาย', time: new Date(Date.now() - 25 * 60000), message: 'เข้าห้องครัว' },
    ]);

    // Routines - ตารางของสมชาย
    const [routines, setRoutines] = useState([
        { id: 'R001', time: '07:00', title: 'ตื่นนอน', description: 'ตื่นนอนและล้างหน้า', patientId: 'P001', completed: true },
        { id: 'R002', time: '07:30', title: 'ทานอาหารเช้า', description: 'ทานอาหารเช้าที่ห้องครัว', patientId: 'P001', completed: true },
        { id: 'R003', time: '08:00', title: 'ทานยา', description: 'ยาความดันโลหิต 1 เม็ด', patientId: 'P001', completed: false },
        { id: 'R004', time: '10:00', title: 'กายภาพบำบัด', description: 'ออกกำลังกายเบาๆ ที่ห้องนั่งเล่น 30 นาที', patientId: 'P001', completed: false },
        { id: 'R005', time: '12:00', title: 'ทานอาหารกลางวัน', description: 'ทานอาหารกลางวันที่ห้องครัว', patientId: 'P001', completed: false },
        { id: 'R006', time: '14:00', title: 'พักผ่อน', description: 'งีบหลับที่ห้องนอน', patientId: 'P001', completed: false },
        { id: 'R007', time: '18:00', title: 'ทานอาหารเย็น', description: 'ทานอาหารเย็นที่ห้องครัว', patientId: 'P001', completed: false },
        { id: 'R008', time: '20:00', title: 'ยาก่อนนอน', description: 'ทานยาก่อนนอน', patientId: 'P001', completed: false },
        { id: 'R009', time: '21:00', title: 'เข้านอน', description: 'พักผ่อนนอนหลับ', patientId: 'P001', completed: false },
    ]);

    // Emergency alerts
    const [emergencies, setEmergencies] = useState([]);

    // AI Analysis History
    const [aiAnalysis, setAiAnalysis] = useState({
        lastAnalysis: new Date(),
        dailySummary: 'กิจกรรมปกติ มีการเคลื่อนไหวตลอดทั้งวัน',
        weeklyTrend: 'up',
        recommendations: [
            'ควรเพิ่มการออกกำลังกายอีกเล็กน้อย',
            'ควรทานน้ำให้มากขึ้น',
        ],
        anomalies: [],
    });

    // Fetch data from API - Auto-loads rooms and map data on startup
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Always try to fetch rooms and map data on startup
            const [roomsData, patientsData, devicesData, mapConfig] = await Promise.all([
                api.getRooms().catch(() => []),
                api.getPatients().catch(() => []),
                api.getDevices().catch(() => []),
                api.getMapConfig().catch(() => null),
            ]);

            // Update rooms if API returns data
            if (roomsData && roomsData.length > 0) {
                console.log('[AppContext] Auto-loaded rooms from API:', roomsData.length);
                setRooms(roomsData);
            }

            // Update patients if API returns data
            if (patientsData && patientsData.length > 0) {
                setPatients(patientsData);
                // Update current user if found
                const user = patientsData.find(p => p.id === 'P001');
                if (user) setCurrentUser(user);
            }

            // Update devices if API returns data
            if (devicesData && devicesData.length > 0) setDevices(devicesData);

            // Update wheelchair positions from map config
            if (mapConfig && mapConfig.wheelchairPositions) {
                setWheelchairPositions(mapConfig.wheelchairPositions);
            }

        } catch (err) {
            console.error('Failed to fetch data:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial data fetch - Auto-load map and rooms on startup
    useEffect(() => {
        console.log('[AppContext] Initializing - auto-loading rooms and map data');
        fetchData();
    }, [fetchData]);

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
                            const { room, detected, bbox, frame_size } = message;

                            console.log(`[AppContext] 🔍 Received detection: room="${room}", detected=${detected}, bbox=${bbox ? 'yes' : 'no'}, frame_size=${frame_size ? 'yes' : 'no'}`);
                            console.log(`[AppContext] Available rooms:`, rooms.map(r => ({ id: r.id, name: r.name, nameEn: r.nameEn, roomType: r.roomType })));
                            console.log(`[AppContext] Available wheelchairs:`, wheelchairs.map(w => ({ id: w.id, room: w.room })));

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

                                    // Match by partial name (e.g., "livingroom" matches "living room" or "ห้องนั่งเล่น")
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
                                            'livingroom': ['living room', 'ห้องนั่งเล่น', 'livingroom'],
                                            'bedroom': ['bed room', 'ห้องนอน', 'bedroom'],
                                            'kitchen': ['ห้องครัว', 'kitchen'],
                                            'bathroom': ['ห้องน้ำ', 'bathroom']
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
                                            // CHANGING ROOM: Always place wheelchair at center of new room
                                            console.log(`[AppContext] 📍 Moving wheelchair ${wheelchair.id} from ${wheelchair.room} to ${roomData.id} (placing at center)`);

                                            setWheelchairPositions(prev => {
                                                const updated = {
                                                    ...prev,
                                                    [wheelchair.id]: { x: centerX, y: centerY }
                                                };

                                                api.saveWheelchairPositions(updated).catch(err => {
                                                    console.error('Failed to save wheelchair position:', err);
                                                });

                                                console.log(`[AppContext] 🦽 Wheelchair ${wheelchair.id} placed at center of ${roomData.name || room}: (${centerX.toFixed(1)}%, ${centerY.toFixed(1)}%)`);

                                                return updated;
                                            });

                                            // Update wheelchair.room
                                            setWheelchairs(prev => prev.map(w =>
                                                w.id === wheelchair.id
                                                    ? { ...w, room: roomData.id }
                                                    : w
                                            ));

                                            // Also update currentUser.room if this is their wheelchair
                                            if (wheelchair.id === currentUser.wheelchairId) {
                                                setCurrentUser(prev => ({ ...prev, room: roomData.id }));
                                            }
                                        } else if (frame_size && bbox) {
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
                                            const newX = roomX + (videoXPercent / 100) * roomWidth;
                                            const newY = roomY + (videoYPercent / 100) * roomHeight;

                                            // Clamp to room bounds
                                            const clampedX = Math.max(roomX, Math.min(roomX + roomWidth, newX));
                                            const clampedY = Math.max(roomY, Math.min(roomY + roomHeight, newY));

                                            setWheelchairPositions(prev => {
                                                const updated = {
                                                    ...prev,
                                                    [wheelchair.id]: { x: clampedX, y: clampedY }
                                                };

                                                api.saveWheelchairPositions(updated).catch(err => {
                                                    console.error('Failed to save wheelchair position:', err);
                                                });

                                                console.log(`[AppContext] 🦽 Updated wheelchair ${wheelchair.id} position in ${roomData.name || room} from bbox: (${clampedX.toFixed(1)}%, ${clampedY.toFixed(1)}%)`);

                                                return updated;
                                            });
                                        } else {
                                            // SAME ROOM without bbox: Use center of room
                                            setWheelchairPositions(prev => {
                                                const updated = {
                                                    ...prev,
                                                    [wheelchair.id]: { x: centerX, y: centerY }
                                                };

                                                api.saveWheelchairPositions(updated).catch(err => {
                                                    console.error('Failed to save wheelchair position:', err);
                                                });

                                                console.log(`[AppContext] 🦽 Updated wheelchair ${wheelchair.id} position in ${roomData.name || room} (center): (${centerX.toFixed(1)}%, ${centerY.toFixed(1)}%)`);

                                                return updated;
                                            });
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
                        if (message.type === 'device_registered') {
                            console.log('[AppContext] Device registered:', message);
                            addNotification({
                                type: 'info',
                                title: 'อุปกรณ์เชื่อมต่อ',
                                message: `อุปกรณ์ ${message.device_id} เชื่อมต่อใน ${message.room}`
                            });
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
    }, [wheelchairs, rooms]); // ไม่ใส่ wheelchairPositions เพื่อป้องกัน infinite loop

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
        setModalContent(content);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setTimeout(() => setModalContent(null), 300);
    };

    const addNotification = (notification) => {
        setNotifications(prev => [{ id: Date.now(), time: new Date(), read: false, ...notification }, ...prev]);
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
                'bedroom': ['ห้องนอน', 'bed room', 'bedroom'],
                'bathroom': ['ห้องน้ำ', 'bathroom'],
                'livingroom': ['ห้องนั่งเล่น', 'living room', 'livingroom'],
                'kitchen': ['ห้องครัว', 'kitchen']
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
                'bedroom': ['ห้องนอน', 'bed room', 'bedroom'],
                'bathroom': ['ห้องน้ำ', 'bathroom'],
                'livingroom': ['ห้องนั่งเล่น', 'living room', 'livingroom'],
                'kitchen': ['ห้องครัว', 'kitchen']
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
        // - temperature -> appliance: "aircon", value name: "temperature"
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
            message: `เพิ่มกิจกรรม: ${routine.title}`
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
                    message: `${routine.title} - ${updates.completed ? 'เสร็จสิ้น' : 'ยังไม่เสร็จ'}`
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
                message: `ลบกิจกรรม: ${routine.title}`
            }, ...prev]);
        }
    };

    const resolveEmergency = (id) => {
        setEmergencies(prev => prev.map(e => e.id === id ? { ...e, resolved: true } : e));
    };

    const value = {
        theme, setTheme, toggleTheme,
        role, setRole,
        currentUser, setCurrentUser,
        selectedBuilding, setSelectedBuilding,
        selectedFloor, setSelectedFloor,
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
