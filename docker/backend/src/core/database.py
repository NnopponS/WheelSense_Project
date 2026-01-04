"""
WheelSense Backend - SQLite Database Service
SQLite connection and operations (replacement for MongoDB)
"""

import logging
import json
import aiosqlite
from datetime import datetime
from typing import Any, Dict, List, Optional
from pathlib import Path

from .mongodb_compat import MongoDBCompatibilityLayer

logger = logging.getLogger(__name__)


def normalize_room_name(room_name: str) -> str:
    """
    Normalize room name for consistent matching.
    Converts to lowercase, replaces spaces with underscores, handles common variations.
    
    Examples:
        "Living Room" -> "livingroom"
        "living room" -> "livingroom"
        "Bedroom" -> "bedroom"
        "bed room" -> "bedroom"
    
    Args:
        room_name: Room name string (may be in various formats)
        
    Returns:
        Normalized room name (lowercase, no spaces)
    """
    if not room_name:
        return ""
    
    # Convert to lowercase and strip whitespace
    normalized = room_name.lower().strip()
    
    # Replace spaces and hyphens with nothing (for matching)
    normalized = normalized.replace(" ", "").replace("-", "").replace("_", "")
    
    # Map common variations
    room_mapping = {
        "livingroom": "livingroom",
        "living": "livingroom",
        "bedroom": "bedroom",
        "bed": "bedroom",
        "bathroom": "bathroom",
        "bath": "bathroom",
        "kitchen": "kitchen"
    }
    
    return room_mapping.get(normalized, normalized)


