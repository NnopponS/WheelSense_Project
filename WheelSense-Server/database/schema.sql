-- WheelSense Database Schema
-- SQLite/PostgreSQL Compatible

-- Wheelchairs Table (Real-time data from MQTT)
CREATE TABLE IF NOT EXISTS wheelchairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL UNIQUE,
    timestamp TIMESTAMP NOT NULL,
    distance_m REAL NOT NULL DEFAULT 0,
    speed_ms REAL NOT NULL DEFAULT 0,
    status INTEGER NOT NULL DEFAULT 0,
    status_str TEXT NOT NULL DEFAULT 'OK',
    current_node INTEGER,
    rssi INTEGER,
    stale BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Nodes Table (BLE nodes detected by M5StickC)
CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY,
    node_id INTEGER NOT NULL UNIQUE,
    name TEXT,
    last_seen_by TEXT,
    rssi INTEGER,
    status TEXT DEFAULT 'offline',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Buildings Table (Map data)
CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Floors Table (Map data)
CREATE TABLE IF NOT EXISTS floors (
    id TEXT PRIMARY KEY,
    building_id TEXT NOT NULL,
    name TEXT NOT NULL,
    level INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
);

-- Rooms Table (Map data with node mapping)
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    floor_id TEXT NOT NULL,
    name TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    color TEXT NOT NULL DEFAULT '#e6f2ff',
    node_id INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES nodes(node_id) ON DELETE SET NULL
);

-- Corridors Table (Map data)
CREATE TABLE IF NOT EXISTS corridors (
    id TEXT PRIMARY KEY,
    floor_id TEXT NOT NULL,
    name TEXT NOT NULL,
    points TEXT NOT NULL, -- JSON array of {x, y} points
    width REAL NOT NULL DEFAULT 24,
    color TEXT DEFAULT '#e5e7eb',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE
);

-- Wheelchair History (Optional - for historical tracking)
CREATE TABLE IF NOT EXISTS wheelchair_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    distance_m REAL NOT NULL,
    speed_ms REAL NOT NULL,
    status INTEGER NOT NULL,
    current_node INTEGER,
    rssi INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES wheelchairs(device_id) ON DELETE CASCADE
);

-- Patients Table (Patient management)
CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('male', 'female', 'other')),
    condition TEXT NOT NULL,
    wheelchair_id TEXT,
    room TEXT,
    admission_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'discharged', 'transferred')),
    doctor_notes TEXT,
    medications TEXT, -- JSON array of medications
    emergency_contact TEXT,
    phone TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wheelchairs_device_id ON wheelchairs(device_id);
CREATE INDEX IF NOT EXISTS idx_wheelchairs_current_node ON wheelchairs(current_node);
CREATE INDEX IF NOT EXISTS idx_wheelchairs_updated_at ON wheelchairs(updated_at);
CREATE INDEX IF NOT EXISTS idx_nodes_node_id ON nodes(node_id);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_rooms_floor_id ON rooms(floor_id);
CREATE INDEX IF NOT EXISTS idx_rooms_node_id ON rooms(node_id);
CREATE INDEX IF NOT EXISTS idx_wheelchair_history_device_id ON wheelchair_history(device_id);
CREATE INDEX IF NOT EXISTS idx_wheelchair_history_timestamp ON wheelchair_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_patients_wheelchair_id ON patients(wheelchair_id);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_wheelchairs_timestamp 
AFTER UPDATE ON wheelchairs
BEGIN
    UPDATE wheelchairs SET updated_at = CURRENT_TIMESTAMP WHERE device_id = NEW.device_id;
END;

CREATE TRIGGER IF NOT EXISTS update_nodes_timestamp 
AFTER UPDATE ON nodes
BEGIN
    UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE node_id = NEW.node_id;
END;

CREATE TRIGGER IF NOT EXISTS update_buildings_timestamp 
AFTER UPDATE ON buildings
BEGIN
    UPDATE buildings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_floors_timestamp 
AFTER UPDATE ON floors
BEGIN
    UPDATE floors SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_rooms_timestamp 
AFTER UPDATE ON rooms
BEGIN
    UPDATE rooms SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_corridors_timestamp 
AFTER UPDATE ON corridors
BEGIN
    UPDATE corridors SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_patients_timestamp 
AFTER UPDATE ON patients
BEGIN
    UPDATE patients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Insert default data
INSERT OR IGNORE INTO buildings (id, name) VALUES ('B1', 'อาคารหลัก');

INSERT OR IGNORE INTO floors (id, building_id, name, level) 
VALUES ('F1', 'B1', 'ชั้น 1', 1);

INSERT OR IGNORE INTO rooms (id, floor_id, name, x, y, width, height, color, node_id) VALUES
('room-1', 'F1', 'ห้อง 101', 100, 100, 200, 200, '#e6f2ff', 1),
('room-2', 'F1', 'ห้อง 102', 320, 100, 200, 200, '#f0fdf4', 2),
('room-3', 'F1', 'ห้อง 103', 540, 100, 200, 200, '#fff7ed', 3),
('room-4', 'F1', 'ห้อง 104', 100, 320, 200, 200, '#fef3c7', 4);

INSERT OR IGNORE INTO corridors (id, floor_id, name, points, width, color) VALUES
('cor-1', 'F1', 'ทางเดินหลัก', '[{"x":300,"y":220},{"x":540,"y":220},{"x":540,"y":320},{"x":320,"y":320}]', 24, '#e5e7eb');

INSERT OR IGNORE INTO nodes (node_id, name, status) VALUES
(1, 'Node 1', 'offline'),
(2, 'Node 2', 'offline'),
(3, 'Node 3', 'offline'),
(4, 'Node 4', 'offline');

-- Default patients
INSERT OR IGNORE INTO patients (id, name, age, gender, condition, wheelchair_id, room, admission_date, status, doctor_notes, medications, emergency_contact, phone) VALUES
('P001', 'สมชาย ใจดี', 45, 'male', 'อุบัติเหตุ - บาดเจ็บที่ขา', 'M5_001', 'ห้อง 101', '2025-10-15', 'active', 'ฟื้นฟูสภาพดี ควรออกกำลังกายวันละ 30 นาที', '["ยาแก้ปวด 2 เม็ด/วัน","วิตามินบี 1 เม็ด/เช้า"]', 'สมหญิง ใจดี (ภรรยา)', '081-234-5678'),
('P002', 'สมหญิง รักษ์ดี', 62, 'female', 'โรคข้อเสื่อม', 'M5_002', 'ห้อง 102', '2025-10-20', 'active', 'ติดตามอาการ กายภาพบำบัดสัปดาห์ละ 3 ครั้ง', '["แคลเซียม 1 เม็ด/วัน","ยาบำรุงข้อ 2 เม็ด/วัน"]', 'นายสมศักดิ์ รักษ์ดี (ลูกชาย)', '089-765-4321');


