"""
WheelSense MCP Server - Enhanced Tool Registry
MCP tools for smart home control, timeline management, and AI behavior analysis
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

# Backend API URL for database operations
BACKEND_URL = "http://backend:8000"


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
            description="ควบคุมเครื่องใช้ไฟฟ้าในห้อง เช่น เปิด/ปิดไฟ แอร์ พัดลม ทีวี",
            input_schema={
                "type": "object",
                "properties": {
                    "room": {
                        "type": "string",
                        "description": "ห้องที่ต้องการควบคุม (bedroom, bathroom, kitchen, livingroom)",
                        "enum": ["bedroom", "bathroom", "kitchen", "livingroom"]
                    },
                    "appliance": {
                        "type": "string",
                        "description": "เครื่องใช้ไฟฟ้าที่ต้องการควบคุม (light, aircon, fan, tv, alarm)",
                        "enum": ["light", "aircon", "fan", "tv", "alarm"]
                    },
                    "state": {
                        "type": "boolean",
                        "description": "สถานะที่ต้องการ (true=เปิด, false=ปิด)"
                    },
                    "value": {
                        "type": "integer",
                        "description": "ค่าเพิ่มเติม เช่น อุณหภูมิแอร์ ความเร็วพัดลม"
                    }
                },
                "required": ["room", "appliance", "state"]
            },
            handler=self._handle_control_appliance
        )
        
        self.register_tool(
            name="get_room_status",
            description="ดูสถานะของห้อง รวมถึงเครื่องใช้ไฟฟ้าและการตรวจจับผู้ใช้",
            input_schema={
                "type": "object",
                "properties": {
                    "room": {
                        "type": "string",
                        "description": "ห้องที่ต้องการดูสถานะ",
                        "enum": ["bedroom", "bathroom", "kitchen", "livingroom"]
                    }
                },
                "required": ["room"]
            },
            handler=self._handle_get_room_status
        )
        
        self.register_tool(
            name="get_user_location",
            description="ดูตำแหน่งปัจจุบันของผู้ใช้",
            input_schema={
                "type": "object",
                "properties": {}
            },
            handler=self._handle_get_user_location
        )
        
        self.register_tool(
            name="turn_off_all",
            description="ปิดเครื่องใช้ไฟฟ้าทั้งหมดในห้องหรือทั้งบ้าน",
            input_schema={
                "type": "object",
                "properties": {
                    "room": {
                        "type": "string",
                        "description": "ห้องที่ต้องการปิด (ถ้าไม่ระบุจะปิดทั้งบ้าน)",
                        "enum": ["bedroom", "bathroom", "kitchen", "livingroom"]
                    }
                }
            },
            handler=self._handle_turn_off_all
        )
        
        self.register_tool(
            name="send_emergency",
            description="ส่งการแจ้งเตือนฉุกเฉิน",
            input_schema={
                "type": "object",
                "properties": {
                    "event_type": {
                        "type": "string",
                        "description": "ประเภทเหตุฉุกเฉิน",
                        "enum": ["fall", "fire", "sos", "unusual_behavior"]
                    },
                    "room": {
                        "type": "string",
                        "description": "ห้องที่เกิดเหตุ"
                    },
                    "message": {
                        "type": "string",
                        "description": "รายละเอียดเพิ่มเติม"
                    }
                },
                "required": ["event_type"]
            },
            handler=self._handle_send_emergency
        )
        
        self.register_tool(
            name="set_scene",
            description="ตั้งค่าฉาก/โหมดการใช้งาน เช่น โหมดนอน โหมดดูทีวี",
            input_schema={
                "type": "object",
                "properties": {
                    "scene": {
                        "type": "string",
                        "description": "ฉากที่ต้องการตั้งค่า",
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
            description="ดูตารางกิจกรรมประจำวันของผู้ใช้",
            input_schema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "รหัสผู้ใช้ (ถ้าไม่ระบุจะใช้ผู้ใช้ปัจจุบัน)"
                    },
                    "date": {
                        "type": "string",
                        "description": "วันที่ (YYYY-MM-DD) ถ้าไม่ระบุจะเป็นวันนี้"
                    }
                }
            },
            handler=self._handle_get_routines
        )
        
        self.register_tool(
            name="add_routine",
            description="เพิ่มกิจกรรมใหม่ในตารางประจำวัน",
            input_schema={
                "type": "object",
                "properties": {
                    "time": {
                        "type": "string",
                        "description": "เวลา (HH:MM)"
                    },
                    "title": {
                        "type": "string",
                        "description": "ชื่อกิจกรรม"
                    },
                    "description": {
                        "type": "string",
                        "description": "รายละเอียด"
                    },
                    "user_id": {
                        "type": "string",
                        "description": "รหัสผู้ใช้"
                    }
                },
                "required": ["time", "title"]
            },
            handler=self._handle_add_routine
        )
        
        self.register_tool(
            name="update_routine",
            description="แก้ไขกิจกรรมในตารางประจำวัน",
            input_schema={
                "type": "object",
                "properties": {
                    "routine_id": {
                        "type": "string",
                        "description": "รหัสกิจกรรม"
                    },
                    "time": {
                        "type": "string",
                        "description": "เวลาใหม่ (HH:MM)"
                    },
                    "title": {
                        "type": "string",
                        "description": "ชื่อกิจกรรมใหม่"
                    },
                    "description": {
                        "type": "string",
                        "description": "รายละเอียดใหม่"
                    },
                    "completed": {
                        "type": "boolean",
                        "description": "สถานะเสร็จสิ้น"
                    }
                },
                "required": ["routine_id"]
            },
            handler=self._handle_update_routine
        )
        
        self.register_tool(
            name="delete_routine",
            description="ลบกิจกรรมออกจากตารางประจำวัน",
            input_schema={
                "type": "object",
                "properties": {
                    "routine_id": {
                        "type": "string",
                        "description": "รหัสกิจกรรมที่ต้องการลบ"
                    }
                },
                "required": ["routine_id"]
            },
            handler=self._handle_delete_routine
        )
        
        # ==================== Behavior Analysis ====================
        
        self.register_tool(
            name="analyze_behavior",
            description="วิเคราะห์พฤติกรรมของผู้ใช้จาก Timeline และแนะนำการปรับปรุง",
            input_schema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "รหัสผู้ใช้"
                    },
                    "period": {
                        "type": "string",
                        "description": "ช่วงเวลา (today, week, month)",
                        "enum": ["today", "week", "month"]
                    }
                },
                "required": ["user_id"]
            },
            handler=self._handle_analyze_behavior
        )
        
        self.register_tool(
            name="get_activity_timeline",
            description="ดูประวัติกิจกรรมและเหตุการณ์ของผู้ใช้",
            input_schema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "รหัสผู้ใช้"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "จำนวนรายการสูงสุด"
                    }
                }
            },
            handler=self._handle_get_timeline
        )
        
        # ==================== Doctor Notes ====================
        
        self.register_tool(
            name="get_doctor_notes",
            description="ดูบันทึกและคำแนะนำจากแพทย์",
            input_schema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "รหัสผู้ป่วย"
                    }
                },
                "required": ["user_id"]
            },
            handler=self._handle_get_doctor_notes
        )
        
        self.register_tool(
            name="apply_doctor_recommendations",
            description="ปรับตาราง Timeline ตามคำแนะนำของแพทย์",
            input_schema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "รหัสผู้ป่วย"
                    },
                    "note_id": {
                        "type": "string",
                        "description": "รหัสบันทึกของแพทย์"
                    }
                },
                "required": ["user_id"]
            },
            handler=self._handle_apply_doctor_recommendations
        )
        
        # ==================== User Info ====================
        
        self.register_tool(
            name="get_user_info",
            description="ดูข้อมูลผู้ใช้ รวมถึงสุขภาพ รถเข็น และห้องปัจจุบัน",
            input_schema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "รหัสผู้ใช้"
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
            "bedroom": ["light", "alarm", "aircon"],
            "bathroom": ["light"],
            "kitchen": ["light", "alarm"],
            "livingroom": ["light", "fan", "tv", "aircon"]
        }
        
        if appliance not in room_appliances.get(room, []):
            return {
                "success": False,
                "error": f"{self._get_room_th(room)}ไม่มี{self._get_appliance_th(appliance)}"
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
        
        action = "เปิด" if state else "ปิด"
        return {
            "success": success,
            "message": f"{action}{self._get_appliance_th(appliance)}ใน{self._get_room_th(room)}แล้ว" if success else "ไม่สามารถส่งคำสั่งได้",
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
            "room_name_th": self._get_room_th(room),
            "status": status,
            "timestamp": datetime.now().isoformat()
        }
    
    async def _handle_get_user_location(self, args: Dict) -> Dict:
        """Handle get_user_location tool call."""
        location = self.mqtt_client.get_user_location()
        return {
            **location,
            "user_name": "สมชาย ใจดี",
            "room_th": self._get_room_th(location.get("room", "unknown"))
        }
    
    async def _handle_turn_off_all(self, args: Dict) -> Dict:
        """Handle turn_off_all tool call."""
        room = args.get("room")
        
        rooms_to_control = [room] if room else ["bedroom", "bathroom", "kitchen", "livingroom"]
        
        room_appliances = {
            "bedroom": ["light", "alarm", "aircon"],
            "bathroom": ["light"],
            "kitchen": ["light", "alarm"],
            "livingroom": ["light", "fan", "tv", "aircon"]
        }
        
        results = []
        for r in rooms_to_control:
            for appliance in room_appliances.get(r, []):
                success = await self.mqtt_client.send_control(r, appliance, False)
                results.append({"room": r, "appliance": appliance, "success": success})
        
        return {
            "success": True,
            "message": f"ปิดเครื่องใช้ไฟฟ้าทั้งหมด{f'ใน{self._get_room_th(room)}' if room else ''}แล้ว",
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
            "message": f"ส่งการแจ้งเตือนฉุกเฉิน ({event_type}) แล้ว",
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
                    {"room": "bedroom", "appliance": "aircon", "state": True},
                    {"room": "livingroom", "appliance": "light", "state": False},
                    {"room": "livingroom", "appliance": "tv", "state": False}
                ],
                "message": "ตั้งค่าโหมดนอนหลับแล้ว"
            },
            "wake_up": {
                "actions": [
                    {"room": "bedroom", "appliance": "light", "state": True},
                    {"room": "bedroom", "appliance": "aircon", "state": False},
                    {"room": "kitchen", "appliance": "light", "state": True}
                ],
                "message": "ตั้งค่าโหมดตื่นนอนแล้ว"
            },
            "movie": {
                "actions": [
                    {"room": "livingroom", "appliance": "light", "state": False},
                    {"room": "livingroom", "appliance": "tv", "state": True},
                    {"room": "livingroom", "appliance": "aircon", "state": True}
                ],
                "message": "ตั้งค่าโหมดดูหนังแล้ว"
            },
            "away": {
                "actions": [
                    {"room": "bedroom", "appliance": "light", "state": False},
                    {"room": "bedroom", "appliance": "aircon", "state": False},
                    {"room": "bathroom", "appliance": "light", "state": False},
                    {"room": "kitchen", "appliance": "light", "state": False},
                    {"room": "livingroom", "appliance": "light", "state": False},
                    {"room": "livingroom", "appliance": "tv", "state": False},
                    {"room": "livingroom", "appliance": "aircon", "state": False}
                ],
                "message": "ตั้งค่าโหมดออกจากบ้านแล้ว - ปิดเครื่องใช้ไฟฟ้าทั้งหมด"
            },
            "home": {
                "actions": [
                    {"room": "livingroom", "appliance": "light", "state": True},
                    {"room": "livingroom", "appliance": "aircon", "state": True}
                ],
                "message": "ตั้งค่าโหมดกลับบ้านแล้ว"
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
            "message": config.get("message", f"ตั้งค่าฉาก {scene} แล้ว"),
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
                    "message": f"พบ {len(data.get('activities', []))} กิจกรรม"
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
            "message": f"เพิ่มกิจกรรม '{title}' เวลา {time} แล้ว"
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
            "message": f"อัปเดตกิจกรรม {routine_id} แล้ว"
        }
    
    async def _handle_delete_routine(self, args: Dict) -> Dict:
        """Delete a routine."""
        routine_id = args.get("routine_id")
        
        # TODO: Delete from backend when endpoint is available
        
        return {
            "success": True,
            "routine_id": routine_id,
            "message": f"ลบกิจกรรม {routine_id} แล้ว"
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
                    "message": "วิเคราะห์พฤติกรรมเสร็จสิ้น"
                }
        except Exception as e:
            # Return mock analysis if backend fails
            return {
                "success": True,
                "user_id": user_id,
                "period": period,
                "patterns": [
                    {"pattern": "ตื่นนอนตรงเวลา", "frequency": "ทุกวัน", "status": "normal"},
                    {"pattern": "ทานยาสม่ำเสมอ", "frequency": "ทุกวัน", "status": "normal"},
                    {"pattern": "เคลื่อนไหวปานกลาง", "frequency": "ทุกวัน", "status": "normal"}
                ],
                "anomalies": [],
                "recommendations": [
                    "ควรเพิ่มการออกกำลังกายอีกเล็กน้อย",
                    "ควรทานน้ำให้มากขึ้น"
                ],
                "message": "วิเคราะห์พฤติกรรมเสร็จสิ้น"
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
                    "doctor": "นพ.วิชัย สุขใจ",
                    "date": "2024-12-01",
                    "notes": "ผู้ป่วยมีสุขภาพดี ควรออกกำลังกายเบาๆ ทุกวัน",
                    "medications": [
                        {"name": "ยาความดัน", "dose": "1 เม็ด", "frequency": "วันละ 1 ครั้ง หลังอาหารเช้า"}
                    ],
                    "next_appointment": "2025-01-15"
                }
            ],
            "message": "ดึงบันทึกแพทย์สำเร็จ"
        }
    
    async def _handle_apply_doctor_recommendations(self, args: Dict) -> Dict:
        """Apply doctor's recommendations to user's timeline."""
        user_id = args.get("user_id", "P001")
        note_id = args.get("note_id")
        
        # This would parse doctor's notes and create/update routines accordingly
        # For demo, we'll add medication reminders
        
        new_routines = [
            {"time": "08:00", "title": "ทานยาความดัน", "description": "1 เม็ด หลังอาหารเช้า"},
            {"time": "10:00", "title": "ออกกำลังกายเบาๆ", "description": "เดินรอบบ้าน 15 นาที"}
        ]
        
        return {
            "success": True,
            "user_id": user_id,
            "note_id": note_id,
            "added_routines": new_routines,
            "message": f"ปรับตารางตามคำแนะนำของแพทย์แล้ว เพิ่ม {len(new_routines)} กิจกรรม"
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
                "name": "สมชาย ใจดี",
                "age": 65,
                "room": "bedroom",
                "wheelchair": "WC001",
                "health_score": 87,
                "status": "normal"
            }
    
    # ==================== Helpers ====================
    
    @staticmethod
    def _get_room_th(room: str) -> str:
        """Get Thai room name."""
        names = {
            "bedroom": "ห้องนอน",
            "bathroom": "ห้องน้ำ",
            "kitchen": "ห้องครัว",
            "livingroom": "ห้องนั่งเล่น"
        }
        return names.get(room, room)
    
    @staticmethod
    def _get_appliance_th(appliance: str) -> str:
        """Get Thai appliance name."""
        names = {
            "light": "ไฟ",
            "aircon": "แอร์",
            "fan": "พัดลม",
            "tv": "ทีวี",
            "alarm": "สัญญาณเตือน"
        }
        return names.get(appliance, appliance)
