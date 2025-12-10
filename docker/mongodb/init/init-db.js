// WheelSense MongoDB Initialization Script
// Initialize database with sample data for สมชายใจดี

db = db.getSiblingDB('wheelsense');

// ==================== Buildings ====================
db.buildings.drop();
db.buildings.insertMany([
  {
    id: "building-1",
    name: "อาคาร A",
    nameEn: "Building A",
    address: "123 ถนนสุขภาพดี กรุงเทพฯ",
    floors: 3,
    createdAt: new Date()
  }
]);

// ==================== Floors ====================
db.floors.drop();
db.floors.insertMany([
  { id: "floor-1", name: "ชั้น 1", buildingId: "building-1", level: 1 },
  { id: "floor-2", name: "ชั้น 2", buildingId: "building-1", level: 2 },
  { id: "floor-3", name: "ชั้น 3", buildingId: "building-1", level: 3 }
]);

// ==================== Rooms ====================
db.rooms.drop();
db.rooms.insertMany([
  {
    id: "bedroom",
    name: "ห้องนอน",
    nameEn: "Bedroom",
    floorId: "floor-1",
    buildingId: "building-1",
    x: 5, y: 5, width: 28, height: 45,
    temperature: 26,
    humidity: 55,
    occupied: true,
    cameraId: "CAM_001",
    createdAt: new Date()
  },
  {
    id: "bathroom",
    name: "ห้องน้ำ",
    nameEn: "Bathroom",
    floorId: "floor-1",
    buildingId: "building-1",
    x: 35, y: 5, width: 18, height: 22,
    temperature: 28,
    humidity: 75,
    occupied: false,
    cameraId: "CAM_002",
    createdAt: new Date()
  },
  {
    id: "kitchen",
    name: "ห้องครัว",
    nameEn: "Kitchen",
    floorId: "floor-1",
    buildingId: "building-1",
    x: 55, y: 5, width: 40, height: 35,
    temperature: 29,
    humidity: 50,
    occupied: false,
    cameraId: "CAM_003",
    createdAt: new Date()
  },
  {
    id: "livingroom",
    name: "ห้องนั่งเล่น",
    nameEn: "Living Room",
    floorId: "floor-1",
    buildingId: "building-1",
    x: 5, y: 55, width: 55, height: 40,
    temperature: 27,
    humidity: 52,
    occupied: false,
    cameraId: "CAM_004",
    createdAt: new Date()
  },
  {
    id: "corridor",
    name: "ทางเดิน",
    nameEn: "Corridor",
    floorId: "floor-1",
    buildingId: "building-1",
    x: 35, y: 30, width: 20, height: 25,
    temperature: 28,
    humidity: 50,
    occupied: false,
    cameraId: null,
    createdAt: new Date()
  }
]);

// ==================== Patients (เฉพาะ สมชายใจดี) ====================
db.patients.drop();
db.patients.insertMany([
  {
    id: "P001",
    name: "สมชาย ใจดี",
    nameEn: "Somchai Jaidee",
    avatar: "👴",
    age: 65,
    gender: "male",
    bloodType: "O+",
    wheelchairId: "WC001",
    room: "bedroom",
    healthScore: 87,
    todaySteps: 1247,
    condition: "ปกติ",
    status: "normal",
    emergencyContact: "02-123-4567",
    doctor: "นพ.วิชัย สุขใจ",
    notes: "ต้องกินยาความดันวันละ 1 ครั้ง",
    preferences: {
      language: "th",
      fontSize: "large",
      compactMode: false,
      notifications: true,
      voiceAssistant: true
    },
    medicalHistory: [
      { date: "2024-01-15", event: "ตรวจสุขภาพประจำปี", notes: "ผลตรวจปกติ" },
      { date: "2024-03-10", event: "พบแพทย์ตามนัด", notes: "ปรับยาความดัน" }
    ],
    createdAt: new Date()
  }
]);

// ==================== Wheelchairs ====================
db.wheelchairs.drop();
db.wheelchairs.insertMany([
  {
    id: "WC001",
    name: "รถเข็น A1",
    patientId: "P001",
    patientName: "สมชาย ใจดี",
    battery: 85,
    status: "active",
    room: "bedroom",
    lastSeen: new Date(),
    createdAt: new Date()
  }
]);

