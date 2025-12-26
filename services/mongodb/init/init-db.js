// WheelSense MongoDB Initialization Script
// Initialize database with sample data for Somchai Jaidee

db = db.getSiblingDB('wheelsense');

// ==================== Buildings ====================
db.buildings.drop();
db.buildings.insertMany([
  {
    id: "building-1",
    name: "Building A",
    nameEn: "Building A",
    address: "123 Healthy Street, Bangkok",
    floors: 3,
    createdAt: new Date()
  }
]);

// ==================== Floors ====================
db.floors.drop();
db.floors.insertMany([
  { id: "floor-1", name: "Floor 1", buildingId: "building-1", level: 1 },
  { id: "floor-2", name: "Floor 2", buildingId: "building-1", level: 2 },
  { id: "floor-3", name: "Floor 3", buildingId: "building-1", level: 3 }
]);

// ==================== Rooms ====================
db.rooms.drop();
db.rooms.insertMany([
  {
    id: "bedroom",
    name: "Bedroom",
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
    name: "Bathroom",
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
    name: "Kitchen",
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
    name: "Living Room",
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
    name: "Corridor",
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

// ==================== Patients (Somchai Jaidee only) ====================
db.patients.drop();
db.patients.insertMany([
  {
    id: "P001",
    name: "Somchai Jaidee",
    nameEn: "Somchai Jaidee",
    avatar: "👴",
    age: 65,
    gender: "male",
    bloodType: "O+",
    wheelchairId: "WC001",
    room: "bedroom",
    healthScore: 87,
    todaySteps: 1247,
    condition: "Normal",
    status: "normal",
    emergencyContact: "02-123-4567",
    doctor: "Dr. Wichai Sukjai",
    notes: "Take blood pressure medication once daily",
    preferences: {
      language: "en",
      fontSize: "large",
      compactMode: false,
      notifications: true,
      voiceAssistant: true
    },
    medicalHistory: [
      { date: "2024-01-15", event: "Annual health check-up", notes: "Normal results" },
      { date: "2024-03-10", event: "Scheduled doctor's appointment", notes: "Adjust blood pressure medication" }
    ],
    createdAt: new Date()
  }
]);

// ==================== Wheelchairs ====================
db.wheelchairs.drop();
db.wheelchairs.insertMany([
  {
    id: "WC001",
    name: "รถเข็นของสมชาย",
    nameEn: "Somchai's Wheelchair",
    patientId: "P001",
    patientName: "Somchai Jaidee",
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
    name: "Main Gateway",
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
    name: "Bedroom Node",
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
    name: "Bathroom Node",
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
    name: "Kitchen Node",
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
    name: "Living Room Node",
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
    name: "Bedroom Camera",
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
    name: "Bathroom Camera",
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
    name: "Kitchen Camera",
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
    name: "Living Room Camera",
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
  { id: "APP_B_LIGHT", name: "Ceiling Light", type: "light", room: "bedroom", state: true, brightness: 80 },
  { id: "APP_B_AC", name: "AC", type: "AC", room: "bedroom", state: true, temperature: 25 },
  { id: "APP_B_ALARM", name: "Alarm", type: "alarm", room: "bedroom", state: false },

  // Bathroom appliances
  { id: "APP_BA_LIGHT", name: "Bathroom Light", type: "light", room: "bathroom", state: false, brightness: 100 },

  // Kitchen appliances
  { id: "APP_K_LIGHT", name: "Kitchen Light", type: "light", room: "kitchen", state: false, brightness: 100 },
  { id: "APP_K_ALARM", name: "Smoke Alarm", type: "alarm", room: "kitchen", state: true },

  // Living room appliances
  { id: "APP_L_LIGHT", name: "Living Room Light", type: "light", room: "livingroom", state: false, brightness: 70 },
  { id: "APP_L_FAN", name: "Ceiling Fan", type: "fan", room: "livingroom", state: false, speed: 50 },
  { id: "APP_L_TV", name: "TV", type: "tv", room: "livingroom", state: false, volume: 30 },
  { id: "APP_L_AC", name: "Living Room AC", type: "AC", room: "livingroom", state: false, temperature: 26 }
]);

// ==================== Routines (Daily Schedule) ====================
db.routines.drop();
db.routines.insertMany([
  {
    id: "R001",
    patientId: "P001",
    time: "07:00",
    title: "Wake Up",
    description: "Wake up and wash face",
    completed: true,
    createdAt: new Date()
  },
  {
    id: "R002",
    patientId: "P001",
    time: "07:30",
    title: "Have Breakfast",
    description: "Have breakfast in the kitchen",
    completed: true,
    createdAt: new Date()
  },
  {
    id: "R003",
    patientId: "P001",
    time: "08:00",
    title: "Take Medicine",
    description: "Blood pressure medication 1 tablet",
    completed: false,
    createdAt: new Date()
  },
  {
    id: "R004",
    patientId: "P001",
    time: "10:00",
    title: "Physical Therapy",
    description: "Light exercise in the living room for 30 minutes",
    completed: false,
    createdAt: new Date()
  },
  {
    id: "R005",
    patientId: "P001",
    time: "12:00",
    title: "Have Lunch",
    description: "Have lunch in the kitchen",
    completed: false,
    createdAt: new Date()
  },
  {
    id: "R006",
    patientId: "P001",
    time: "14:00",
    title: "Rest",
    description: "Nap in the bedroom",
    completed: false,
    createdAt: new Date()
  },
  {
    id: "R007",
    patientId: "P001",
    time: "18:00",
    title: "Have Dinner",
    description: "Have dinner in the kitchen",
    completed: false,
    createdAt: new Date()
  },
  {
    id: "R008",
    patientId: "P001",
    time: "20:00",
    title: "Bedtime Medication",
    description: "Take bedtime medication",
    completed: false,
    createdAt: new Date()
  },
  {
    id: "R009",
    patientId: "P001",
    time: "21:00",
    title: "Go to Bed",
    description: "Rest and sleep",
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
    message: "Entered bedroom",
    timestamp: new Date(Date.now() - 3600000 * 2),
    createdAt: new Date()
  },
  {
    id: "AL002",
    patientId: "P001",
    eventType: "appliance",
    room: "bedroom",
    message: "Bedroom light turned on",
    details: { appliance: "light", state: true },
    timestamp: new Date(Date.now() - 3600000 * 1.5),
    createdAt: new Date()
  },
  {
    id: "AL003",
    patientId: "P001",
    eventType: "routine",
    room: "bedroom",
    message: "Wake Up - Completed",
    details: { routineId: "R001" },
    timestamp: new Date(Date.now() - 3600000),
    createdAt: new Date()
  },
  {
    id: "AL004",
    patientId: "P001",
    eventType: "exit",
    room: "bedroom",
    message: "Exited bedroom",
    timestamp: new Date(Date.now() - 3600000 * 0.5),
    createdAt: new Date()
  },
  {
    id: "AL005",
    patientId: "P001",
    eventType: "enter",
    room: "kitchen",
    message: "Entered kitchen",
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
    title: "System Ready",
    message: "WheelSense initialized successfully",
    read: false,
    timestamp: new Date(),
    createdAt: new Date()
  },
  {
    id: "N002",
    type: "success",
    title: "Wake Up Completed",
    message: "Somchai Jaidee woke up at 07:00",
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
    doctorName: "Dr. Wichai Sukjai",
    date: "2024-12-01",
    notes: "Patient is healthy, should do light exercise daily",
    medications: [
      { name: "Blood Pressure Medication", dose: "1 tablet", frequency: "Once daily after breakfast" }
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
      { pattern: "Wake up on time", frequency: "Daily", status: "normal" },
      { pattern: "Take medication regularly", frequency: "Daily", status: "normal" },
      { pattern: "Moderate movement", frequency: "Daily", status: "normal" }
    ],
    anomalies: [],
    recommendations: [
      "Should increase exercise slightly",
      "Should drink more water"
    ],
    createdAt: new Date()
  }
]);

// ==================== Settings ====================
db.settings.drop();
db.settings.insertOne({
  systemName: "WheelSense Smart Home",
  version: "1.0.0",
  defaultLanguage: "en",
  timezone: "Asia/Bangkok",
  mqttBroker: "mosquitto",
  mqttPort: 1883,
  ollamaHost: "http://ollama:11434",
  ollamaModel: "deepseek-r1:latest",
  detectionConfidence: 0.5,
  alertCooldown: 300,
  createdAt: new Date()
});

print("✅ WheelSense database initialized successfully!");
print("📋 Collections created:");
print("   - buildings");
print("   - floors");
print("   - rooms");
print("   - patients (Somchai Jaidee)");
print("   - wheelchairs");
print("   - devices (nodes, cameras, gateway)");
print("   - appliances");
print("   - routines");
print("   - activityLogs");
print("   - notifications");
print("   - doctorNotes");
print("   - behaviorAnalysis");
print("   - settings");
