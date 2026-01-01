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


class Database:
    """SQLite database service."""
    
    def __init__(self, db_path: str = "data/wheelsense.db"):
        self._db_connection_path = db_path
        self._db_connection: Optional[aiosqlite.Connection] = None
        self.is_connected = False
        self._compat_layer = None  # MongoDB compatibility layer
        self._db_connection = None  # Will be set to compatibility layer after connect()
    
    async def connect(self):
        """Connect to SQLite database."""
        try:
            # Ensure data directory exists
            Path(self._db_connection_path).parent.mkdir(parents=True, exist_ok=True)
            
            self._db_connection = await aiosqlite.connect(self._db_connection_path)
            self._db_connection.row_factory = aiosqlite.Row
            
            # Enable foreign keys
            await self._db_connection.execute("PRAGMA foreign_keys = ON")
            
            # Create tables
            await self._create_tables()
            
            # Initialize MongoDB compatibility layer
            self._compat_layer = MongoDBCompatibilityLayer(self._db_connection, self)
            
            self.is_connected = True
            logger.info(f"Connected to SQLite database at {self._db_connection_path}")
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
        
        # Rooms table
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
                lastSeen TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)
        
        # Activity Logs table
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
        def normalize(name: str) -> str:
            return name.lower().replace(" ", "") if name else ""
        
        normalized_room_id = normalize(room_id)
        
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
            
            if (normalize(room_type) == normalized_room_id or
                normalize(name_en) == normalized_room_id or
                normalize(name) == normalized_room_id):
                return r
        
        return None
    
    async def update_room_status(self, device_id: str, status: Dict):
        """Update room status from device."""
        await self._db_connection.execute(
            """UPDATE rooms 
               SET isOccupied = ?, lastDetection = ?, lastStatus = ?
               WHERE deviceId = ?""",
            (
                1 if status.get("user_detected", False) else 0,
                datetime.now().isoformat() if status.get("user_detected") else None,
                json.dumps(status),
                device_id
            )
        )
        await self._db_connection.commit()
    
    async def update_device_status(self, device_id: str, status: Dict):
        """Update or create device status."""
        now = datetime.now().isoformat()
        
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
                    json.dumps(status),
                    now,
                    status.get("device_type"),
                    status.get("room"),
                    status.get("ip"),
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
                    status.get("device_type"),
                    status.get("room"),
                    status.get("ip"),
                    json.dumps(status),
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
