"""
WheelSense v2.0 Database Module
PostgreSQL database with async support using asyncpg
"""

import asyncpg
import os
import json
from typing import Optional, List, Dict, Any

from .config import settings


class Database:
    """Async PostgreSQL database wrapper using asyncpg connection pool"""
    
    def __init__(self, dsn: str = None):
        self.dsn = dsn or settings.DATABASE_URL
        self._pool: Optional[asyncpg.Pool] = None
    
    async def connect(self):
        """Connect to PostgreSQL database using a connection pool"""
        try:
            self._pool = await asyncpg.create_pool(
                dsn=self.dsn,
                min_size=2,
                max_size=10,
                command_timeout=60,
            )
            print(f"✅ Connected to PostgreSQL database")
        except Exception as e:
            print(f"❌ Failed to connect to PostgreSQL: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from database"""
        if self._pool:
            await self._pool.close()
            self._pool = None
            print("⏹️ Disconnected from database")
    
    async def execute(self, query: str, params: tuple = ()) -> Optional[int]:
        """Execute query. Returns None (asyncpg doesn't return lastrowid for non-RETURNING queries)."""
        async with self._pool.acquire() as conn:
            await conn.execute(query, *params)
            return None
    
    async def execute_returning_id(self, query: str, params: tuple = ()) -> Any:
        """Execute INSERT ... RETURNING id and return the id value."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, *params)
            return row[0] if row else None
    
    async def execute_many(self, query: str, params_list: List[tuple]):
        """Execute query with multiple parameter sets"""
        async with self._pool.acquire() as conn:
            await conn.executemany(query, params_list)
    
    async def fetch_one(self, query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        """Fetch single row as dict"""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, *params)
            return dict(row) if row else None
    
    async def fetch_all(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """Fetch all rows as list of dicts"""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]
    
    async def init_schema(self):
        """Initialize database schema"""
        async with self._pool.acquire() as conn:
            await conn.execute("""
                -- Buildings
                CREATE TABLE IF NOT EXISTS buildings (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    name_en TEXT,
                    description TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- Floors
                CREATE TABLE IF NOT EXISTS floors (
                    id TEXT PRIMARY KEY,
                    building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    level INTEGER NOT NULL DEFAULT 1,
                    description TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- Rooms
                CREATE TABLE IF NOT EXISTS rooms (
                    id TEXT PRIMARY KEY,
                    floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    name_en TEXT,
                    room_type TEXT,
                    x REAL NOT NULL DEFAULT 0,
                    y REAL NOT NULL DEFAULT 0,
                    width REAL NOT NULL DEFAULT 100,
                    height REAL NOT NULL DEFAULT 100,
                    color TEXT DEFAULT '#e6f2ff',
                    node_id TEXT,
                    description TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- Nodes (BLE beacons detected by M5StickCPlus2)
                CREATE TABLE IF NOT EXISTS nodes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
                    x REAL,
                    y REAL,
                    status TEXT DEFAULT 'offline',
                    last_seen_by TEXT,
                    rssi INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );

                -- Camera nodes (TsimCam status/config state)
                CREATE TABLE IF NOT EXISTS camera_nodes (
                    device_id TEXT PRIMARY KEY,
                    node_id TEXT,
                    room_id TEXT,
                    room_name TEXT,
                    room_binding_last_updated TIMESTAMPTZ,
                    ip_address TEXT,
                    status TEXT DEFAULT 'offline',
                    config_mode BOOLEAN DEFAULT FALSE,
                    ws_connected BOOLEAN DEFAULT FALSE,
                    frames_sent BIGINT DEFAULT 0,
                    frames_dropped BIGINT DEFAULT 0,
                    last_seen TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );

                -- Device config sync/network compatibility snapshots
                CREATE TABLE IF NOT EXISTS device_sync_status (
                    device_id TEXT PRIMARY KEY,
                    device_type TEXT,
                    device_ip TEXT,
                    wifi_ssid TEXT,
                    request_host TEXT,
                    server_ip TEXT,
                    same_wifi BOOLEAN DEFAULT FALSE,
                    features_limited BOOLEAN DEFAULT FALSE,
                    warning_message TEXT,
                    last_seen TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- Patients
                CREATE TABLE IF NOT EXISTS patients (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    name_en TEXT,
                    age INTEGER,
                    gender TEXT,
                    condition TEXT,
                    notes TEXT,
                    avatar TEXT,
                    wheelchair_id TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- Wheelchairs
                CREATE TABLE IF NOT EXISTS wheelchairs (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    mac_address TEXT UNIQUE,
                    patient_id TEXT,
                    battery_level INTEGER DEFAULT 100,
                    status TEXT DEFAULT 'offline',
                    current_room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
                    current_node_id TEXT,
                    distance_m REAL DEFAULT 0,
                    speed_ms REAL DEFAULT 0,
                    status_message TEXT DEFAULT 'OK',
                    rssi INTEGER,
                    stale INTEGER DEFAULT 0,
                    last_seen TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- Wheelchair History (for tracking)
                CREATE TABLE IF NOT EXISTS wheelchair_history (
                    id SERIAL PRIMARY KEY,
                    wheelchair_id TEXT NOT NULL REFERENCES wheelchairs(id) ON DELETE CASCADE,
                    timestamp TIMESTAMPTZ NOT NULL,
                    room_id TEXT,
                    node_id TEXT,
                    distance_m REAL,
                    speed_ms REAL,
                    status TEXT,
                    rssi INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );

                -- Hourly aggregates from wheelchair history
                CREATE TABLE IF NOT EXISTS wheelchair_history_hourly (
                    wheelchair_id TEXT NOT NULL REFERENCES wheelchairs(id) ON DELETE CASCADE,
                    bucket_start TIMESTAMPTZ NOT NULL,
                    room_id TEXT,
                    node_id TEXT,
                    samples INTEGER NOT NULL DEFAULT 0,
                    distance_min_m REAL,
                    distance_max_m REAL,
                    distance_delta_m REAL,
                    speed_avg_ms REAL,
                    rssi_avg REAL,
                    first_seen TIMESTAMPTZ,
                    last_seen TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    PRIMARY KEY (wheelchair_id, bucket_start)
                );

                -- Daily aggregates from wheelchair history
                CREATE TABLE IF NOT EXISTS wheelchair_history_daily (
                    wheelchair_id TEXT NOT NULL REFERENCES wheelchairs(id) ON DELETE CASCADE,
                    bucket_date DATE NOT NULL,
                    room_id TEXT,
                    node_id TEXT,
                    samples INTEGER NOT NULL DEFAULT 0,
                    distance_min_m REAL,
                    distance_max_m REAL,
                    distance_delta_m REAL,
                    speed_avg_ms REAL,
                    rssi_avg REAL,
                    first_seen TIMESTAMPTZ,
                    last_seen TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    PRIMARY KEY (wheelchair_id, bucket_date)
                );
                
                -- Appliances (controlled via Home Assistant)
                CREATE TABLE IF NOT EXISTS appliances (
                    id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    ha_entity_id TEXT,
                    state INTEGER DEFAULT 0,
                    value INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- Timeline Events
                CREATE TABLE IF NOT EXISTS timeline_events (
                    id SERIAL PRIMARY KEY,
                    patient_id TEXT,
                    wheelchair_id TEXT,
                    event_type TEXT NOT NULL,
                    from_room_id TEXT,
                    to_room_id TEXT,
                    description TEXT,
                    metadata JSONB,
                    timestamp TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- RSSI Fingerprints (for location learning)
                CREATE TABLE IF NOT EXISTS rssi_fingerprints (
                    id SERIAL PRIMARY KEY,
                    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                    node_readings TEXT NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- Routines (scheduled activities with device actions)
                CREATE TABLE IF NOT EXISTS routines (
                    id TEXT PRIMARY KEY,
                    patient_id TEXT,
                    title TEXT NOT NULL,
                    description TEXT,
                    time TEXT NOT NULL,
                    room_id TEXT,
                    days JSONB DEFAULT '[]'::jsonb,
                    actions JSONB DEFAULT '[]'::jsonb,
                    enabled INTEGER DEFAULT 1,
                    last_triggered TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- Notifications
                CREATE TABLE IF NOT EXISTS notifications (
                    id SERIAL PRIMARY KEY,
                    patient_id TEXT,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    type TEXT DEFAULT 'info',
                    is_read BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- Alerts (emergency)
                CREATE TABLE IF NOT EXISTS alerts (
                    id SERIAL PRIMARY KEY,
                    patient_id TEXT,
                    wheelchair_id TEXT,
                    alert_type TEXT NOT NULL,
                    severity TEXT DEFAULT 'warning',
                    message TEXT NOT NULL,
                    resolved BOOLEAN DEFAULT FALSE,
                    resolved_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- AI Chat Sessions
                CREATE TABLE IF NOT EXISTS ai_chat_sessions (
                    id TEXT PRIMARY KEY,
                    patient_id TEXT,
                    title TEXT DEFAULT 'New Chat',
                    role TEXT DEFAULT 'user',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- AI Chat Messages
                CREATE TABLE IF NOT EXISTS ai_chat_messages (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    actions JSONB DEFAULT '[]'::jsonb,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                -- Health Scores
                CREATE TABLE IF NOT EXISTS health_scores (
                    id SERIAL PRIMARY KEY,
                    patient_id TEXT NOT NULL,
                    score INTEGER NOT NULL DEFAULT 0,
                    analysis TEXT,
                    recommendations JSONB DEFAULT '[]'::jsonb,
                    components JSONB DEFAULT '{}'::jsonb,
                    calculated_at TIMESTAMPTZ DEFAULT NOW()
                );
            """)

            # Add new columns if missing (migration-safe)
            await conn.execute("""
                ALTER TABLE health_scores ADD COLUMN IF NOT EXISTS components JSONB DEFAULT '{}'::jsonb;
                ALTER TABLE rooms ADD COLUMN IF NOT EXISTS restricted BOOLEAN DEFAULT FALSE;
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS node_id TEXT;
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS room_id TEXT;
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS room_name TEXT;
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS room_binding_last_updated TIMESTAMPTZ;
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS ip_address TEXT;
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline';
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS config_mode BOOLEAN DEFAULT FALSE;
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS ws_connected BOOLEAN DEFAULT FALSE;
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS frames_sent BIGINT DEFAULT 0;
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS frames_dropped BIGINT DEFAULT 0;
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
                ALTER TABLE camera_nodes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
                ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS device_type TEXT;
                ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS device_ip TEXT;
                ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS wifi_ssid TEXT;
                ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS request_host TEXT;
                ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS server_ip TEXT;
                ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS same_wifi BOOLEAN DEFAULT FALSE;
                ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS features_limited BOOLEAN DEFAULT FALSE;
                ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS warning_message TEXT;
                ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
                ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
                ALTER TABLE device_sync_status ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
            """)
            
            # Create indexes
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_wheelchairs_patient ON wheelchairs(patient_id);
                CREATE INDEX IF NOT EXISTS idx_wheelchairs_room ON wheelchairs(current_room_id);
                CREATE INDEX IF NOT EXISTS idx_nodes_room ON nodes(room_id);
                CREATE INDEX IF NOT EXISTS idx_rooms_floor ON rooms(floor_id);
                CREATE INDEX IF NOT EXISTS idx_floors_building ON floors(building_id);
                CREATE INDEX IF NOT EXISTS idx_appliances_room ON appliances(room_id);
                CREATE INDEX IF NOT EXISTS idx_timeline_patient ON timeline_events(patient_id);
                CREATE INDEX IF NOT EXISTS idx_timeline_timestamp ON timeline_events(timestamp);
                CREATE INDEX IF NOT EXISTS idx_wheelchair_history_wheelchair ON wheelchair_history(wheelchair_id);
                CREATE INDEX IF NOT EXISTS idx_wheelchair_history_timestamp ON wheelchair_history(timestamp);
                CREATE INDEX IF NOT EXISTS idx_wheelchair_history_hourly_bucket ON wheelchair_history_hourly(bucket_start);
                CREATE INDEX IF NOT EXISTS idx_wheelchair_history_daily_bucket ON wheelchair_history_daily(bucket_date);
                CREATE INDEX IF NOT EXISTS idx_routines_patient ON routines(patient_id);
                CREATE INDEX IF NOT EXISTS idx_routines_time ON routines(time);
                CREATE INDEX IF NOT EXISTS idx_notifications_patient ON notifications(patient_id);
                CREATE INDEX IF NOT EXISTS idx_alerts_patient ON alerts(patient_id);
                CREATE INDEX IF NOT EXISTS idx_chat_sessions_patient ON ai_chat_sessions(patient_id);
                CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON ai_chat_messages(session_id);
                CREATE INDEX IF NOT EXISTS idx_health_scores_patient ON health_scores(patient_id);
                CREATE INDEX IF NOT EXISTS idx_camera_nodes_room ON camera_nodes(room_id);
                CREATE INDEX IF NOT EXISTS idx_camera_nodes_status ON camera_nodes(status);
                CREATE INDEX IF NOT EXISTS idx_camera_nodes_last_seen ON camera_nodes(last_seen);
                CREATE INDEX IF NOT EXISTS idx_camera_nodes_binding ON camera_nodes(room_binding_last_updated);
                CREATE INDEX IF NOT EXISTS idx_sync_status_type ON device_sync_status(device_type);
                CREATE INDEX IF NOT EXISTS idx_sync_status_same_wifi ON device_sync_status(same_wifi);
                CREATE INDEX IF NOT EXISTS idx_sync_status_last_seen ON device_sync_status(last_seen);
            """)
        
        print("✅ Database schema initialized (no mock data)")


# Global database instance
db = Database()
