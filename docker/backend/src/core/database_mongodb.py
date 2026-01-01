"""
WheelSense Backend - Database Service
MongoDB connection and operations
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)


class Database:
    """MongoDB database service."""
    
    def __init__(self, uri: str):
        self.uri = uri
        self.client: Optional[AsyncIOMotorClient] = None
        self.db = None
        self.is_connected = False
    
    async def connect(self):
        """Connect to MongoDB."""
        try:
            self.client = AsyncIOMotorClient(self.uri)
            self.db = self.client.wheelsense
            # Test connection
            await self.client.admin.command('ping')
            self.is_connected = True
            logger.info("Connected to MongoDB")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from MongoDB."""
        if self.client:
            self.client.close()
            self.is_connected = False
            logger.info("Disconnected from MongoDB")
    
    # ==================== Room Operations ====================
    
    async def get_all_rooms(self) -> List[Dict]:
        """Get all rooms."""
        rooms = await self.db.rooms.find().to_list(length=100)
        return [self._serialize_doc(room) for room in rooms]
    
    async def get_room(self, room_id: str) -> Optional[Dict]:
        """Get room by ID or device ID or roomType (with normalization)."""
        # Normalize room_id: lowercase and remove spaces (e.g., "livingroom" matches "Living Room")
        def normalize(name: str) -> str:
            return name.lower().replace(" ", "") if name else ""
        
        normalized_room_id = normalize(room_id)
        
        # Try exact match first
        room = await self.db.rooms.find_one({
            "$or": [
                {"_id": ObjectId(room_id) if ObjectId.is_valid(room_id) else None},
                {"deviceId": room_id},
                {"roomType": room_id}
            ]
        })
        
        if room:
            return self._serialize_doc(room)
        
        # If not found, try case-insensitive match with normalization
        # This helps match "livingroom" with "Living Room" or "living room"
        all_rooms = await self.db.rooms.find().to_list(length=100)
        for r in all_rooms:
            room_type = r.get("roomType", "")
            name_en = r.get("nameEn", "")
            name = r.get("name", "")
            
            if (normalize(room_type) == normalized_room_id or
                normalize(name_en) == normalized_room_id or
                normalize(name) == normalized_room_id):
                return self._serialize_doc(r)
        
        return None
    

    async def update_room_status(self, device_id: str, status: Dict):
        """Update room status from device."""
        await self.db.rooms.update_one(
            {"deviceId": device_id},
            {
                "$set": {
                    "isOccupied": status.get("user_detected", False),
                    "lastDetection": datetime.now() if status.get("user_detected") else None,
                    "lastStatus": status
                }
            }
        )

    async def update_device_status(self, device_id: str, status: Dict):
        """Update or create device status."""
        
        # Prepare fields to update
        update_fields = {
            "lastSeen": datetime.now(),
            "status": status,
            "updatedAt": datetime.now()
        }
        
        # If static info is present, update it too
        if "device_type" in status:
            update_fields["type"] = status["device_type"]
        if "room" in status:
            update_fields["room"] = status["room"]
        if "ip" in status:
            update_fields["ip"] = status["ip"]
            
        # Try to find by deviceId first
        await self.db.devices.update_one(
            {"deviceId": device_id},
            {
                "$set": update_fields,
                "$setOnInsert": {
                     "createdAt": datetime.now(),
                     "name": device_id,
                     "id": f"D{int(datetime.now().timestamp())}"
                }
            },
            upsert=True
        )
    
    # ==================== Appliance Operations ====================
    
    async def get_room_appliances(self, room_id: str) -> List[Dict]:
        """Get all appliances in a room."""
        room = await self.get_room(room_id)
        if not room:
            return []
        
        appliances = await self.db.appliances.find({
            "roomId": ObjectId(room["_id"]) if "_id" in room else None
        }).to_list(length=100)
        
        return [self._serialize_doc(a) for a in appliances]
    
    async def update_appliance_state(
        self, room_id: str, appliance_type: str, state: bool
    ):
        """Update appliance state."""
        room = await self.get_room(room_id)
        if not room:
            return
        
        await self.db.appliances.update_one(
            {
                "roomId": ObjectId(room["_id"]),
                "type": appliance_type
            },
            {
                "$set": {
                    "isOn": state,
                    "lastStateChange": datetime.now()
                }
            }
        )
    
    # ==================== Activity Logging ====================
    
    async def log_activity(
        self,
        room_id: str,
        event_type: str,
        details: Optional[Dict] = None,
        user_id: Optional[str] = None
    ):
        """Log an activity event."""
        room = await self.get_room(room_id)
        
        # Convert roomId to ObjectId if we have the room object
        room_object_id = None
        if room and "_id" in room:
            try:
                room_object_id = ObjectId(room["_id"]) if isinstance(room["_id"], str) else room["_id"]
            except:
                room_object_id = ObjectId()  # Generate new ObjectId as fallback
        else:
            room_object_id = ObjectId()  # Generate new ObjectId for unknown room
        
        # Convert userId to ObjectId - use a fixed "SYSTEM" ObjectId for system actions
        if user_id and ObjectId.is_valid(user_id):
            user_object_id = ObjectId(user_id)
        elif user_id:
            # Try to find user by string ID
            user = await self.db.patients.find_one({"id": user_id})
            if user and "_id" in user:
                user_object_id = user["_id"]
            else:
                # Use a fixed ObjectId for SYSTEM (24-char hex: 000000000000000053595354)
                user_object_id = ObjectId("000000000000000053595354")
        else:
            # Use a fixed ObjectId for SYSTEM
            user_object_id = ObjectId("000000000000000053595354")
        
        activity = {
            "roomId": room_object_id,
            "eventType": event_type,
            "timestamp": datetime.now(),
            "details": details or {},
            "userId": user_object_id
        }
        
        await self.db.activityLogs.insert_one(activity)
    
    async def get_activity_logs(
        self,
        room_id: Optional[str] = None,
        event_types: Optional[List[str]] = None,
        limit: int = 50
    ) -> List[Dict]:
        """Get activity logs with optional filters."""
        query = {}
        
        if room_id:
            room = await self.get_room(room_id)
            if room:
                query["roomId"] = ObjectId(room["_id"])
        
        if event_types:
            query["eventType"] = {"$in": event_types}
        
        logs = await self.db.activityLogs.find(query).sort(
            "timestamp", -1
        ).limit(limit).to_list(length=limit)
        
        return [self._serialize_doc(log) for log in logs]
    
    async def get_user_activities(
        self, user_id: str, date: Optional[str] = None
    ) -> List[Dict]:
        """Get activities for a specific user."""
        query = {"userId": ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id}
        
        if date:
            start = datetime.fromisoformat(date)
            end = datetime(start.year, start.month, start.day, 23, 59, 59)
            query["timestamp"] = {"$gte": start, "$lte": end}
        
        activities = await self.db.activityLogs.find(query).sort(
            "timestamp", -1
        ).to_list(length=1000)
        
        return [self._serialize_doc(a) for a in activities]
    
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
        room = await self.get_room(room_id)
        
        event = {
            "roomId": ObjectId(room["_id"]) if room else None,
            "eventType": event_type,
            "severity": severity,
            "message": message,
            "timestamp": datetime.now(),
            "resolved": False,
            "notifiedContacts": []
        }
        
        if user_id:
            event["userId"] = ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id
        
        result = await self.db.emergencyEvents.insert_one(event)
        event["_id"] = result.inserted_id
        
        return self._serialize_doc(event)
    
    async def get_active_emergencies(self) -> List[Dict]:
        """Get all unresolved emergency events."""
        events = await self.db.emergencyEvents.find({
            "resolved": False
        }).sort("timestamp", -1).to_list(length=100)
        
        return [self._serialize_doc(e) for e in events]
    
    async def resolve_emergency(self, event_id: str) -> bool:
        """Resolve an emergency event."""
        result = await self.db.emergencyEvents.update_one(
            {"_id": ObjectId(event_id)},
            {
                "$set": {
                    "resolved": True,
                    "resolvedAt": datetime.now()
                }
            }
        )
        return result.modified_count > 0
    
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
        await self.db.behaviorAnalysis.update_one(
            {
                "userId": ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id,
                "date": datetime.fromisoformat(date)
            },
            {
                "$set": {
                    "patterns": patterns,
                    "anomalies": anomalies,
                    "geminiAnalysis": gemini_analysis,
                    "updatedAt": datetime.now()
                }
            },
            upsert=True
        )
    
    async def get_latest_behavior_analysis(self, user_id: str) -> Optional[Dict]:
        """Get the latest behavior analysis for a user."""
        analysis = await self.db.behaviorAnalysis.find_one(
            {"userId": ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id},
            sort=[("date", -1)]
        )
        return self._serialize_doc(analysis) if analysis else None
    
    # ==================== Map Configuration Operations ====================
    
    async def save_map_config(self, config: Dict):
        """Save map configuration (buildings, floors, rooms, wheelchair positions)."""
        await self.db.mapConfig.update_one(
            {"_id": "main"},
            {
                "$set": {
                    **config,
                    "updatedAt": datetime.now()
                }
            },
            upsert=True
        )
    
    async def get_map_config(self) -> Optional[Dict]:
        """Get map configuration."""
        config = await self.db.mapConfig.find_one({"_id": "main"})
        return self._serialize_doc(config) if config else None
    
    async def save_wheelchair_positions(self, positions: Dict):
        """Save wheelchair positions."""
        await self.db.mapConfig.update_one(
            {"_id": "main"},
            {
                "$set": {
                    "wheelchairPositions": positions,
                    "updatedAt": datetime.now()
                }
            },
            upsert=True
        )
    
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
        event = {
            "type": "location_change",
            "userId": user_id,
            "userName": user_name or user_id,
            "wheelchairId": wheelchair_id,
            "fromRoom": from_room,
            "toRoom": to_room,
            "timestamp": datetime.now(),
            "metadata": {
                "detectionConfidence": detection_confidence,
                "bbox": bbox
            }
        }
        
        # Calculate duration in previous room if we have history
        if from_room:
            last_event = await self.db.timeline.find_one(
                {"userId": user_id, "toRoom": from_room},
                sort=[("timestamp", -1)]
            )
            if last_event:
                duration = (datetime.now() - last_event["timestamp"]).total_seconds()
                event["durationInPreviousRoom"] = int(duration)
        
        result = await self.db.timeline.insert_one(event)
        event["_id"] = result.inserted_id
        
        logger.info(f"Saved location event: {user_name or user_id} moved from {from_room} to {to_room}")
        
        return self._serialize_doc(event)
    
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
        query = {}
        
        if user_id:
            query["userId"] = user_id
        
        if room_id:
            query["$or"] = [{"fromRoom": room_id}, {"toRoom": room_id}]
        
        if event_type:
            query["type"] = event_type
        
        if start_date or end_date:
            query["timestamp"] = {}
            if start_date:
                query["timestamp"]["$gte"] = start_date
            if end_date:
                query["timestamp"]["$lte"] = end_date
        
        events = await self.db.timeline.find(query).sort(
            "timestamp", -1
        ).limit(limit).to_list(length=limit)
        
        return [self._serialize_doc(e) for e in events]
    
    async def get_timeline_by_date(self, date_str: str, user_id: Optional[str] = None) -> List[Dict]:
        """Get all timeline events for a specific date."""
        try:
            date = datetime.fromisoformat(date_str)
        except ValueError:
            # Try parsing as YYYY-MM-DD
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
        for i, event in enumerate(events):
            to_room = event.get("toRoom")
            duration = event.get("durationInPreviousRoom", 0)
            from_room = event.get("fromRoom")
            
            if from_room and duration > 0:
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
        user = await self.db.users.find_one({
            "$or": [
                {"_id": ObjectId(user_id) if ObjectId.is_valid(user_id) else None},
                {"email": user_id}
            ]
        })
        return self._serialize_doc(user) if user else None
    
    async def update_user_preferences(self, user_id: str, preferences: Dict) -> bool:
        """Update user preferences."""
        result = await self.db.users.update_one(
            {"_id": ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id},
            {
                "$set": {
                    "preferences": preferences,
                    "updatedAt": datetime.now()
                }
            }
        )
        return result.modified_count > 0
    
    # ==================== Helpers ====================
    
    @staticmethod
    def _serialize_doc(doc: Optional[Dict]) -> Optional[Dict]:
        """Convert MongoDB document to JSON-serializable dict."""
        if not doc:
            return None
        
        result = {}
        for key, value in doc.items():
            if isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
            else:
                result[key] = value
        
        # Normalize names: if nameEn exists and is different from name, prefer nameEn
        # This ensures English names are always used when available
        if isinstance(result, dict):
            # For rooms, buildings, patients, and other entities with nameEn field
            if 'nameEn' in result and result.get('nameEn'):
                # If nameEn exists and is not empty, use it as the primary name
                if result.get('name') != result.get('nameEn'):
                    result['name'] = result['nameEn']
            
            # Normalize building names (if name contains Thai, prefer nameEn)
            if 'name' in result and result.get('name') and any('\u0E00' <= char <= '\u0E7F' for char in result['name']):
                if result.get('nameEn'):
                    result['name'] = result['nameEn']
            
            # Normalize floor names (convert Thai floor names)
            if 'name' in result and result.get('name'):
                floor_map = {
                    'ชั้น 1': 'Floor 1',
                    'ชั้น 2': 'Floor 2',
                    'ชั้น 3': 'Floor 3'
                }
                if result['name'] in floor_map:
                    result['name'] = floor_map[result['name']]
            
            # Normalize patient condition values
            if 'condition' in result:
                condition_map = {
                    'ปกติ': 'Normal',
                    'ต้องระวัง': 'Caution',
                    'ฉุกเฉิน': 'Emergency'
                }
                if result['condition'] in condition_map:
                    result['condition'] = condition_map[result['condition']]
        
        return result