class Database:
    """SQLite database service."""
    
    def __init__(self, db_path: str = "data/wheelsense.db"):
        self.db_path = db_path
        self._db_connection: Optional[aiosqlite.Connection] = None
        self.is_connected = False
        self._compat_layer = None  # MongoDB compatibility layer
    
    async def connect(self):
        """Connect to SQLite database."""
        try:
            # Ensure data directory exists
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
            
            # Phase 4F: Set timeout for database operations (5 seconds for busy timeout)
            # SQLite busy timeout allows retries on locked database
            self._db_connection = await aiosqlite.connect(
                self.db_path,
                timeout=5.0  # 5 second timeout for busy database
            )
            self._db_connection.row_factory = aiosqlite.Row
            
            # Enable foreign keys
            await self._db_connection.execute("PRAGMA foreign_keys = ON")
            
            # Phase 4F: Set additional SQLite pragmas for better timeout handling
            await self._db_connection.execute("PRAGMA busy_timeout = 5000")  # 5 seconds
            
            # Create tables
            await self._create_tables()
            
            # Phase 1: Run migrations (non-breaking)
            await self._run_phase1_migrations()
            
            # Initialize MongoDB compatibility layer
            self._compat_layer = MongoDBCompatibilityLayer(self._db_connection, self)
            
            self.is_connected = True
            logger.info(f"Connected to SQLite database at {self.db_path} (timeout: 5s)")
        except Exception as e:
            logger.error(f"Failed to connect to SQLite: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from SQLite database."""
        if self._db_connection:
            await self._db_connection.close()
            self.is_connected = False
            logger.info("Disconnected from SQLite")
    
    async def _create_tables(self):
        """Create all necessary tables."""
        
        # Rooms table - includes x, y, width, height for map positioning
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                deviceId TEXT,
                roomType TEXT,
                name TEXT,
                nameEn TEXT,
                floorId TEXT,
                buildingId TEXT,
                x REAL DEFAULT 10,
                y REAL DEFAULT 10,
                width REAL DEFAULT 20,
                height REAL DEFAULT 20,
                temperature REAL DEFAULT 25,
                humidity REAL DEFAULT 60,
                isOccupied INTEGER DEFAULT 0,
                lastDetection TEXT,
                lastStatus TEXT,
                position TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Appliances table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS appliances (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                roomId TEXT,
                room TEXT,
                type TEXT,
                name TEXT,
                state INTEGER DEFAULT 0,
                isOn INTEGER DEFAULT 0,
                value INTEGER,
                brightness INTEGER,
                temperature INTEGER,
                volume INTEGER,
                speed INTEGER,
                ledPin INTEGER,
                lastStateChange TEXT,
                lastUpdated TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Devices table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                deviceId TEXT UNIQUE,
                name TEXT,
                type TEXT,
                room TEXT,
                ip TEXT,
                status TEXT,
                rotation INTEGER DEFAULT 0,
                lastSeen TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Activity Logs table
        # DEPRECATED: Use events table with type='activity' instead (Phase 2 migration)
        # This table is kept for backward compatibility during migration
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS activityLogs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                _id TEXT UNIQUE,
                roomId TEXT,
                userId TEXT,
                eventType TEXT,
                timestamp TEXT,
                details TEXT
            )
        """)
        
        # Emergency Events table
        # DEPRECATED: Use events table with type='emergency' instead (Phase 2 migration)
        # This table is kept for backward compatibility during migration
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS emergencyEvents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                _id TEXT UNIQUE,
                roomId TEXT,
                userId TEXT,
                eventType TEXT,
                severity TEXT,
                message TEXT,
                timestamp TEXT,
                resolved INTEGER DEFAULT 0,
                resolvedAt TEXT,
                notifiedContacts TEXT
            )
        """)
        
        # Behavior Analysis table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS behaviorAnalysis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                _id TEXT UNIQUE,
                userId TEXT,
                patientId TEXT,
                date TEXT,
                patterns TEXT,
                anomalies TEXT,
                geminiAnalysis TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Map Config table
        # DEPRECATED: Use map_config_view instead (Phase 1 migration)
        # This table is kept for backward compatibility during migration
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS mapConfig (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                buildings TEXT,
                floors TEXT,
                wheelchairPositions TEXT,
                updatedAt TEXT
            )
        """)
        
        # Timeline table
        # DEPRECATED: Use events table with type='location_change' instead (Phase 2 migration)
        # This table is kept for backward compatibility during migration
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS timeline (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                _id TEXT UNIQUE,
                type TEXT,
                userId TEXT,
                userName TEXT,
                wheelchairId TEXT,
                fromRoom TEXT,
                toRoom TEXT,
                timestamp TEXT,
                durationInPreviousRoom INTEGER,
                metadata TEXT
            )
        """)
        
        # Users table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                email TEXT UNIQUE,
                name TEXT,
                role TEXT,
                preferences TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Patients table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS patients (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                name TEXT,
                age INTEGER,
                condition TEXT,
                room TEXT,
                wheelchairId TEXT,
                emergencyContact TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Wheelchairs table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS wheelchairs (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                name TEXT,
                patientId TEXT,
                patientName TEXT,
                room TEXT,
                status TEXT,
                battery INTEGER,
                speed INTEGER,
                lastSeen TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Buildings table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS buildings (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                name TEXT,
                nameEn TEXT,
                floors TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Floors table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS floors (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                name TEXT,
                nameEn TEXT,
                buildingId TEXT,
                level INTEGER,
                rooms TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Corridors table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS corridors (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                name TEXT,
                floorId TEXT,
                points TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Mesh Routes table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS meshRoutes (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                nodeId TEXT,
                neighbors TEXT,
                position TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Routines table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS routines (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                patientId TEXT,
                title TEXT,
                description TEXT,
                time TEXT,
                completed INTEGER DEFAULT 0,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Doctor Notes table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS doctorNotes (
                id TEXT PRIMARY KEY,
                _id TEXT UNIQUE,
                patientId TEXT,
                doctorName TEXT,
                note TEXT,
                date TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Create indexes
        await self._create_indexes()
        
        # Create MCP tables for LLM integration
        await self._create_mcp_tables()
        
        # Phase 2: Create unified tables (alongside existing tables for gradual migration)
        await self._create_unified_tables()
        
        # Initialize MCP defaults
        await self._initialize_mcp_defaults()
        
        await self._db_connection.commit()
    
    async def _create_indexes(self):
        """Create indexes for better query performance."""
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_rooms_deviceId ON rooms(deviceId)",
            "CREATE INDEX IF NOT EXISTS idx_rooms_roomType ON rooms(roomType)",
            "CREATE INDEX IF NOT EXISTS idx_appliances_room ON appliances(room)",
            "CREATE INDEX IF NOT EXISTS idx_appliances_roomId ON appliances(roomId)",
            "CREATE INDEX IF NOT EXISTS idx_devices_deviceId ON devices(deviceId)",
            "CREATE INDEX IF NOT EXISTS idx_activityLogs_roomId ON activityLogs(roomId)",
            "CREATE INDEX IF NOT EXISTS idx_activityLogs_userId ON activityLogs(userId)",
            "CREATE INDEX IF NOT EXISTS idx_activityLogs_timestamp ON activityLogs(timestamp)",
            "CREATE INDEX IF NOT EXISTS idx_emergencyEvents_resolved ON emergencyEvents(resolved)",
            "CREATE INDEX IF NOT EXISTS idx_timeline_userId ON timeline(userId)",
            "CREATE INDEX IF NOT EXISTS idx_timeline_timestamp ON timeline(timestamp)",
            "CREATE INDEX IF NOT EXISTS idx_patients_wheelchairId ON patients(wheelchairId)",
            "CREATE INDEX IF NOT EXISTS idx_routines_patientId ON routines(patientId)",
            "CREATE INDEX IF NOT EXISTS idx_doctorNotes_patientId ON doctorNotes(patientId)",
        ]
        
        for index_sql in indexes:
            await self._db_connection.execute(index_sql)
    
    async def _create_mcp_tables(self):
        """Create MCP-related tables for LLM integration."""
        
        # Device States table - lightweight state cache
        # DEPRECATED: Use device_states_view instead (Phase 1 migration)
        # This table is kept for backward compatibility during migration
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS device_states (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room TEXT NOT NULL,
                device TEXT NOT NULL,
                state INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                UNIQUE(room, device)
            )
        """)
        
        # User Info table - single-user context for MCP
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS user_info (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name_thai TEXT DEFAULT "",
                name_english TEXT DEFAULT "",
                condition TEXT DEFAULT "",
                current_location TEXT DEFAULT "Bedroom",
                last_schedule_check_minute TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        
        # Phase 4E: Add last_schedule_check_minute column if it doesn't exist (migration)
        try:
            await self._db_connection.execute("""
                ALTER TABLE user_info ADD COLUMN last_schedule_check_minute TEXT
            """)
        except Exception:
            # Column already exists, ignore
            pass
        
        # Schedule Items table - base recurring schedule
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS schedule_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                time TEXT NOT NULL,
                activity TEXT NOT NULL,
                location TEXT,
                action TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        
        # One-Time Events table - date-specific events
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS one_time_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                activity TEXT NOT NULL,
                location TEXT,
                action TEXT,
                created_at TEXT NOT NULL
            )
        """)
        
        # Daily Schedule Clones table - daily modified schedules
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS daily_schedule_clones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL UNIQUE,
                schedule_data TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        
        # Notification Preferences table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS notification_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room TEXT NOT NULL,
                device TEXT NOT NULL,
                do_not_notify INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                UNIQUE(room, device)
            )
        """)
        
        # Do Not Remind table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS do_not_remind (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            )
        """)
        
        # Chat History table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                content_full TEXT,
                is_notification INTEGER DEFAULT 0,
                is_preference_update INTEGER DEFAULT 0,
                tool_result TEXT,
                session_id TEXT,
                created_at TEXT NOT NULL
            )
        """)
        
        # Add session_id column if it doesn't exist (migration for existing databases)
        try:
            await self._db_connection.execute("""
                ALTER TABLE chat_history ADD COLUMN session_id TEXT
            """)
        except Exception:
            # Column already exists, ignore
            pass
        
        # Conversation Summaries table
        await self._db_connection.execute("""
            CREATE TABLE IF NOT EXISTS conversation_summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary_text TEXT NOT NULL,
                key_events TEXT,
                last_summarized_turn INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        
        # Create indexes for MCP tables
        await self._create_mcp_indexes()
    
    async def _create_mcp_indexes(self):
        """Create indexes for MCP tables."""
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_device_states_room ON device_states(room)",
            "CREATE INDEX IF NOT EXISTS idx_device_states_device ON device_states(device)",
            "CREATE INDEX IF NOT EXISTS idx_device_states_room_device ON device_states(room, device)",
            "CREATE INDEX IF NOT EXISTS idx_schedule_items_time ON schedule_items(time)",
            "CREATE INDEX IF NOT EXISTS idx_one_time_events_date ON one_time_events(date)",
            "CREATE INDEX IF NOT EXISTS idx_one_time_events_datetime ON one_time_events(date, time)",
            "CREATE INDEX IF NOT EXISTS idx_daily_schedule_clones_date ON daily_schedule_clones(date)",
            "CREATE INDEX IF NOT EXISTS idx_notification_preferences_room_device ON notification_preferences(room, device)",
            "CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at)",
            "CREATE INDEX IF NOT EXISTS idx_chat_history_session_id ON chat_history(session_id)",
        ]
        
        for index_sql in indexes:
            await self._db_connection.execute(index_sql)
    
    async def _initialize_mcp_defaults(self):
        """Initialize default data for MCP tables."""
        now = datetime.now().isoformat()
        
        # Initialize user_info if it doesn't exist
        async with self._db_connection.execute(
            "SELECT id FROM user_info LIMIT 1"
        ) as cursor:
            existing = await cursor.fetchone()
            if not existing:
                await self._db_connection.execute("""
                    INSERT INTO user_info (name_thai, name_english, condition, current_location, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, ("", "", "", "Bedroom", now, now))
        
        # Initialize device_states from existing appliances
        async with self._db_connection.execute(
            "SELECT room, type, state, isOn FROM appliances"
        ) as cursor:
            appliances = await cursor.fetchall()
            for app in appliances:
                room = app['room'] if app['room'] else ""
                device = app['type'] if app['type'] else ""
                # Use isOn if available, otherwise use state
                # sqlite3.Row uses [] access, not .get()
                # Handle None values from database
                is_on = app['isOn']
                app_state = app['state']
                state = 1 if (is_on or app_state) else 0
                
                if room and device:
                    # Insert or ignore if already exists
                    await self._db_connection.execute("""
                        INSERT OR IGNORE INTO device_states (room, device, state, updated_at)
                        VALUES (?, ?, ?, ?)
                    """, (room, device, state, now))
    
    # ==================== Phase 1: Migration Support ====================
    
    async def _run_phase1_migrations(self):
        """Run Phase 1 migrations: add foreign keys and create views (non-breaking)."""
        try:
            # Add foreign key columns (nullable initially for backward compatibility)
            await self._migrate_add_foreign_keys()
            
            # Create views for derived data
            await self._create_derived_views()
            
            await self._db_connection.commit()
            logger.info("Phase 1 migrations completed successfully")
        except Exception as e:
            logger.warning(f"Phase 1 migration warning: {e}")
            # Don't fail on migration errors - allow graceful degradation
    
    async def _migrate_add_foreign_keys(self):
        """Add foreign key columns to existing tables (Phase 1)."""
        migrations = [
            # Add room_id to appliances (if room column exists, populate from it)
            ("appliances", "room_id", "TEXT", """
                UPDATE appliances 
                SET room_id = (
                    SELECT id FROM rooms 
                    WHERE rooms.name = appliances.room 
                       OR rooms.nameEn = appliances.room 
                       OR rooms.roomType = appliances.room 
                    LIMIT 1
                )
                WHERE room_id IS NULL AND room IS NOT NULL
            """),
            # Add room_id to patients
            ("patients", "room_id", "TEXT", """
                UPDATE patients 
                SET room_id = (
                    SELECT id FROM rooms 
                    WHERE rooms.name = patients.room 
                       OR rooms.nameEn = patients.room 
                       OR rooms.roomType = patients.room 
                    LIMIT 1
                )
                WHERE room_id IS NULL AND room IS NOT NULL
            """),
            # Add room_id to wheelchairs
            ("wheelchairs", "room_id", "TEXT", """
                UPDATE wheelchairs 
                SET room_id = (
                    SELECT id FROM rooms 
                    WHERE rooms.name = wheelchairs.room 
                       OR rooms.nameEn = wheelchairs.room 
                       OR rooms.roomType = wheelchairs.room 
                    LIMIT 1
                )
                WHERE room_id IS NULL AND room IS NOT NULL
            """),
            # Add room_id to devices
            ("devices", "room_id", "TEXT", """
                UPDATE devices 
                SET room_id = (
                    SELECT id FROM rooms 
                    WHERE rooms.name = devices.room 
                       OR rooms.nameEn = devices.room 
                       OR rooms.roomType = devices.room 
                    LIMIT 1
                )
                WHERE room_id IS NULL AND room IS NOT NULL
            """),
        ]
        
        for table_name, column_name, column_type, populate_sql in migrations:
            try:
                # Check if column already exists
                async with self._db_connection.execute(
                    f"PRAGMA table_info({table_name})"
                ) as cursor:
                    columns = await cursor.fetchall()
                    column_exists = any(col[1] == column_name for col in columns)
                
                if not column_exists:
                    # Add column
                    await self._db_connection.execute(
                        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
                    )
                    logger.info(f"Added column {column_name} to {table_name}")
                    
                    # Populate from existing room string field
                    try:
                        await self._db_connection.execute(populate_sql)
                        logger.info(f"Populated {column_name} in {table_name} from existing room field")
                    except Exception as e:
                        logger.debug(f"Could not populate {column_name} in {table_name}: {e}")
                else:
                    logger.debug(f"Column {column_name} already exists in {table_name}")
            except Exception as e:
                logger.warning(f"Migration warning for {table_name}.{column_name}: {e}")
    
    async def _create_derived_views(self):
        """Create views for derived data (Phase 1)."""
        views = [
            # Device states view - replaces device_states table
            ("device_states_view", """
                CREATE VIEW IF NOT EXISTS device_states_view AS
                SELECT 
                    COALESCE(a.room_id, a.room) as room,
                    a.type as device,
                    CASE WHEN a.isOn IS NOT NULL THEN a.isOn ELSE a.state END as state,
                    COALESCE(a.lastStateChange, a.lastUpdated, a.updatedAt) as updated_at
                FROM appliances a
                WHERE a.type IS NOT NULL
            """),
            
            # Current user location view - derived from timeline (latest location per user)
            ("current_user_location_view", """
                CREATE VIEW IF NOT EXISTS current_user_location_view AS
                SELECT 
                    t1.userId,
                    t1.toRoom as current_location,
                    t1.timestamp
                FROM timeline t1
                INNER JOIN (
                    SELECT userId, MAX(timestamp) as max_timestamp
                    FROM timeline
                    WHERE type = 'location_change' AND toRoom IS NOT NULL
                    GROUP BY userId
                ) t2 ON t1.userId = t2.userId AND t1.timestamp = t2.max_timestamp
                WHERE t1.type = 'location_change' AND t1.toRoom IS NOT NULL
            """),
            
            # Map config view - derived from normalized tables (simplified version)
            # Note: SQLite's json_group_object requires key-value pairs, so we use json_group_array with json_object
            ("map_config_view", """
                CREATE VIEW IF NOT EXISTS map_config_view AS
                SELECT 
                    'main' as id,
                    (SELECT json_group_array(
                        json_object(
                            'id', b.id,
                            'name', b.name,
                            'nameEn', b.nameEn
                        )
                    ) FROM buildings b) as buildings,
                    (SELECT json_group_array(
                        json_object(
                            'id', w.id,
                            'room', COALESCE(w.room, ''),
                            'room_id', COALESCE(w.room_id, ''),
                            'status', COALESCE(w.status, '')
                        )
                    ) FROM wheelchairs w) as wheelchairPositions
            """),
        ]
        
        for view_name, view_sql in views:
            try:
                # Drop view if exists (to allow updates)
                await self._db_connection.execute(f"DROP VIEW IF EXISTS {view_name}")
                # Create view
                await self._db_connection.execute(view_sql)
                logger.info(f"Created view {view_name}")
            except Exception as e:
                logger.warning(f"Could not create view {view_name}: {e}")
                # Continue with other views even if one fails
    
    # ==================== Phase 2: Unified Tables ====================
    
    async def _create_unified_tables(self):
        """Create unified tables alongside existing tables for gradual migration (Phase 2)."""
        try:
            # Events table - unified event log (replaces activityLogs + timeline + emergencyEvents)
            await self._db_connection.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL,
                    room_id TEXT,
                    user_id TEXT,
                    device_id TEXT,
                    from_room TEXT,
                    to_room TEXT,
                    severity TEXT,
                    message TEXT,
                    resolved INTEGER DEFAULT 0,
                    resolved_at TEXT,
                    metadata TEXT,
                    timestamp TEXT NOT NULL,
                    created_at TEXT
                )
            """)
            
            # Schedule events table - unified schedule (replaces schedule_items + one_time_events + daily_schedule_clones)
            await self._db_connection.execute("""
                CREATE TABLE IF NOT EXISTS schedule_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    base_schedule_id INTEGER,
                    date TEXT,
                    time TEXT NOT NULL,
                    activity TEXT NOT NULL,
                    location TEXT,
                    action TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            
            # Care records table - unified care management (replaces routines + doctorNotes)
            await self._db_connection.execute("""
                CREATE TABLE IF NOT EXISTS care_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    patient_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    title TEXT,
                    content TEXT,
                    scheduled_time TEXT,
                    completed INTEGER DEFAULT 0,
                    doctor_name TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            
            # Notification settings table - unified notifications (replaces notification_preferences + do_not_remind)
            await self._db_connection.execute("""
                CREATE TABLE IF NOT EXISTS notification_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL,
                    room_id TEXT,
                    device_id TEXT,
                    item TEXT,
                    value INTEGER,
                    created_at TEXT NOT NULL
                )
            """)
            
            # Chat sessions table - unified chat (replaces chat_history + conversation_summaries)
            await self._db_connection.execute("""
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    content_full TEXT,
                    is_notification INTEGER DEFAULT 0,
                    is_preference_update INTEGER DEFAULT 0,
                    tool_result TEXT,
                    summary_text TEXT,
                    key_events TEXT,
                    last_summarized_turn INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                )
            """)
            
            # User context table - replaces user_info (without current_location - derived from events)
            await self._db_connection.execute("""
                CREATE TABLE IF NOT EXISTS user_context (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name_thai TEXT DEFAULT "",
                    name_english TEXT DEFAULT "",
                    condition TEXT DEFAULT "",
                    last_schedule_check_minute TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            
            # Create indexes for unified tables
            await self._create_unified_indexes()
            
            logger.info("Phase 2 unified tables created successfully")
        except Exception as e:
            logger.warning(f"Phase 2 unified tables creation warning: {e}")
    
    async def _create_unified_indexes(self):
        """Create indexes for unified tables."""
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)",
            "CREATE INDEX IF NOT EXISTS idx_events_room_id ON events(room_id)",
            "CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)",
            "CREATE INDEX IF NOT EXISTS idx_events_resolved ON events(resolved)",
            "CREATE INDEX IF NOT EXISTS idx_schedule_events_type ON schedule_events(event_type)",
            "CREATE INDEX IF NOT EXISTS idx_schedule_events_date ON schedule_events(date)",
            "CREATE INDEX IF NOT EXISTS idx_schedule_events_datetime ON schedule_events(date, time)",
            "CREATE INDEX IF NOT EXISTS idx_care_records_patient_id ON care_records(patient_id)",
            "CREATE INDEX IF NOT EXISTS idx_care_records_type ON care_records(type)",
            "CREATE INDEX IF NOT EXISTS idx_notification_settings_type ON notification_settings(type)",
            "CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_id ON chat_sessions(session_id)",
            "CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at)",
        ]
        
        for index_sql in indexes:
            try:
                await self._db_connection.execute(index_sql)
            except Exception as e:
                logger.debug(f"Index creation warning: {e}")
    
    # ==================== Phase 2: Unified Fetch Methods ====================
    # These methods support both old and new tables during migration
    
    async def get_events_unified(
        self,
        event_type: Optional[str] = None,
        room_id: Optional[str] = None,
        user_id: Optional[str] = None,
        limit: int = 100,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict]:
        """
        Unified event fetch - supports both new events table and legacy tables.
        During migration, reads from new table first, falls back to old tables if needed.
        """
        query = "SELECT * FROM events WHERE 1=1"
        params = []
        
        if event_type:
            query += " AND type = ?"
            params.append(event_type)
        
        if room_id:
            query += " AND room_id = ?"
            params.append(room_id)
        
        if user_id:
            query += " AND user_id = ?"
            params.append(user_id)
        
        if start_date:
            query += " AND timestamp >= ?"
            params.append(start_date.isoformat())
        
        if end_date:
            query += " AND timestamp <= ?"
            params.append(end_date.isoformat())
        
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        
        try:
            async with self._db_connection.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                if rows:
                    return [self._serialize_doc(row) for row in rows]
        except Exception as e:
            logger.debug(f"Could not fetch from events table, falling back to legacy: {e}")
        
        # Fallback to legacy tables if new table is empty or fails
        if event_type == 'activity':
            return await self.get_activity_logs(room_id=room_id, limit=limit)
        elif event_type == 'location_change':
            return await self.get_timeline(user_id=user_id, room_id=room_id, limit=limit)
        elif event_type == 'emergency':
            return await self.get_active_emergencies() if not room_id else []
        
        return []
    
    async def save_event_unified(self, event_data: Dict) -> Dict:
        """
        Unified event save - writes to both new events table and legacy tables during migration.
        """
        now = datetime.now().isoformat()
        event_type = event_data.get('type', 'activity')
        event_id = None
        
        # Save to new unified events table
        try:
            cursor = await self._db_connection.execute("""
                INSERT INTO events (
                    type, room_id, user_id, device_id, from_room, to_room,
                    severity, message, resolved, resolved_at, metadata, timestamp, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event_type,
                event_data.get('room_id'),
                event_data.get('user_id'),
                event_data.get('device_id'),
                event_data.get('from_room'),
                event_data.get('to_room'),
                event_data.get('severity'),
                event_data.get('message'),
                1 if event_data.get('resolved', False) else 0,
                event_data.get('resolved_at'),
                json.dumps(event_data.get('metadata', {})),
                event_data.get('timestamp', now),
                now
            ))
            event_id = cursor.lastrowid
            await self._db_connection.commit()
        except Exception as e:
            logger.warning(f"Could not save to events table: {e}")
        
        # Also save to legacy table for backward compatibility
        legacy_result = {}
        if event_type == 'activity':
            legacy_result = await self.log_activity(
                room_id=event_data.get('room_id', ''),
                event_type=event_data.get('event_type', 'activity'),
                details=event_data.get('metadata', {}),
                user_id=event_data.get('user_id')
            ) or {}
        elif event_type == 'location_change':
            legacy_result = await self.save_location_event(
                user_id=event_data.get('user_id', ''),
                wheelchair_id=event_data.get('metadata', {}).get('wheelchair_id', ''),
                from_room=event_data.get('from_room'),
                to_room=event_data.get('to_room', ''),
                user_name=event_data.get('metadata', {}).get('user_name')
            ) or {}
        elif event_type == 'emergency':
            legacy_result = await self.create_emergency(
                room_id=event_data.get('room_id', ''),
                event_type=event_data.get('event_type', 'emergency'),
                severity=event_data.get('severity', 'medium'),
                message=event_data.get('message'),
                user_id=event_data.get('user_id')
            ) or {}
        
        # Return the saved event from new table if available, otherwise legacy
        if event_id:
            try:
                async with self._db_connection.execute(
                    "SELECT * FROM events WHERE id = ?", (event_id,)
                ) as result_cursor:
                    row = await result_cursor.fetchone()
                    if row:
                        return self._serialize_doc(row)
            except Exception as e:
                logger.debug(f"Could not fetch saved event: {e}")
        
        # Return legacy result if new table save failed
        return legacy_result if legacy_result else {}
    
    async def get_device_states_from_view(self) -> Dict[str, Dict[str, bool]]:
        """
        Get device states from view (Phase 1) - replaces device_states table.
        Always up-to-date, no sync needed.
        """
        try:
            async with self._db_connection.execute(
                "SELECT room, device, state FROM device_states_view"
            ) as cursor:
                rows = await cursor.fetchall()
                result = {}
                for row in rows:
                    room = row['room']
                    device = row['device']
                    state = bool(row['state'])
                    if room not in result:
                        result[room] = {}
                    result[room][device] = state
                return result
        except Exception as e:
            logger.warning(f"Could not fetch from device_states_view, falling back to table: {e}")
            # Fallback to old table
            return await self.get_all_device_states()
    
    # ==================== Helper Methods ====================
    
    def _generate_id(self) -> str:
        """Generate a unique ID similar to MongoDB ObjectId."""
        import uuid
        return str(uuid.uuid4()).replace('-', '')[:24]
    
    @staticmethod
    def _serialize_doc(doc: Optional[Dict]) -> Optional[Dict]:
        """Convert database row to JSON-serializable dict."""
        if not doc:
            return None
        
        result = dict(doc) if hasattr(doc, 'keys') else doc
        
        # Parse JSON fields
        json_fields = ['lastStatus', 'details', 'notifiedContacts', 'patterns', 
                      'anomalies', 'preferences', 'metadata', 'buildings', 'floors',
                      'wheelchairPositions', 'neighbors', 'position', 'points', 'rooms']
        
        for field in json_fields:
            if field in result and isinstance(result[field], str):
                try:
                    result[field] = json.loads(result[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        
        # Convert boolean fields
        bool_fields = ['isOccupied', 'state', 'isOn', 'resolved', 'completed']
        for field in bool_fields:
            if field in result and result[field] is not None:
                result[field] = bool(result[field])
        
        # Normalize names (same as MongoDB version)
        if isinstance(result, dict):
            if 'nameEn' in result and result.get('nameEn'):
                if result.get('name') != result.get('nameEn'):
                    result['name'] = result['nameEn']
            
            if 'name' in result and result.get('name') and any('\u0E00' <= char <= '\u0E7F' for char in result['name']):
                if result.get('nameEn'):
                    result['name'] = result['nameEn']
            
            if 'name' in result and result.get('name'):
                floor_map = {
                    'ชั้น 1': 'Floor 1',
                    'ชั้น 2': 'Floor 2',
                    'ชั้น 3': 'Floor 3'
                }
                if result['name'] in floor_map:
                    result['name'] = floor_map[result['name']]
            
            if 'condition' in result:
                condition_map = {
                    'ปกติ': 'Normal',
                    'ต้องระวัง': 'Caution',
                    'ฉุกเฉิน': 'Emergency'
                }
                if result['condition'] in condition_map:
                    result['condition'] = condition_map[result['condition']]
        
        return result
    
    # ==================== Room Operations ====================
    
    async def get_all_rooms(self) -> List[Dict]:
        """Get all rooms."""
        async with self._db_connection.execute("SELECT * FROM rooms") as cursor:
            rows = await cursor.fetchall()
            return [self._serialize_doc(row) for row in rows]
    
    async def get_room(self, room_id: str) -> Optional[Dict]:
        """Get room by ID or device ID or roomType (with normalization)."""
        normalized_room_id = normalize_room_name(room_id)
        
        # Try exact match first
        async with self._db_connection.execute(
            "SELECT * FROM rooms WHERE id = ? OR _id = ? OR deviceId = ? OR roomType = ?",
            (room_id, room_id, room_id, room_id)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return self._serialize_doc(row)
        
        # Try normalized match
        all_rooms = await self.get_all_rooms()
        for r in all_rooms:
            room_type = r.get("roomType", "")
            name_en = r.get("nameEn", "")
            name = r.get("name", "")
            
            if (normalize_room_name(room_type) == normalized_room_id or
                normalize_room_name(name_en) == normalized_room_id or
                normalize_room_name(name) == normalized_room_id):
                return r
        
        return None
    
    async def update_room_status(self, room_type: str, status: Dict):
        """Update room status by roomType (simple version)."""
        # Normalize room name to match database format
        normalized_room = normalize_room_name(room_type)
        
        await self._db_connection.execute(
            """UPDATE rooms 
               SET isOccupied = ?, lastDetection = ?, lastStatus = ?
               WHERE roomType = ? OR id = ?""",
            (
                1 if status.get("user_detected", False) else 0,
                datetime.now().isoformat() if status.get("user_detected") else None,
                json.dumps(status),
                normalized_room, normalized_room  # Match roomType or id
            )
        )
        await self._db_connection.commit()
        logger.debug(f"Updated room status for {normalized_room}: isOccupied={1 if status.get('user_detected') else 0}")
    
    async def update_device_status(self, device_id: str, status: Dict):
        """Update or create device status."""
        now = datetime.now().isoformat()
        
        # Convert any datetime objects in status to ISO strings
        serialized_status = {}
        for key, value in status.items():
            if isinstance(value, datetime):
                serialized_status[key] = value.isoformat()
            else:
                serialized_status[key] = value
        
        # Check if device exists
        async with self._db_connection.execute(
            "SELECT id FROM devices WHERE deviceId = ?", (device_id,)
        ) as cursor:
            existing = await cursor.fetchone()
        
        if existing:
            # Update existing device
            await self._db_connection.execute(
                """UPDATE devices 
                   SET lastSeen = ?, status = ?, updatedAt = ?, type = ?, room = ?, ip = ?
                   WHERE deviceId = ?""",
                (
                    now,
                    json.dumps(serialized_status),
                    now,
                    serialized_status.get("device_type"),
                    serialized_status.get("room"),
                    serialized_status.get("ip"),
                    device_id
                )
            )
        else:
            # Insert new device
            new_id = f"D{int(datetime.now().timestamp())}"
            _id = self._generate_id()
            await self._db_connection.execute(
                """INSERT INTO devices (id, _id, deviceId, name, type, room, ip, status, lastSeen, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    new_id,
                    _id,
                    device_id,
                    device_id,
                    serialized_status.get("device_type"),
                    serialized_status.get("room"),
                    serialized_status.get("ip"),
                    json.dumps(serialized_status),
                    now,
                    now,
                    now
                )
            )
        
        await self._db_connection.commit()
    
    # ==================== Appliance Operations ====================
    
    async def get_room_appliances(self, room_id: str) -> List[Dict]:
        """Get all appliances in a room."""
        room = await self.get_room(room_id)
        if not room:
            return []
        
        room_obj_id = room.get("_id")
        
        async with self._db_connection.execute(
            "SELECT * FROM appliances WHERE roomId = ? OR room = ?",
            (room_obj_id, room_id)
        ) as cursor:
            rows = await cursor.fetchall()
            return [self._serialize_doc(row) for row in rows]
    
    async def update_appliance_state(
        self, room_id: str, appliance_type: str, state: bool
    ):
        """Update appliance state."""
        room = await self.get_room(room_id)
        if not room:
            return
        
        room_obj_id = room.get("_id")
        
        await self._db_connection.execute(
            """UPDATE appliances 
               SET isOn = ?, state = ?, lastStateChange = ?
               WHERE roomId = ? AND type = ?""",
            (1 if state else 0, 1 if state else 0, datetime.now().isoformat(), room_obj_id, appliance_type)
        )
        await self._db_connection.commit()
        
        # Sync to device_states table
        await self.sync_appliance_to_state(room_id, appliance_type, state)
    
    # ==================== Activity Logging ====================
    
    async def log_activity(
        self,
        room_id: str,
        event_type: str,
        details: Optional[Dict] = None,
        user_id: Optional[str] = None
    ):
        """Log an activity event."""
        room = await self.get_room(room_id) if room_id else None
        room_object_id = room.get("_id") if room else self._generate_id()
        
        if not user_id:
            user_object_id = "000000000000000053595354"  # SYSTEM
        else:
            user_object_id = user_id
        
        _id = self._generate_id()
        
        await self._db_connection.execute(
            """INSERT INTO activityLogs (id, _id, roomId, userId, eventType, timestamp, details)
               VALUES (NULL, ?, ?, ?, ?, ?, ?)""",
            (
                _id,
                room_object_id,
                user_object_id,
                event_type,
                datetime.now().isoformat(),
                json.dumps(details or {})
            )
        )
        await self._db_connection.commit()
    
    async def get_activity_logs(
        self,
        room_id: Optional[str] = None,
        event_types: Optional[List[str]] = None,
        limit: int = 50
    ) -> List[Dict]:
        """Get activity logs with optional filters."""
        query = "SELECT * FROM activityLogs WHERE 1=1"
        params = []
        
        if room_id:
            room = await self.get_room(room_id)
            if room:
                query += " AND roomId = ?"
                params.append(room.get("_id"))
        
        if event_types:
            placeholders = ",".join("?" * len(event_types))
            query += f" AND eventType IN ({placeholders})"
            params.extend(event_types)
        
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        
        async with self._db_connection.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            return [self._serialize_doc(row) for row in rows]
    
    async def get_user_activities(
        self, user_id: str, date: Optional[str] = None
    ) -> List[Dict]:
        """Get activities for a specific user."""
        query = "SELECT * FROM activityLogs WHERE userId = ?"
        params = [user_id]
        
        if date:
            start = datetime.fromisoformat(date)
            end = datetime(start.year, start.month, start.day, 23, 59, 59)
            query += " AND timestamp >= ? AND timestamp <= ?"
            params.extend([start.isoformat(), end.isoformat()])
        
        query += " ORDER BY timestamp DESC LIMIT 1000"
        
        async with self._db_connection.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            return [self._serialize_doc(row) for row in rows]
    
    # ==================== Emergency Operations ====================
    
    async def create_emergency(
        self,
        room_id: str,
        event_type: str,
        severity: str,
        message: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict:
        """Create an emergency event."""
        room = await self.get_room(room_id) if room_id else None
        room_obj_id = room.get("_id") if room else None
        
        _id = self._generate_id()
        
        await self._db_connection.execute(
            """INSERT INTO emergencyEvents 
               (id, _id, roomId, userId, eventType, severity, message, timestamp, resolved, notifiedContacts)
               VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, 0, ?)""",
            (
                _id,
                room_obj_id,
                user_id,
                event_type,
                severity,
                message,
                datetime.now().isoformat(),
                json.dumps([])
            )
        )
        await self._db_connection.commit()
        
        # Fetch the created event
        async with self._db_connection.execute(
            "SELECT * FROM emergencyEvents WHERE _id = ?", (_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return self._serialize_doc(row)
    
    async def get_active_emergencies(self) -> List[Dict]:
        """Get all unresolved emergency events."""
        async with self._db_connection.execute(
            "SELECT * FROM emergencyEvents WHERE resolved = 0 ORDER BY timestamp DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [self._serialize_doc(row) for row in rows]
    
    async def resolve_emergency(self, event_id: str) -> bool:
        """Resolve an emergency event."""
        cursor = await self._db_connection.execute(
            """UPDATE emergencyEvents 
               SET resolved = 1, resolvedAt = ?
               WHERE _id = ?""",
            (datetime.now().isoformat(), event_id)
        )
        await self._db_connection.commit()
        return cursor.rowcount > 0
    
    # ==================== Behavior Analysis ====================
    
    async def save_behavior_analysis(
        self,
        user_id: str,
        date: str,
        patterns: Dict,
        anomalies: List,
        gemini_analysis: str
    ):
        """Save behavior analysis results."""
        date_obj = datetime.fromisoformat(date)
        
        # Check if exists
        async with self._db_connection.execute(
            "SELECT id FROM behaviorAnalysis WHERE userId = ? AND date = ?",
            (user_id, date_obj.isoformat())
        ) as cursor:
            existing = await cursor.fetchone()
        
        if existing:
            await self._db_connection.execute(
                """UPDATE behaviorAnalysis 
                   SET patterns = ?, anomalies = ?, geminiAnalysis = ?, updatedAt = ?
                   WHERE userId = ? AND date = ?""",
                (
                    json.dumps(patterns),
                    json.dumps(anomalies),
                    gemini_analysis,
                    datetime.now().isoformat(),
                    user_id,
                    date_obj.isoformat()
                )
            )
        else:
            _id = self._generate_id()
            await self._db_connection.execute(
                """INSERT INTO behaviorAnalysis 
                   (id, _id, userId, date, patterns, anomalies, geminiAnalysis, createdAt, updatedAt)
                   VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    _id,
                    user_id,
                    date_obj.isoformat(),
                    json.dumps(patterns),
                    json.dumps(anomalies),
                    gemini_analysis,
                    datetime.now().isoformat(),
                    datetime.now().isoformat()
                )
            )
        
        await self._db_connection.commit()
    
    async def get_latest_behavior_analysis(self, user_id: str) -> Optional[Dict]:
        """Get the latest behavior analysis for a user."""
        async with self._db_connection.execute(
            "SELECT * FROM behaviorAnalysis WHERE userId = ? ORDER BY date DESC LIMIT 1",
            (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return self._serialize_doc(row) if row else None
    
    # ==================== Map Configuration Operations ====================
    
    async def save_map_config(self, config: Dict):
        """Save map configuration (buildings, floors, rooms, wheelchair positions)."""
        # Check if exists
        async with self._db_connection.execute(
            "SELECT id FROM mapConfig WHERE id = 'main'"
        ) as cursor:
            existing = await cursor.fetchone()
        
        if existing:
            await self._db_connection.execute(
                """UPDATE mapConfig 
                   SET buildings = ?, floors = ?, wheelchairPositions = ?, updatedAt = ?
                   WHERE id = 'main'""",
                (
                    json.dumps(config.get("buildings", [])),
                    json.dumps(config.get("floors", [])),
                    json.dumps(config.get("wheelchairPositions", {})),
                    datetime.now().isoformat()
                )
            )
        else:
            _id = self._generate_id()
            await self._db_connection.execute(
                """INSERT INTO mapConfig (id, _id, buildings, floors, wheelchairPositions, updatedAt)
                   VALUES ('main', ?, ?, ?, ?, ?)""",
                (
                    _id,
                    json.dumps(config.get("buildings", [])),
                    json.dumps(config.get("floors", [])),
                    json.dumps(config.get("wheelchairPositions", {})),
                    datetime.now().isoformat()
                )
            )
        
        await self._db_connection.commit()
    
    async def get_map_config(self) -> Optional[Dict]:
        """Get map configuration."""
        async with self._db_connection.execute(
            "SELECT * FROM mapConfig WHERE id = 'main'"
        ) as cursor:
            row = await cursor.fetchone()
            return self._serialize_doc(row) if row else None
    
    async def save_wheelchair_positions(self, positions: Dict):
        """Save wheelchair positions."""
        async with self._db_connection.execute(
            "SELECT id FROM mapConfig WHERE id = 'main'"
        ) as cursor:
            existing = await cursor.fetchone()
        
        if existing:
            await self._db_connection.execute(
                """UPDATE mapConfig 
                   SET wheelchairPositions = ?, updatedAt = ?
                   WHERE id = 'main'""",
                (json.dumps(positions), datetime.now().isoformat())
            )
        else:
            _id = self._generate_id()
            await self._db_connection.execute(
                """INSERT INTO mapConfig (id, _id, wheelchairPositions, updatedAt)
                   VALUES ('main', ?, ?, ?)""",
                (_id, json.dumps(positions), datetime.now().isoformat())
            )
        
        await self._db_connection.commit()
    
    async def get_wheelchair_positions(self) -> Dict:
        """Get wheelchair positions."""
        config = await self.get_map_config()
        return config.get("wheelchairPositions", {}) if config else {}
    
    # ==================== Timeline / Location History Operations ====================
    
    async def save_location_event(
        self,
        user_id: str,
        wheelchair_id: str,
        from_room: Optional[str],
        to_room: str,
        user_name: Optional[str] = None,
        detection_confidence: float = 0.0,
        bbox: Optional[List] = None
    ) -> Dict:
        """Save a location change event to timeline collection."""
        now = datetime.now().isoformat()
        
        # Calculate duration in previous room if we have history
        duration = None
        if from_room:
            async with self._db_connection.execute(
                """SELECT timestamp FROM timeline 
                   WHERE userId = ? AND toRoom = ? 
                   ORDER BY timestamp DESC LIMIT 1""",
                (user_id, from_room)
            ) as cursor:
                last_event = await cursor.fetchone()
                if last_event:
                    last_time = datetime.fromisoformat(last_event['timestamp'])
                    duration = int((datetime.now() - last_time).total_seconds())
        
        _id = self._generate_id()
        
        await self._db_connection.execute(
            """INSERT INTO timeline 
               (id, _id, type, userId, userName, wheelchairId, fromRoom, toRoom, timestamp, durationInPreviousRoom, metadata)
               VALUES (NULL, ?, 'location_change', ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                _id,
                user_id,
                user_name or user_id,
                wheelchair_id,
                from_room,
                to_room,
                now,
                duration,
                json.dumps({"detectionConfidence": detection_confidence, "bbox": bbox})
            )
        )
        await self._db_connection.commit()
        
        logger.info(f"Saved location event: {user_name or user_id} moved from {from_room} to {to_room}")
        
        # Note: Location sync to user_info is handled by the caller (e.g., main.py on_wheelchair_detection)
        # to ensure proper room name normalization (English names like "Living Room" instead of raw types like "livingroom")
        
        # Fetch the created event
        async with self._db_connection.execute(
            "SELECT * FROM timeline WHERE _id = ?", (_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return self._serialize_doc(row)
    
    async def get_timeline(
        self,
        user_id: Optional[str] = None,
        room_id: Optional[str] = None,
        event_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get timeline events with optional filters."""
        query = "SELECT * FROM timeline WHERE 1=1"
        params = []
        
        if user_id:
            query += " AND userId = ?"
            params.append(user_id)
        
        if room_id:
            query += " AND (fromRoom = ? OR toRoom = ?)"
            params.extend([room_id, room_id])
        
        if event_type:
            query += " AND type = ?"
            params.append(event_type)
        
        if start_date:
            query += " AND timestamp >= ?"
            params.append(start_date.isoformat())
        
        if end_date:
            query += " AND timestamp <= ?"
            params.append(end_date.isoformat())
        
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        
        async with self._db_connection.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            return [self._serialize_doc(row) for row in rows]
    
    async def get_timeline_by_date(self, date_str: str, user_id: Optional[str] = None) -> List[Dict]:
        """Get all timeline events for a specific date."""
        try:
            date = datetime.fromisoformat(date_str)
        except ValueError:
            date = datetime.strptime(date_str, "%Y-%m-%d")
        
        start_of_day = datetime(date.year, date.month, date.day, 0, 0, 0)
        end_of_day = datetime(date.year, date.month, date.day, 23, 59, 59)
        
        return await self.get_timeline(
            user_id=user_id,
            start_date=start_of_day,
            end_date=end_of_day,
            limit=1000
        )
    
    async def get_timeline_summary(self, user_id: str, date_str: Optional[str] = None) -> Dict:
        """Get summary of timeline for analysis."""
        if date_str:
            events = await self.get_timeline_by_date(date_str, user_id)
        else:
            events = await self.get_timeline(user_id=user_id, limit=500)
        
        # Calculate room time distribution
        room_times = {}
        for event in events:
            from_room = event.get("fromRoom")
            duration = event.get("durationInPreviousRoom", 0)
            
            if from_room and duration and duration > 0:
                room_times[from_room] = room_times.get(from_room, 0) + duration
        
        # Count transitions per room
        room_visits = {}
        for event in events:
            to_room = event.get("toRoom")
            if to_room:
                room_visits[to_room] = room_visits.get(to_room, 0) + 1
        
        return {
            "totalEvents": len(events),
            "roomTimeDistribution": room_times,
            "roomVisitCounts": room_visits,
            "firstEvent": events[-1] if events else None,
            "lastEvent": events[0] if events else None
        }
    
    # ==================== User Operations ====================
    
    async def get_user(self, user_id: str) -> Optional[Dict]:
        """Get user by ID."""
        async with self._db_connection.execute(
            "SELECT * FROM users WHERE id = ? OR _id = ? OR email = ?",
            (user_id, user_id, user_id)
        ) as cursor:
            row = await cursor.fetchone()
            return self._serialize_doc(row) if row else None
    
    async def update_user_preferences(self, user_id: str, preferences: Dict) -> bool:
        """Update user preferences."""
        cursor = await self._db_connection.execute(
            """UPDATE users 
               SET preferences = ?, updatedAt = ?
               WHERE id = ? OR _id = ?""",
            (json.dumps(preferences), datetime.now().isoformat(), user_id, user_id)
        )
        await self._db_connection.commit()
        return cursor.rowcount > 0
    
    # ==================== State Synchronization Helpers ====================
    
    async def sync_appliance_to_state(self, room: str, device: str, state: bool):
        """Sync appliance state to device_states table."""
        now = datetime.now().isoformat()
        try:
            await self._db_connection.execute("BEGIN TRANSACTION")
            await self._db_connection.execute("""
                INSERT OR REPLACE INTO device_states (room, device, state, updated_at)
                VALUES (?, ?, ?, ?)
            """, (room, device, 1 if state else 0, now))
            await self._db_connection.commit()
        except Exception as e:
            await self._db_connection.execute("ROLLBACK")
            logger.error(f"Error syncing appliance to state: {e}")
            raise
    
    async def sync_state_to_appliance(self, room: str, device: str, state: bool):
        """Sync device_states to appliances table (optional, for consistency)."""
        room_obj = await self.get_room(room)
        if not room_obj:
            return
        
        room_obj_id = room_obj.get("_id")
        now = datetime.now().isoformat()
        
        try:
            await self._db_connection.execute("BEGIN TRANSACTION")
            await self._db_connection.execute("""
                UPDATE appliances 
                SET isOn = ?, state = ?, lastStateChange = ?, lastUpdated = ?
                WHERE roomId = ? AND type = ?
            """, (1 if state else 0, 1 if state else 0, now, now, room_obj_id, device))
            await self._db_connection.commit()
        except Exception as e:
            await self._db_connection.execute("ROLLBACK")
            logger.error(f"Error syncing state to appliance: {e}")
            raise
    
    async def sync_location_to_user_info(self, location: str, broadcast_callback=None):
        """Sync current location from timeline to user_info table."""
        now = datetime.now().isoformat()
        
        try:
            await self._db_connection.execute("BEGIN TRANSACTION")
            
            # Check if user_info exists
            async with self._db_connection.execute(
                "SELECT id FROM user_info LIMIT 1"
            ) as cursor:
                existing = await cursor.fetchone()
                if existing:
                    await self._db_connection.execute("""
                        UPDATE user_info 
                        SET current_location = ?, updated_at = ?
                        WHERE id = ?
                    """, (location, now, existing['id']))
                else:
                    # Create if doesn't exist
                    await self._db_connection.execute("""
                        INSERT INTO user_info (current_location, created_at, updated_at)
                        VALUES (?, ?, ?)
                    """, (location, now, now))
            
            await self._db_connection.commit()
        except Exception as e:
            await self._db_connection.execute("ROLLBACK")
            logger.error(f"Error syncing location to user_info: {e}")
            raise
        
        # Get updated user_info for broadcast
        user_info = await self.get_user_info()
        
        # Broadcast user_info_update via callback if provided
        if broadcast_callback:
            try:
                # Send nested format to match API response format
                await broadcast_callback({
                    "type": "user_info_update",
                    "data": {
                        "name": user_info.get("name", {}),  # Send nested format to match API
                        "condition": user_info.get("condition", ""),
                        "current_location": user_info.get("current_location", "")
                    },
                    "timestamp": now
                })
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to broadcast user_info_update from sync_location_to_user_info: {e}")
    
    # ==================== MCP Device State Operations ====================
    
    async def get_device_state(self, room: str, device: str) -> bool:
        """Get device state from device_states table."""
        async with self._db_connection.execute(
            "SELECT state FROM device_states WHERE room = ? AND device = ?",
            (room, device)
        ) as cursor:
            row = await cursor.fetchone()
            return bool(row['state']) if row else False
    
    async def set_device_state(self, room: str, device: str, state: bool) -> bool:
        """Set device state in device_states table."""
        now = datetime.now().isoformat()
        await self._db_connection.execute("""
            INSERT OR REPLACE INTO device_states (room, device, state, updated_at)
            VALUES (?, ?, ?, ?)
        """, (room, device, 1 if state else 0, now))
        await self._db_connection.commit()
        return True
    
    async def get_all_device_states(self) -> Dict[str, Dict[str, bool]]:
        """Get all device states organized by room."""
        async with self._db_connection.execute(
            "SELECT room, device, state FROM device_states"
        ) as cursor:
            rows = await cursor.fetchall()
            result = {}
            for row in rows:
                room = row['room']
                device = row['device']
                state = bool(row['state'])
                if room not in result:
                    result[room] = {}
                result[room][device] = state
            return result
    
    # ==================== MCP User Info Operations ====================
    
    async def get_user_info(self) -> Dict[str, Any]:
        """Get user information from user_info table."""
        async with self._db_connection.execute(
            "SELECT * FROM user_info LIMIT 1"
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return {
                    "name": {
                        "thai": row['name_thai'] or "",
                        "english": row['name_english'] or ""
                    },
                    "condition": row['condition'] or "",
                    "current_location": row['current_location'] or "Bedroom"
                }
            return {
                "name": {"thai": "", "english": ""},
                "condition": "",
                "current_location": "Bedroom"
            }
    
    async def set_user_name(self, thai: str = "", english: str = "") -> None:
        """Set user name in user_info table."""
        now = datetime.now().isoformat()
        async with self._db_connection.execute(
            "SELECT id FROM user_info LIMIT 1"
        ) as cursor:
            existing = await cursor.fetchone()
            if existing:
                await self._db_connection.execute("""
                    UPDATE user_info 
                    SET name_thai = ?, name_english = ?, updated_at = ?
                    WHERE id = ?
                """, (thai, english, now, existing['id']))
            else:
                await self._db_connection.execute("""
                    INSERT INTO user_info (name_thai, name_english, created_at, updated_at)
                    VALUES (?, ?, ?, ?)
                """, (thai, english, now, now))
        await self._db_connection.commit()
    
    async def set_user_condition(self, condition: str) -> None:
        """Set user condition in user_info table."""
        now = datetime.now().isoformat()
        async with self._db_connection.execute(
            "SELECT id FROM user_info LIMIT 1"
        ) as cursor:
            existing = await cursor.fetchone()
            if existing:
                await self._db_connection.execute("""
                    UPDATE user_info 
                    SET condition = ?, updated_at = ?
                    WHERE id = ?
                """, (condition, now, existing['id']))
            else:
                await self._db_connection.execute("""
                    INSERT INTO user_info (condition, created_at, updated_at)
                    VALUES (?, ?, ?)
                """, (condition, now, now))
        await self._db_connection.commit()
    
    async def get_current_location(self) -> str:
        """Get current location from user_info table."""
        async with self._db_connection.execute(
            "SELECT current_location FROM user_info LIMIT 1"
        ) as cursor:
            row = await cursor.fetchone()
            return row['current_location'] if row and row['current_location'] else "Bedroom"
    
    async def set_current_location(self, location: str) -> bool:
        """Set current location in user_info table."""
        return await self.sync_location_to_user_info(location)
    
    async def save_last_schedule_check_minute(self, minute_key: str) -> None:
        """Save last schedule check minute to user_info table."""
        now = datetime.now().isoformat()
        async with self._db_connection.execute(
            "SELECT id FROM user_info LIMIT 1"
        ) as cursor:
            existing = await cursor.fetchone()
            if existing:
                await self._db_connection.execute("""
                    UPDATE user_info 
                    SET last_schedule_check_minute = ?, updated_at = ?
                    WHERE id = ?
                """, (minute_key, now, existing['id']))
            else:
                await self._db_connection.execute("""
                    INSERT INTO user_info (last_schedule_check_minute, created_at, updated_at)
                    VALUES (?, ?, ?)
                """, (minute_key, now, now))
        await self._db_connection.commit()
    
    async def get_last_schedule_check_minute(self) -> Optional[str]:
        """Get last schedule check minute from user_info table."""
        async with self._db_connection.execute(
            "SELECT last_schedule_check_minute FROM user_info LIMIT 1"
        ) as cursor:
            row = await cursor.fetchone()
            return row['last_schedule_check_minute'] if row and row['last_schedule_check_minute'] else None
    
    # ==================== MCP Schedule Operations ====================
    
    async def get_schedule_items(self) -> List[Dict[str, Any]]:
        """Get all base schedule items."""
        async with self._db_connection.execute(
            "SELECT * FROM schedule_items ORDER BY time"
        ) as cursor:
            rows = await cursor.fetchall()
            result = []
            for row in rows:
                item = {
                    "time": row['time'],
                    "activity": row['activity']
                }
                if row['location']:
                    item["location"] = row['location']
                if row['action']:
                    try:
                        item["action"] = json.loads(row['action'])
                    except (json.JSONDecodeError, TypeError):
                        pass
                result.append(item)
            return result
    
    async def add_schedule_item(self, item: Dict[str, Any]) -> int:
        """Add a schedule item."""
        now = datetime.now().isoformat()
        cursor = await self._db_connection.execute("""
            INSERT INTO schedule_items (time, activity, location, action, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            item.get("time"),
            item.get("activity"),
            item.get("location"),
            json.dumps(item.get("action")) if item.get("action") else None,
            now,
            now
        ))
        await self._db_connection.commit()
        return cursor.lastrowid
    
    async def set_schedule_items(self, items: List[Dict[str, Any]]) -> None:
        """Replace all schedule items."""
        await self._db_connection.execute("DELETE FROM schedule_items")
        for item in items:
            await self.add_schedule_item(item)
    
    async def delete_schedule_item_by_time(self, time: str) -> bool:
        """Delete schedule item by time."""
        cursor = await self._db_connection.execute(
            "DELETE FROM schedule_items WHERE time = ?", (time,)
        )
        await self._db_connection.commit()
        return cursor.rowcount > 0
    
    async def get_one_time_events(self, date: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get one-time events, optionally filtered by date."""
        if date:
            query = "SELECT * FROM one_time_events WHERE date = ? ORDER BY time"
            params = (date,)
        else:
            query = "SELECT * FROM one_time_events ORDER BY date, time"
            params = ()
        
        async with self._db_connection.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            result = []
            for row in rows:
                item = {
                    "date": row['date'],
                    "time": row['time'],
                    "activity": row['activity']
                }
                if row['location']:
                    item["location"] = row['location']
                if row['action']:
                    try:
                        item["action"] = json.loads(row['action'])
                    except (json.JSONDecodeError, TypeError):
                        pass
                result.append(item)
            return result
    
    async def add_one_time_event(self, event: Dict[str, Any]) -> int:
        """Add a one-time event."""
        now = datetime.now().isoformat()
        cursor = await self._db_connection.execute("""
            INSERT INTO one_time_events (date, time, activity, location, action, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            event.get("date"),
            event.get("time"),
            event.get("activity"),
            event.get("location"),
            json.dumps(event.get("action")) if event.get("action") else None,
            now
        ))
        await self._db_connection.commit()
        return cursor.lastrowid
    
    async def delete_one_time_events(self, date: str, time: Optional[str] = None) -> int:
        """Delete one-time events."""
        if time:
            cursor = await self._db_connection.execute(
                "DELETE FROM one_time_events WHERE date = ? AND time = ?", (date, time)
            )
        else:
            cursor = await self._db_connection.execute(
                "DELETE FROM one_time_events WHERE date = ?", (date,)
            )
        await self._db_connection.commit()
        return cursor.rowcount
    
    async def delete_all_one_time_events(self) -> int:
        """Delete all one-time events."""
        cursor = await self._db_connection.execute("DELETE FROM one_time_events")
        await self._db_connection.commit()
        return cursor.rowcount
    
    async def cleanup_old_one_time_events(self, before_date: str) -> int:
        """Delete one-time events before a specific date."""
        cursor = await self._db_connection.execute(
            "DELETE FROM one_time_events WHERE date < ?", (before_date,)
        )
        await self._db_connection.commit()
        return cursor.rowcount
    
    async def get_daily_clone(self, date: str) -> Optional[List[Dict[str, Any]]]:
        """Get daily schedule clone for a specific date."""
        async with self._db_connection.execute(
            "SELECT schedule_data FROM daily_schedule_clones WHERE date = ?", (date,)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                try:
                    return json.loads(row['schedule_data'])
                except (json.JSONDecodeError, TypeError):
                    return None
            return None
    
    async def set_daily_clone(self, date: str, schedule_data: List[Dict[str, Any]]) -> None:
        """Set daily schedule clone for a specific date."""
        now = datetime.now().isoformat()
        await self._db_connection.execute("""
            INSERT OR REPLACE INTO daily_schedule_clones (date, schedule_data, created_at, updated_at)
            VALUES (?, ?, ?, ?)
        """, (date, json.dumps(schedule_data), now, now))
        await self._db_connection.commit()
    
    async def delete_daily_clone(self, date: str) -> bool:
        """Delete daily schedule clone."""
        cursor = await self._db_connection.execute(
            "DELETE FROM daily_schedule_clones WHERE date = ?", (date,)
        )
        await self._db_connection.commit()
        return cursor.rowcount > 0
    
    async def check_schedule_notifications(self, current_time_str: str, date_str: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Check if current time matches any schedule items that should trigger notifications.
        
        Args:
            current_time_str: Current time in HH:MM format (e.g., "08:00", "14:30")
            date_str: Optional date in YYYY-MM-DD format. If None, uses today.
            
        Returns:
            List of schedule items that should trigger notifications:
            [
                {
                    "time": str,
                    "activity": str,
                    "type": "schedule" or "one_time_event",
                    "action": dict (optional),
                    "location": str (optional)
                },
                ...
            ]
        """
        matching_items = []
        
        # Normalize time string
        try:
            time_parts = current_time_str.strip().split(":")
            if len(time_parts) == 2:
                hours = int(time_parts[0])
                minutes = int(time_parts[1])
                normalized_time = f"{hours:02d}:{minutes:02d}"
            else:
                return matching_items  # Invalid format
        except (ValueError, IndexError):
            return matching_items  # Invalid format
        
        # Get date (default to today)
        if not date_str:
            date_str = datetime.now().strftime("%Y-%m-%d")
        
        # Get daily clone for the date (create if doesn't exist)
        daily_clone = await self.get_daily_clone(date_str)
        if not daily_clone:
            # Create daily clone from base schedule
            base_schedule = await self.get_schedule_items()
            base_schedule_copy = [item.copy() for item in base_schedule]
            await self.set_daily_clone(date_str, base_schedule_copy)
            daily_clone = base_schedule_copy
        
        # Check daily clone schedule items
        for item in daily_clone:
            schedule_time = item.get("time", "").strip()
            try:
                sched_parts = schedule_time.split(":")
                if len(sched_parts) == 2:
                    sched_hours = int(sched_parts[0])
                    sched_minutes = int(sched_parts[1])
                    normalized_sched_time = f"{sched_hours:02d}:{sched_minutes:02d}"
                    
                    if normalized_time == normalized_sched_time:
                        matching_item = {
                            "time": schedule_time,
                            "activity": item.get("activity", ""),
                            "type": "schedule"
                        }
                        if "action" in item:
                            matching_item["action"] = item["action"]
                        if "location" in item:
                            matching_item["location"] = item["location"]
                        matching_items.append(matching_item)
            except (ValueError, IndexError):
                continue
        
        # Check one-time events for the date and time
        one_time_events = await self.get_one_time_events(date_str)
        for event in one_time_events:
            event_time = event.get("time", "").strip()
            try:
                event_parts = event_time.split(":")
                if len(event_parts) == 2:
                    event_hours = int(event_parts[0])
                    event_minutes = int(event_parts[1])
                    normalized_event_time = f"{event_hours:02d}:{event_minutes:02d}"
                    
                    if normalized_time == normalized_event_time:
                        matching_item = {
                            "time": event_time,
                            "activity": event.get("activity", ""),
                            "type": "one_time_event"
                        }
                        if "action" in event:
                            matching_item["action"] = event["action"]
                        if "location" in event:
                            matching_item["location"] = event["location"]
                        matching_items.append(matching_item)
            except (ValueError, IndexError):
                continue
        
        return matching_items
    
    # ==================== MCP Notification Operations ====================
    
    async def get_notification_preferences(self) -> List[str]:
        """Get notification preferences as list of 'room device' strings."""
        async with self._db_connection.execute(
            "SELECT room, device FROM notification_preferences WHERE do_not_notify = 1"
        ) as cursor:
            rows = await cursor.fetchall()
            return [f"{row['room']} {row['device']}" for row in rows]
    
    async def set_notification_preference(self, room: str, device: str, do_not_notify: bool) -> bool:
        """Set notification preference."""
        now = datetime.now().isoformat()
        await self._db_connection.execute("""
            INSERT OR REPLACE INTO notification_preferences (room, device, do_not_notify, created_at)
            VALUES (?, ?, ?, ?)
        """, (room, device, 1 if do_not_notify else 0, now))
        await self._db_connection.commit()
        return True
    
    async def clear_notification_preferences(self) -> None:
        """Clear all notification preferences."""
        await self._db_connection.execute("DELETE FROM notification_preferences")
        await self._db_connection.commit()
    
    async def get_do_not_remind(self) -> List[str]:
        """Get do not remind list."""
        async with self._db_connection.execute(
            "SELECT item FROM do_not_remind"
        ) as cursor:
            rows = await cursor.fetchall()
            return [row['item'] for row in rows]
    
    async def add_to_do_not_remind(self, item: str) -> None:
        """Add to do not remind list."""
        now = datetime.now().isoformat()
        await self._db_connection.execute("""
            INSERT OR IGNORE INTO do_not_remind (item, created_at)
            VALUES (?, ?)
        """, (item, now))
        await self._db_connection.commit()
    
    async def remove_from_do_not_remind(self, item: str) -> bool:
        """Remove from do not remind list."""
        cursor = await self._db_connection.execute(
            "DELETE FROM do_not_remind WHERE item = ?", (item,)
        )
        await self._db_connection.commit()
        return cursor.rowcount > 0
    
    async def clear_do_not_remind(self) -> None:
        """Clear do not remind list."""
        await self._db_connection.execute("DELETE FROM do_not_remind")
        await self._db_connection.commit()
    
    # ==================== MCP Chat History Operations ====================
    
    async def save_chat_message(self, message: Dict[str, Any]) -> int:
        """Save chat message to database."""
        now = datetime.now().isoformat()
        tool_result = message.get("tool_result") or message.get("tool_results")
        session_id = message.get("session_id")
        cursor = await self._db_connection.execute("""
            INSERT INTO chat_history (role, content, content_full, is_notification, is_preference_update, tool_result, session_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            message.get("role"),
            message.get("content", ""),
            message.get("content_full"),
            1 if message.get("is_notification", False) else 0,
            1 if message.get("is_preference_update", False) else 0,
            json.dumps(tool_result) if tool_result else None,
            session_id,
            now
        ))
        await self._db_connection.commit()
        return cursor.lastrowid
    
    async def get_recent_chat_history(self, limit: int = 50, session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get recent chat history, optionally filtered by session_id."""
        if session_id:
            query = "SELECT * FROM chat_history WHERE session_id = ? ORDER BY created_at DESC LIMIT ?"
            params = (session_id, limit)
        else:
            query = "SELECT * FROM chat_history ORDER BY created_at DESC LIMIT ?"
            params = (limit,)
        
        async with self._db_connection.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            result = []
            for row in reversed(rows):  # Chronological order
                item = {
                    "id": row.get('id'),  # Include database ID
                    "role": row['role'],
                    "content": row['content'],
                    "is_notification": bool(row['is_notification']),
                    "is_preference_update": bool(row['is_preference_update'])
                }
                if row.get('session_id'):
                    item["session_id"] = row['session_id']
                if row.get('content_full'):
                    item["content_full"] = row['content_full']
                if row.get('tool_result'):
                    try:
                        item["tool_result"] = json.loads(row['tool_result'])
                    except (json.JSONDecodeError, TypeError):
                        pass
                result.append(item)
            return result
    
    async def clear_chat_history_for_session(self, session_id: str) -> int:
        """Clear chat history for a specific session."""
        cursor = await self._db_connection.execute(
            "DELETE FROM chat_history WHERE session_id = ?", (session_id,)
        )
        await self._db_connection.commit()
        return cursor.rowcount
    
    async def clear_chat_history(self) -> int:
        """Clear all chat history."""
        cursor = await self._db_connection.execute("DELETE FROM chat_history")
        await self._db_connection.commit()
        return cursor.rowcount
    
    async def get_chat_history_count(self) -> int:
        """Get total count of messages in chat_history."""
        async with self._db_connection.execute(
            "SELECT COUNT(*) as count FROM chat_history"
        ) as cursor:
            row = await cursor.fetchone()
            return row['count'] if row else 0
    
    async def get_turn_count(self) -> int:
        """
        Get current turn count.
        Phase 4C: Uses message count as proxy for turn count.
        Each user message + assistant response = 1 turn.
        """
        # For Phase 4C, we'll use message count / 2 as turn count
        # (assuming roughly equal user/assistant messages)
        count = await self.get_chat_history_count()
        # More accurate: count user messages only
        async with self._db_connection.execute(
            "SELECT COUNT(*) as count FROM chat_history WHERE role = 'user'"
        ) as cursor:
            row = await cursor.fetchone()
            return row['count'] if row else 0
    
    # ==================== MCP Conversation Summary Operations ====================
    
    async def get_conversation_summary(self) -> Optional[Dict[str, Any]]:
        """Get latest conversation summary."""
        async with self._db_connection.execute(
            "SELECT * FROM conversation_summaries ORDER BY updated_at DESC LIMIT 1"
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                key_events = []
                if row['key_events']:
                    try:
                        key_events = json.loads(row['key_events'])
                    except (json.JSONDecodeError, TypeError):
                        pass
                return {
                    "last_summarized_turn": row['last_summarized_turn'],
                    "summary_text": row['summary_text'],
                    "key_events": key_events
                }
            return None
    
    async def save_conversation_summary(self, summary: Dict[str, Any]) -> None:
        """Save conversation summary."""
        now = datetime.now().isoformat()
        key_events_json = json.dumps(summary.get("key_events", [])) if summary.get("key_events") else None
        
        async with self._db_connection.execute(
            "SELECT id FROM conversation_summaries ORDER BY updated_at DESC LIMIT 1"
        ) as cursor:
            existing = await cursor.fetchone()
            if existing:
                await self._db_connection.execute("""
                    UPDATE conversation_summaries 
                    SET summary_text = ?, key_events = ?, last_summarized_turn = ?, updated_at = ?
                    WHERE id = ?
                """, (
                    summary.get("summary_text", ""),
                    key_events_json,
                    summary.get("last_summarized_turn", 0),
                    now,
                    existing['id']
                ))
            else:
                await self._db_connection.execute("""
                    INSERT INTO conversation_summaries (summary_text, key_events, last_summarized_turn, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    summary.get("summary_text", ""),
                    key_events_json,
                    summary.get("last_summarized_turn", 0),
                    now,
                    now
                ))
        await self._db_connection.commit()
    
    # ==================== Schedule Reset Operations ====================
    
    async def reset_daily_schedule(self) -> Dict[str, Any]:
        """Reset daily schedule to base schedule and clear all one-time events."""
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Clear all one-time events
        deleted_count = await self.delete_all_one_time_events()
        
        # Delete existing clone for today
        await self.delete_daily_clone(today)
        
        # Create fresh clone from base schedule
        base_schedule = await self.get_schedule_items()
        base_schedule_copy = [item.copy() for item in base_schedule]
        await self.set_daily_clone(today, base_schedule_copy)
        
        return {
            "one_time_events_cleared": deleted_count,
            "clone_reset": True,
            "date": today
        }
    
    # ==================== MongoDB Compatibility Layer ====================
    
    @property
    def db(self):
        """Expose MongoDB-compatible interface via db.db.{collection}."""
        if not self._compat_layer:
            raise RuntimeError("Database not connected. Call connect() first.")
        return self._compat_layer