// ==================== Devices (Nodes & Gateways) ====================
db.devices.drop();
db.devices.insertMany([
  // Gateway
  {
    id: "GW001",
    name: "Gateway หลัก",
    type: "gateway",
    room: null,
    status: "online",
    ip: "192.168.1.1",
    connectedNodes: ["NODE001", "NODE002", "NODE003", "NODE004"],
    lastSeen: new Date(),
    createdAt: new Date()
  },
  // Nodes
  {
    id: "NODE001",
    name: "Node ห้องนอน",
    type: "node",
    room: "bedroom",
    status: "online",
    rssi: -45,
    battery: 100,
    gatewayId: "GW001",
    lastSeen: new Date(),
    createdAt: new Date()
  },
  {
    id: "NODE002",
    name: "Node ห้องน้ำ",
    type: "node",
    room: "bathroom",
    status: "online",
    rssi: -52,
    battery: 95,
    gatewayId: "GW001",
    lastSeen: new Date(),
    createdAt: new Date()
  },
  {
    id: "NODE003",
    name: "Node ห้องครัว",
    type: "node",
    room: "kitchen",
    status: "online",
    rssi: -48,
    battery: 90,
    gatewayId: "GW001",
    lastSeen: new Date(),
    createdAt: new Date()
  },
  {
    id: "NODE004",
    name: "Node ห้องนั่งเล่น",
    type: "node",
    room: "livingroom",
    status: "online",
    rssi: -55,
    battery: 88,
    gatewayId: "GW001",
    lastSeen: new Date(),
    createdAt: new Date()
  },
  // Cameras
  {
    id: "CAM_001",
    name: "กล้องห้องนอน",
    type: "camera",
    room: "bedroom",
    status: "online",
    streamUrl: "/stream/bedroom",
    detectionEnabled: true,
    lastSeen: new Date(),
    createdAt: new Date()
  },
  {
    id: "CAM_002",
    name: "กล้องห้องน้ำ",
    type: "camera",
    room: "bathroom",
    status: "online",
    streamUrl: "/stream/bathroom",
    detectionEnabled: true,
    lastSeen: new Date(),
    createdAt: new Date()
  },
  {
    id: "CAM_003",
    name: "กล้องห้องครัว",
    type: "camera",
    room: "kitchen",
    status: "online",
    streamUrl: "/stream/kitchen",
    detectionEnabled: true,
    lastSeen: new Date(),
    createdAt: new Date()
  },
  {
    id: "CAM_004",
    name: "กล้องห้องนั่งเล่น",
    type: "camera",
    room: "livingroom",
    status: "online",
    streamUrl: "/stream/livingroom",
    detectionEnabled: true,
    lastSeen: new Date(),
    createdAt: new Date()
  }
]);

// ==================== Appliances ====================
db.appliances.drop();
db.appliances.insertMany([
  // Bedroom appliances
  { id: "APP_B_LIGHT", name: "ไฟเพดาน", type: "light", room: "bedroom", state: true, brightness: 80 },
  { id: "APP_B_AIRCON", name: "แอร์", type: "aircon", room: "bedroom", state: true, temperature: 25 },
  { id: "APP_B_ALARM", name: "สัญญาณเตือน", type: "alarm", room: "bedroom", state: false },

  // Bathroom appliances
  { id: "APP_BA_LIGHT", name: "ไฟห้องน้ำ", type: "light", room: "bathroom", state: false, brightness: 100 },

  // Kitchen appliances
  { id: "APP_K_LIGHT", name: "ไฟครัว", type: "light", room: "kitchen", state: false, brightness: 100 },
  { id: "APP_K_ALARM", name: "สัญญาณเตือนควัน", type: "alarm", room: "kitchen", state: true },

  // Living room appliances
  { id: "APP_L_LIGHT", name: "ไฟห้องนั่งเล่น", type: "light", room: "livingroom", state: false, brightness: 70 },
  { id: "APP_L_FAN", name: "พัดลมเพดาน", type: "fan", room: "livingroom", state: false, speed: 50 },
  { id: "APP_L_TV", name: "ทีวี", type: "tv", room: "livingroom", state: false, volume: 30 },
  { id: "APP_L_AIRCON", name: "แอร์ห้องนั่งเล่น", type: "aircon", room: "livingroom", state: false, temperature: 26 }
]);

// ==================== Routines (ตารางประจำวัน) ====================
db.routines.drop();
db.routines.insertMany([
  {
    id: "R001",
    patientId: "P001",
    time: "07:00",
    title: "ตื่นนอน",
    description: "ตื่นนอนและล้างหน้า",
    completed: true,
    createdAt: new Date()
  },
  {
    id: "R002",
    patientId: "P001",
    time: "07:30",
    title: "ทานอาหารเช้า",
    description: "ทานอาหารเช้าที่ห้องครัว",
    completed: true,
    createdAt: new Date()
  },
  {
    id: "R003",
    patientId: "P001",
    time: "08:00",
    title: "ทานยา",
    description: "ยาความดันโลหิต 1 เม็ด",
    completed: false,
    createdAt: new Date()
  },
  {
    id: "R004",
    patientId: "P001",
    time: "10:00",
    title: "กายภาพบำบัด",
    description: "ออกกำลังกายเบาๆ ที่ห้องนั่งเล่น 30 นาที",
    completed: false,
    createdAt: new Date()
  },
  {
    id: "R005",
    patientId: "P001",
    time: "12:00",
    title: "ทานอาหารกลางวัน",
    description: "ทานอาหารกลางวันที่ห้องครัว",
    completed: false,
    createdAt: new Date()
  },
  {
    id: "R006",
    patientId: "P001",
    time: "14:00",
    title: "พักผ่อน",
    description: "งีบหลับที่ห้องนอน",
    completed: false,
    createdAt: new Date()
  },
  {
    id: "R007",
    patientId: "P001",
    time: "18:00",
    title: "ทานอาหารเย็น",
    description: "ทานอาหารเย็นที่ห้องครัว",
    completed: false,
    createdAt: new Date()
  },
  {
    id: "R008",
    patientId: "P001",
    time: "20:00",
    title: "ยาก่อนนอน",
    description: "ทานยาก่อนนอน",
    completed: false,
    createdAt: new Date()
  },
  {
    id: "R009",
    patientId: "P001",
    time: "21:00",
    title: "เข้านอน",
    description: "พักผ่อนนอนหลับ",
    completed: false,
    createdAt: new Date()
  }
]);

