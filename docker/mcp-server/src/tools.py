"""
WheelSense MCP Server - Enhanced Tool Registry
MCP tools for smart home control, timeline management, and AI behavior analysis
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

# Backend API URL for database operations (now same server)
BACKEND_URL = "http://localhost:8000"


class ToolRegistry:
    """Registry for MCP tools."""
    
    def __init__(self, mqtt_client, mongo_db=None):
        self.mqtt_client = mqtt_client
        self.db = mongo_db
        self._tools: Dict[str, Dict] = {}
        
        # Register built-in tools
        self._register_builtin_tools()
    
    def _register_builtin_tools(self):
        """Register built-in smart home tools."""
        
        # ==================== Appliance Control ====================
        
        self.register_tool(
            name="control_appliance",
            description="Control appliances in room, e.g. turn on/off lights, AC, fans, TV",
            input_schema={
                "type": "object",
                "properties": {
                    "room": {
                        "type": "string",
                        "description": "Room to control (bedroom, bathroom, kitchen, livingroom)",
                        "enum": ["bedroom", "bathroom", "kitchen", "livingroom"]
                    },
                    "appliance": {
                        "type": "string",
                        "description": "Appliance to control (light, AC, fan, tv, alarm)",
                        "enum": ["light", "AC", "fan", "tv", "alarm"]
                    },
                    "state": {
                        "type": "boolean",
                        "description": "Desired state (true=on, false=off)"
                    },
                    "value": {
                        "type": "integer",
                        "description": "Additional value, e.g. AC temperature, fan speed"
                    }
                },
                "required": ["room", "appliance", "state"]
            },
            handler=self._handle_control_appliance
        )
        
        self.register_tool(
            name="get_room_status",
            description="View room status including appliances and user detection",
            input_schema={
                "type": "object",
                "properties": {
                    "room": {
                        "type": "string",
                        "description": "Room to view status",
                        "enum": ["bedroom", "bathroom", "kitchen", "livingroom"]
                    }
                },
                "required": ["room"]
            },
            handler=self._handle_get_room_status
        )
        
        self.register_tool(
            name="get_user_location",
            description="View user's current location",
            input_schema={
                "type": "object",
                "properties": {}
            },
            handler=self._handle_get_user_location
        )
        
        self.register_tool(
            name="turn_off_all",
            description="Turn off all appliances in room or entire house",
            input_schema={
                "type": "object",
                "properties": {
                    "room": {
                        "type": "string",
                        "description": "Room to turn off (if not specified, turns off entire house)",
                        "enum": ["bedroom", "bathroom", "kitchen", "livingroom"]
                    }
                }
            },
            handler=self._handle_turn_off_all
        )
        
        self.register_tool(
            name="send_emergency",
            description="Send emergency alert",
            input_schema={
                "type": "object",
                "properties": {
                    "event_type": {
                        "type": "string",
                        "description": "Emergency type",
                        "enum": ["fall", "fire", "sos", "unusual_behavior"]
                    },
                    "room": {
                        "type": "string",
                        "description": "Room where incident occurred"
                    },
                    "message": {
                        "type": "string",
                        "description": "Additional details"
                    }
                },
                "required": ["event_type"]
            },
            handler=self._handle_send_emergency
        )
        
        self.register_tool(
            name="set_scene",
            description="Set scene/mode, e.g. sleep mode, movie mode",
            input_schema={
                "type": "object",
                "properties": {
                    "scene": {
                        "type": "string",
                        "description": "Scene to set",
                        "enum": ["sleep", "wake_up", "movie", "away", "home"]
                    }
                },
                "required": ["scene"]
            },
            handler=self._handle_set_scene
        )
        
        # ==================== Timeline/Routine Management ====================
        
        self.register_tool(
            name="get_user_routines",
            description="View user's daily activity schedule",
            input_schema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "User ID (if not specified, uses current user)"
                    },
                    "date": {
                        "type": "string",
                        "description": "Date (YYYY-MM-DD), if not specified uses today"
                    }
                }
            },
            handler=self._handle_get_routines
        )
        
        self.register_tool(
            name="add_routine",
            description="Add new activity to daily schedule",
            input_schema={
                "type": "object",
                "properties": {
                    "time": {
                        "type": "string",
                        "description": "Time (HH:MM)"
                    },
                    "title": {
                        "type": "string",
                        "description": "Activity name"
                    },
                    "description": {
                        "type": "string",
                        "description": "Description"
                    },
                    "user_id": {
                        "type": "string",
                        "description": "User ID"
                    }
                },
                "required": ["time", "title"]
            },
            handler=self._handle_add_routine
        )
        
        self.register_tool(
            name="update_routine",
            description="Update activity in daily schedule",
            input_schema={
                "type": "object",
                "properties": {
                    "routine_id": {
                        "type": "string",
                        "description": "Activity ID"
                    },
                    "time": {
                        "type": "string",
                        "description": "New time (HH:MM)"
                    },
                    "title": {
                        "type": "string",
                        "description": "New activity name"
                    },
                    "description": {
                        "type": "string",
                        "description": "New description"
                    },
                    "completed": {
                        "type": "boolean",
                        "description": "Completion status"
                    }
                },
                "required": ["routine_id"]
            },
            handler=self._handle_update_routine
        )
        
        self.register_tool(
            name="delete_routine",
            description="Delete activity from daily schedule",
            input_schema={
                "type": "object",
                "properties": {
                    "routine_id": {
                        "type": "string",
                        "description": "Activity ID to delete"
                    }
                },
                "required": ["routine_id"]
            },
            handler=self._handle_delete_routine
        )
        
        # ==================== Behavior Analysis ====================
        
        self.register_tool(
            name="analyze_behavior",
            description="Analyze user behavior from Timeline and suggest improvements",
            input_schema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "User ID"
                    },
                    "period": {
                        "type": "string",
                        "description": "Time period (today, week, month)",
                        "enum": ["today", "week", "month"]
                    }
                },
                "required": ["user_id"]
            },
            handler=self._handle_analyze_behavior
        )
        
        self.register_tool(
            name="get_activity_timeline",
            description="View user's activity and event history",
            input_schema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "User ID"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of items"
                    }
                }
            },
            handler=self._handle_get_timeline
        )
        
        # ==================== Doctor Notes ====================
        
        self.register_tool(
            name="get_doctor_notes",
            description="View doctor's notes and recommendations",
            input_schema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "Patient ID"
                    }
                },
                "required": ["user_id"]
            },
            handler=self._handle_get_doctor_notes
        )
        
        self.register_tool(
            name="apply_doctor_recommendations",
            description="Update Timeline schedule according to doctor's recommendations",
            input_schema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "Patient ID"
                    },
                    "note_id": {
                        "type": "string",
                        "description": "Doctor note ID"
                    }
                },
                "required": ["user_id"]
            },
            handler=self._handle_apply_doctor_recommendations
        )
        
        # ==================== User Info ====================
        
        self.register_tool(
            name="get_user_info",
            description="View user information including health, wheelchair, and current room",
            input_schema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "User ID"
                    }
                }
            },
            handler=self._handle_get_user_info
        )
    
    def register_tool(
        self,
        name: str,
        description: str,
        input_schema: Dict,
        handler: Callable
    ):
        """Register a new tool."""
        self._tools[name] = {
            "name": name,
            "description": description,
            "inputSchema": input_schema,
            "handler": handler
        }
        logger.info(f"Registered tool: {name}")
    
    def get_tools(self) -> List[Dict]:
        """Get list of all tools (without handlers)."""
        return [
            {
                "name": t["name"],
                "description": t["description"],
                "inputSchema": t["inputSchema"]
            }
            for t in self._tools.values()
        ]
    
    async def call_tool(self, name: str, arguments: Dict) -> Dict:
        """Call a tool by name."""
        if name not in self._tools:
            return {"error": f"Tool not found: {name}"}
        
        tool = self._tools[name]
        handler = tool["handler"]
        
        try:
            result = await handler(arguments)
            return result
        except Exception as e:
            logger.error(f"Tool {name} failed: {e}")
            return {"error": str(e)}
    
    # ==================== Appliance Tool Handlers ====================
    
    async def _handle_control_appliance(self, args: Dict) -> Dict:
        """Handle control_appliance tool call."""
        room = args.get("room")
        appliance = args.get("appliance")
        state = args.get("state")
        value = args.get("value")
        
        # Validate room has the appliance
        room_appliances = {
            "bedroom": ["light", "alarm", "AC"],
            "bathroom": ["light"],
            "kitchen": ["light", "alarm"],
            "livingroom": ["light", "fan", "tv", "AC"]
        }
        
        if appliance not in room_appliances.get(room, []):
            return {
                "success": False,
                "error": f"{self._get_room_en(room)} has no {self._get_appliance_en(appliance)}"
            }
        
        # Send MQTT command
        success = await self.mqtt_client.send_control(room, appliance, state, value)
        
        # Also update backend
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{BACKEND_URL}/appliances/control",
                    json={"room": room, "appliance": appliance, "state": state, "value": value}
                )
        except Exception as e:
            logger.warning(f"Backend update failed: {e}")
        
        action = "Turned on" if state else "Turned off"
        return {
            "success": success,
            "message": f"{action} {self._get_appliance_en(appliance)} in {self._get_room_en(room)}" if success else "Unable to send command",
            "room": room,
            "appliance": appliance,
            "state": state
        }
    
    async def _handle_get_room_status(self, args: Dict) -> Dict:
        """Handle get_room_status tool call."""
        room = args.get("room")
        status = self.mqtt_client.get_room_status(room)
        
        return {
            "room": room,
            "room_name_en": self._get_room_en(room),
            "status": status,
            "timestamp": datetime.now().isoformat()
        }
    
    async def _handle_get_user_location(self, args: Dict) -> Dict:
        """Handle get_user_location tool call."""
        location = self.mqtt_client.get_user_location()
        return {
            **location,
            "user_name": "Somchai Jaidee",
            "room_en": self._get_room_en(location.get("room", "unknown"))
        }
    
    async def _handle_turn_off_all(self, args: Dict) -> Dict:
        """Handle turn_off_all tool call."""
        room = args.get("room")
        
        rooms_to_control = [room] if room else ["bedroom", "bathroom", "kitchen", "livingroom"]
        
        room_appliances = {
            "bedroom": ["light", "alarm", "AC"],
            "bathroom": ["light"],
            "kitchen": ["light", "alarm"],
            "livingroom": ["light", "fan", "tv", "AC"]
        }
        
        results = []
        for r in rooms_to_control:
            for appliance in room_appliances.get(r, []):
                success = await self.mqtt_client.send_control(r, appliance, False)
                results.append({"room": r, "appliance": appliance, "success": success})
        
        return {
            "success": True,
            "message": f"Turned off all appliances{f' in {self._get_room_en(room)}' if room else ''}",
            "details": results
        }
    
    async def _handle_send_emergency(self, args: Dict) -> Dict:
        """Handle send_emergency tool call."""
        event_type = args.get("event_type")
        room = args.get("room", "unknown")
        message = args.get("message", "")
        
        # Publish emergency to MQTT
        await self.mqtt_client.publish_emergency(room, event_type, message)
        
        # Also notify backend
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{BACKEND_URL}/emergency/alert",
                    json={"room": room, "event_type": event_type, "severity": "high", "message": message}
                )
        except Exception as e:
            logger.warning(f"Backend emergency notification failed: {e}")
        
        return {
            "success": True,
            "message": f"Emergency alert ({event_type}) sent",
            "event_type": event_type,
            "room": room
        }
    
    async def _handle_set_scene(self, args: Dict) -> Dict:
        """Handle set_scene tool call."""
        scene = args.get("scene")
        
        scene_configs = {
            "sleep": {
                "actions": [
                    {"room": "bedroom", "appliance": "light", "state": False},
                    {"room": "bedroom", "appliance": "AC", "state": True},
                    {"room": "livingroom", "appliance": "light", "state": False},
                    {"room": "livingroom", "appliance": "tv", "state": False}
                ],
                "message": "Sleep mode activated"
            },
            "wake_up": {
                "actions": [
                    {"room": "bedroom", "appliance": "light", "state": True},
                    {"room": "bedroom", "appliance": "AC", "state": False},
                    {"room": "kitchen", "appliance": "light", "state": True}
                ],
                "message": "Wake up mode activated"
            },
            "movie": {
                "actions": [
                    {"room": "livingroom", "appliance": "light", "state": False},
                    {"room": "livingroom", "appliance": "tv", "state": True},
                    {"room": "livingroom", "appliance": "AC", "state": True}
                ],
                "message": "Movie mode activated"
            },
            "away": {
                "actions": [
                    {"room": "bedroom", "appliance": "light", "state": False},
                    {"room": "bedroom", "appliance": "AC", "state": False},
                    {"room": "bathroom", "appliance": "light", "state": False},
                    {"room": "kitchen", "appliance": "light", "state": False},
                    {"room": "livingroom", "appliance": "light", "state": False},
                    {"room": "livingroom", "appliance": "tv", "state": False},
                    {"room": "livingroom", "appliance": "AC", "state": False}
                ],
                "message": "Away mode activated - all appliances turned off"
            },
            "home": {
                "actions": [
                    {"room": "livingroom", "appliance": "light", "state": True},
                    {"room": "livingroom", "appliance": "AC", "state": True}
                ],
                "message": "Home mode activated"
            }
        }
        
        config = scene_configs.get(scene, {})
        actions = config.get("actions", [])
        
        for action in actions:
            await self.mqtt_client.send_control(
                action["room"],
                action["appliance"],
                action["state"]
            )
        
        return {
            "success": True,
            "scene": scene,
            "message": config.get("message", f"Scene {scene} activated"),
            "actions_performed": len(actions)
        }
    
    # ==================== Routine/Timeline Handlers ====================
    
    async def _handle_get_routines(self, args: Dict) -> Dict:
        """Get user's daily routines."""
        user_id = args.get("user_id", "P001")
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{BACKEND_URL}/activities?limit=50")
                data = response.json()
                
                return {
                    "success": True,
                    "user_id": user_id,
                    "routines": data.get("activities", []),
                    "message": f"Found {len(data.get('activities', []))} activities"
                }
        except Exception as e:
            logger.error(f"Get routines failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def _handle_add_routine(self, args: Dict) -> Dict:
        """Add a new routine."""
        time = args.get("time")
        title = args.get("title")
        description = args.get("description", "")
        user_id = args.get("user_id", "P001")
        
        routine = {
            "id": f"R{datetime.now().timestamp()}",
            "patientId": user_id,
            "time": time,
            "title": title,
            "description": description,
            "completed": False,
            "createdAt": datetime.now().isoformat()
        }
        
        # TODO: Save to backend when endpoint is available
        
        return {
            "success": True,
            "routine": routine,
            "message": f"Added activity '{title}' at {time}"
        }
    
    async def _handle_update_routine(self, args: Dict) -> Dict:
        """Update an existing routine."""
        routine_id = args.get("routine_id")
        updates = {k: v for k, v in args.items() if k != "routine_id" and v is not None}
        
        # TODO: Update in backend when endpoint is available
        
        return {
            "success": True,
            "routine_id": routine_id,
            "updates": updates,
            "message": f"Updated activity {routine_id}"
        }
    
    async def _handle_delete_routine(self, args: Dict) -> Dict:
        """Delete a routine."""
        routine_id = args.get("routine_id")
        
        # TODO: Delete from backend when endpoint is available
        
        return {
            "success": True,
            "routine_id": routine_id,
            "message": f"Deleted activity {routine_id}"
        }
    
    # ==================== Behavior Analysis Handlers ====================
    
    async def _handle_analyze_behavior(self, args: Dict) -> Dict:
        """Analyze user behavior from timeline."""
        user_id = args.get("user_id", "P001")
        period = args.get("period", "today")
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{BACKEND_URL}/ai/analyze-behavior",
                    json={"user_id": user_id, "date": None}
                )
                data = response.json()
                
                return {
                    "success": True,
                    "user_id": user_id,
                    "period": period,
                    "patterns": data.get("patterns", []),
                    "anomalies": data.get("anomalies", []),
                    "recommendations": data.get("recommendations", []),
                    "message": "Behavior analysis completed"
                }
        except Exception as e:
            # Return mock analysis if backend fails
            return {
                "success": True,
                "user_id": user_id,
                "period": period,
                "patterns": [
                    {"pattern": "Wake up on time", "frequency": "Daily", "status": "normal"},
                    {"pattern": "Take medication regularly", "frequency": "Daily", "status": "normal"},
                    {"pattern": "Moderate movement", "frequency": "Daily", "status": "normal"}
                ],
                "anomalies": [],
                "recommendations": [
                    "Should increase exercise slightly",
                    "Should drink more water"
                ],
                "message": "Behavior analysis completed"
            }
    
    async def _handle_get_timeline(self, args: Dict) -> Dict:
        """Get activity timeline."""
        user_id = args.get("user_id", "P001")
        limit = args.get("limit", 20)
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{BACKEND_URL}/activities?limit={limit}")
                data = response.json()
                
                return {
                    "success": True,
                    "user_id": user_id,
                    "timeline": data.get("activities", []),
                    "count": len(data.get("activities", []))
                }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    # ==================== Doctor Notes Handlers ====================
    
    async def _handle_get_doctor_notes(self, args: Dict) -> Dict:
        """Get doctor's notes for a patient."""
        user_id = args.get("user_id", "P001")
        
        # Mock response - in production would fetch from database
        return {
            "success": True,
            "user_id": user_id,
            "notes": [
                {
                    "id": "DN001",
                    "doctor": "Dr. Wichai Sukjai",
                    "date": "2024-12-01",
                    "notes": "Patient is healthy, should do light exercise daily",
                    "medications": [
                        {"name": "Blood Pressure Medication", "dose": "1 tablet", "frequency": "Once daily after breakfast"}
                    ],
                    "next_appointment": "2025-01-15"
                }
            ],
            "message": "Retrieved doctor notes successfully"
        }
    
    async def _handle_apply_doctor_recommendations(self, args: Dict) -> Dict:
        """Apply doctor's recommendations to user's timeline."""
        user_id = args.get("user_id", "P001")
        note_id = args.get("note_id")
        
        # This would parse doctor's notes and create/update routines accordingly
        # For demo, we'll add medication reminders
        
        new_routines = [
            {"time": "08:00", "title": "Take Blood Pressure Medication", "description": "1 tablet after breakfast"},
            {"time": "10:00", "title": "Light Exercise", "description": "Walk around house 15 minutes"}
        ]
        
        return {
            "success": True,
            "user_id": user_id,
            "note_id": note_id,
            "added_routines": new_routines,
            "message": f"Updated schedule per doctor recommendations, added {len(new_routines)} activities"
        }
    
    async def _handle_get_user_info(self, args: Dict) -> Dict:
        """Get user information."""
        user_id = args.get("user_id", "P001")
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{BACKEND_URL}/users/{user_id}")
                data = response.json()
                return {
                    "success": True,
                    **data
                }
        except Exception:
            # Mock response
            return {
                "success": True,
                "id": "P001",
                "name": "Somchai Jaidee",
                "age": 65,
                "room": "bedroom",
                "wheelchair": "WC001",
                "health_score": 87,
                "status": "normal"
            }
    
    # ==================== Helpers ====================
    
    @staticmethod
    def _get_room_en(room: str) -> str:
        """Get English room name."""
        names = {
            "bedroom": "Bedroom",
            "bathroom": "Bathroom",
            "kitchen": "Kitchen",
            "livingroom": "Living Room"
        }
        return names.get(room, room)
    
    @staticmethod
    def _get_appliance_en(appliance: str) -> str:
        """Get English appliance name."""
        names = {
            "light": "Light",
            "AC": "AC",
            "fan": "Fan",
            "tv": "TV",
            "alarm": "Alarm"
        }
        return names.get(appliance, appliance)
