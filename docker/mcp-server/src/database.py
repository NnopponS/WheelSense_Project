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
        """Get room by ID or device ID."""
        room = await self.db.rooms.find_one({
            "$or": [
                {"_id": ObjectId(room_id) if ObjectId.is_valid(room_id) else None},
                {"deviceId": room_id},
                {"roomType": room_id}
            ]
        })
        return self._serialize_doc(room) if room else None
    
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
        
        activity = {
            "roomId": ObjectId(room["_id"]) if room else None,
            "eventType": event_type,
            "timestamp": datetime.now(),
            "details": details or {}
        }
        
        if user_id:
            activity["userId"] = ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id
        
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