// ==================== Activity Logs (Timeline) ====================
db.activityLogs.drop();
db.activityLogs.insertMany([
  {
    id: "AL001",
    patientId: "P001",
    eventType: "enter",
    room: "bedroom",
    message: "เข้าห้องนอน",
    timestamp: new Date(Date.now() - 3600000 * 2),
    createdAt: new Date()
  },
  {
    id: "AL002",
    patientId: "P001",
    eventType: "appliance",
    room: "bedroom",
    message: "เปิดไฟห้องนอน",
    details: { appliance: "light", state: true },
    timestamp: new Date(Date.now() - 3600000 * 1.5),
    createdAt: new Date()
  },
  {
    id: "AL003",
    patientId: "P001",
    eventType: "routine",
    room: "bedroom",
    message: "ตื่นนอน - เสร็จสิ้น",
    details: { routineId: "R001" },
    timestamp: new Date(Date.now() - 3600000),
    createdAt: new Date()
  },
  {
    id: "AL004",
    patientId: "P001",
    eventType: "exit",
    room: "bedroom",
    message: "ออกจากห้องนอน",
    timestamp: new Date(Date.now() - 3600000 * 0.5),
    createdAt: new Date()
  },
  {
    id: "AL005",
    patientId: "P001",
    eventType: "enter",
    room: "kitchen",
    message: "เข้าห้องครัว",
    timestamp: new Date(Date.now() - 3600000 * 0.4),
    createdAt: new Date()
  }
]);

// ==================== Notifications ====================
db.notifications.drop();
db.notifications.insertMany([
  {
    id: "N001",
    type: "info",
    title: "ระบบพร้อมใช้งาน",
    message: "WheelSense เริ่มต้นทำงานเรียบร้อย",
    read: false,
    timestamp: new Date(),
    createdAt: new Date()
  },
  {
    id: "N002",
    type: "success",
    title: "ตื่นนอนเรียบร้อย",
    message: "สมชาย ใจดี ตื่นนอนแล้วเวลา 07:00",
    read: true,
    timestamp: new Date(Date.now() - 3600000),
    createdAt: new Date()
  }
]);

// ==================== Emergency Events ====================
db.emergencies.drop();
// No active emergencies initially

// ==================== Doctor Notes ====================
db.doctorNotes.drop();
db.doctorNotes.insertMany([
  {
    id: "DN001",
    patientId: "P001",
    doctorName: "นพ.วิชัย สุขใจ",
    date: "2024-12-01",
    notes: "ผู้ป่วยมีสุขภาพดี ควรออกกำลังกายเบาๆ ทุกวัน",
    medications: [
      { name: "ยาความดัน", dose: "1 เม็ด", frequency: "วันละ 1 ครั้ง หลังอาหารเช้า" }
    ],
    nextAppointment: "2025-01-15",
    createdAt: new Date()
  }
]);

// ==================== Behavior Analysis ====================
db.behaviorAnalysis.drop();
db.behaviorAnalysis.insertMany([
  {
    id: "BA001",
    patientId: "P001",
    date: new Date().toISOString().split('T')[0],
    patterns: [
      { pattern: "ตื่นนอนตรงเวลา", frequency: "ทุกวัน", status: "normal" },
      { pattern: "ทานยาสม่ำเสมอ", frequency: "ทุกวัน", status: "normal" },
      { pattern: "เคลื่อนไหวปานกลาง", frequency: "ทุกวัน", status: "normal" }
    ],
    anomalies: [],
    recommendations: [
      "ควรเพิ่มการออกกำลังกายอีกเล็กน้อย",
      "ควรทานน้ำให้มากขึ้น"
    ],
    createdAt: new Date()
  }
]);

// ==================== Settings ====================
db.settings.drop();
db.settings.insertOne({
  systemName: "WheelSense Smart Home",
  version: "1.0.0",
  defaultLanguage: "th",
  timezone: "Asia/Bangkok",
  mqttBroker: "mosquitto",
  mqttPort: 1883,
  ollamaHost: "http://ollama:11434",
  ollamaModel: "llama3.2",
  detectionConfidence: 0.5,
  alertCooldown: 300,
  createdAt: new Date()
});

print("✅ WheelSense database initialized successfully!");
print("📋 Collections created:");
print("   - buildings");
print("   - floors");
print("   - rooms");
print("   - patients (สมชาย ใจดี)");
print("   - wheelchairs");
print("   - devices (nodes, cameras, gateway)");
print("   - appliances");
print("   - routines");
print("   - activityLogs");
print("   - notifications");
print("   - doctorNotes");
print("   - behaviorAnalysis");
print("   - settings");
