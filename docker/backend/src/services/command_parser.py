"""
Command Parser - Logic-based command handling for AI Chat.
Handles common commands without LLM for faster response.
Falls back to LLM for complex/unknown requests.
"""

import re
import logging
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class CommandType(Enum):
    """Types of commands that can be parsed."""
    DEVICE_CONTROL = "device_control"
    DEVICE_CONTROL_ALL_ROOMS = "device_control_all_rooms"
    STATUS_QUERY = "status_query"
    CURRENT_ROOM_QUERY = "current_room_query"
    SCHEDULE_QUERY = "schedule_query"
    UNKNOWN = "unknown"


@dataclass
class ParsedCommand:
    """Result of parsing a command."""
    command_type: CommandType
    device: Optional[str] = None
    action: Optional[str] = None  # "ON" or "OFF"
    room: Optional[str] = None
    all_rooms: bool = False
    confidence: float = 0.0
    raw_message: str = ""


# Device keywords mapping (Thai and English)
DEVICE_KEYWORDS = {
    "light": ["ไฟ", "light", "lights", "lamp", "โคมไฟ", "หลอดไฟ"],
    "AC": ["แอร์", "ac", "air", "aircon", "air conditioner", "เครื่องปรับอากาศ"],
    "fan": ["พัดลม", "fan", "fans"],
    "tv": ["ทีวี", "tv", "television", "โทรทัศน์"],
    "alarm": ["นาฬิกาปลุก", "alarm", "ปลุก"],
}

# Action keywords (Thai and English)
ACTION_ON_KEYWORDS = [
    "เปิด", "turn on", "on", "switch on", "enable", "start",
    "เปิดให้", "เปิดใช้", "เปิดไฟ"
]

ACTION_OFF_KEYWORDS = [
    "ปิด", "turn off", "off", "switch off", "disable", "stop",
    "ปิดให้", "ปิดใช้", "ปิดไฟ"
]

# Room keywords (Thai and English)
ROOM_KEYWORDS = {
    "bedroom": ["ห้องนอน", "bedroom", "bed room", "ห้อง นอน"],
    "bathroom": ["ห้องน้ำ", "bathroom", "bath room", "ห้อง น้ำ"],
    "kitchen": ["ห้องครัว", "kitchen", "ครัว"],
    "livingroom": ["ห้องนั่งเล่น", "living room", "livingroom", "ห้อง นั่งเล่น"],
}

# All rooms keywords
ALL_ROOMS_KEYWORDS = [
    "ทุกห้อง", "all rooms", "all room", "ทั้งหมด", "หมดทุกห้อง",
    "every room", "ทุกๆห้อง", "ทุก ห้อง"
]

# Status query keywords
STATUS_KEYWORDS = [
    "สถานะ", "status", "state", "ดูสถานะ", "เช็คสถานะ", "check status",
    "อะไรเปิดอยู่", "what's on", "whats on", "เปิดอะไรอยู่"
]

# Current room query keywords  
CURRENT_ROOM_KEYWORDS = [
    "ห้องปัจจุบัน", "current room", "ฉันอยู่ห้องไหน", "อยู่ที่ไหน",
    "where am i", "my location", "ตำแหน่งปัจจุบัน"
]

# Schedule query keywords
SCHEDULE_KEYWORDS = [
    "ตารางเวลา", "schedule", "กำหนดการ", "แผนวันนี้",
    "what's next", "next activity", "กิจกรรมต่อไป"
]


def normalize_text(text: str) -> str:
    """Normalize text for matching."""
    return text.lower().strip()


def find_keyword_match(text: str, keywords: List[str]) -> bool:
    """Check if any keyword is found in text."""
    normalized = normalize_text(text)
    for keyword in keywords:
        if normalize_text(keyword) in normalized:
            return True
    return False


def find_device(text: str) -> Optional[str]:
    """Find device type from text."""
    normalized = normalize_text(text)
    for device_type, keywords in DEVICE_KEYWORDS.items():
        for keyword in keywords:
            if normalize_text(keyword) in normalized:
                return device_type
    return None


def find_action(text: str) -> Optional[str]:
    """Find action (ON/OFF) from text."""
    normalized = normalize_text(text)
    
    # Check OFF first (more specific patterns)
    for keyword in ACTION_OFF_KEYWORDS:
        if normalize_text(keyword) in normalized:
            return "OFF"
    
    # Check ON
    for keyword in ACTION_ON_KEYWORDS:
        if normalize_text(keyword) in normalized:
            return "ON"
    
    return None


def find_room(text: str) -> Optional[str]:
    """Find room from text."""
    normalized = normalize_text(text)
    for room_id, keywords in ROOM_KEYWORDS.items():
        for keyword in keywords:
            if normalize_text(keyword) in normalized:
                return room_id
    return None


def is_all_rooms(text: str) -> bool:
    """Check if command applies to all rooms."""
    return find_keyword_match(text, ALL_ROOMS_KEYWORDS)


def parse_command(message: str) -> ParsedCommand:
    """
    Parse user message and return structured command.
    
    Args:
        message: User's message text
        
    Returns:
        ParsedCommand with parsed information
    """
    result = ParsedCommand(
        command_type=CommandType.UNKNOWN,
        raw_message=message
    )
    
    normalized = normalize_text(message)
    
    # Check for status query
    if find_keyword_match(message, STATUS_KEYWORDS):
        result.command_type = CommandType.STATUS_QUERY
        result.confidence = 0.9
        return result
    
    # Check for current room query
    if find_keyword_match(message, CURRENT_ROOM_KEYWORDS):
        result.command_type = CommandType.CURRENT_ROOM_QUERY
        result.confidence = 0.9
        return result
    
    # Check for schedule query
    if find_keyword_match(message, SCHEDULE_KEYWORDS):
        result.command_type = CommandType.SCHEDULE_QUERY
        result.confidence = 0.9
        return result
    
    # Check for device control
    action = find_action(message)
    device = find_device(message)
    
    if action:
        result.action = action
        result.device = device or "Light"  # Default to light if not specified
        
        if is_all_rooms(message):
            result.command_type = CommandType.DEVICE_CONTROL_ALL_ROOMS
            result.all_rooms = True
            result.confidence = 0.95
        else:
            result.command_type = CommandType.DEVICE_CONTROL
            result.room = find_room(message)
            result.confidence = 0.85 if device else 0.7
        
        return result
    
    # Unknown command - will fall back to LLM
    result.command_type = CommandType.UNKNOWN
    result.confidence = 0.0
    return result


async def execute_command(
    parsed: ParsedCommand,
    db,
    mqtt_handler,
    current_room: str = "bedroom"
) -> Dict[str, Any]:
    """
    Execute a parsed command.
    
    Args:
        parsed: Parsed command from parse_command()
        db: Database instance
        mqtt_handler: MQTT handler instance
        current_room: User's current room (from user_info)
        
    Returns:
        Dict with success status and response message
    """
    from .tool_handlers import handle_device_control
    
    if parsed.command_type == CommandType.UNKNOWN:
        return {
            "handled": False,
            "message": "",
            "should_use_llm": True
        }
    
    if parsed.command_type == CommandType.STATUS_QUERY:
        return await _handle_status_query(db)
    
    if parsed.command_type == CommandType.CURRENT_ROOM_QUERY:
        return await _handle_current_room_query(db)
    
    if parsed.command_type == CommandType.SCHEDULE_QUERY:
        return await _handle_schedule_query(db)
    
    if parsed.command_type == CommandType.DEVICE_CONTROL:
        room = parsed.room or current_room
        return await _handle_device_control(
            db, mqtt_handler, room, parsed.device, parsed.action
        )
    
    if parsed.command_type == CommandType.DEVICE_CONTROL_ALL_ROOMS:
        return await _handle_all_rooms_control(
            db, mqtt_handler, parsed.device, parsed.action
        )
    
    return {
        "handled": False,
        "message": "",
        "should_use_llm": True
    }


async def _handle_status_query(db) -> Dict[str, Any]:
    """Handle status query command."""
    try:
        # Get current location
        user_info = await db.get_user_info()
        current_room = user_info.get("current_location", "Unknown")
        
        # Get all device states
        device_states = await db.get_all_device_states()
        
        # Build status message
        lines = [f"📍 ห้องปัจจุบัน: {current_room}", "", "🔌 สถานะอุปกรณ์:"]
        
        for room, devices in device_states.items():
            on_devices = [d for d, s in devices.items() if s]
            off_devices = [d for d, s in devices.items() if not s]
            
            room_status = f"  • {room.capitalize()}: "
            if on_devices:
                room_status += f"🟢 {', '.join(on_devices)}"
            if on_devices and off_devices:
                room_status += " | "
            if off_devices:
                room_status += f"⚫ {', '.join(off_devices)}"
            
            lines.append(room_status)
        
        return {
            "handled": True,
            "message": "\n".join(lines),
            "should_use_llm": False
        }
    except Exception as e:
        logger.error(f"Error handling status query: {e}")
        return {
            "handled": False,
            "message": "",
            "should_use_llm": True
        }


async def _handle_current_room_query(db) -> Dict[str, Any]:
    """Handle current room query."""
    try:
        user_info = await db.get_user_info()
        current_room = user_info.get("current_location", "Unknown")
        
        return {
            "handled": True,
            "message": f"📍 คุณอยู่ที่: {current_room}",
            "should_use_llm": False
        }
    except Exception as e:
        logger.error(f"Error handling current room query: {e}")
        return {
            "handled": False,
            "message": "",
            "should_use_llm": True
        }


async def _handle_schedule_query(db) -> Dict[str, Any]:
    """Handle schedule query."""
    try:
        from datetime import datetime
        
        # Get today's schedule
        schedule = await db.get_schedule_items()
        current_time = datetime.now().strftime("%H:%M")
        
        # Find next activity
        upcoming = []
        for item in schedule:
            item_time = item.get("time", "")
            if item_time > current_time:
                upcoming.append(item)
        
        if upcoming:
            next_item = upcoming[0]
            message = f"⏰ กิจกรรมต่อไป: {next_item.get('activity', 'Unknown')} เวลา {next_item.get('time', '')}"
        else:
            message = "✅ ไม่มีกิจกรรมที่กำหนดไว้แล้ววันนี้"
        
        return {
            "handled": True,
            "message": message,
            "should_use_llm": False
        }
    except Exception as e:
        logger.error(f"Error handling schedule query: {e}")
        return {
            "handled": False,
            "message": "",
            "should_use_llm": True
        }


async def _handle_device_control(
    db, mqtt_handler, room: str, device: str, action: str
) -> Dict[str, Any]:
    """Handle single device control."""
    try:
        from ..core.appliance_control import control_appliance_core
        
        state = action == "ON"
        result = await control_appliance_core(
            db=db,
            mqtt_handler=mqtt_handler,
            room=room,
            appliance=device,
            state=state
        )
        
        if result.get("success"):
            action_th = "เปิด" if state else "ปิด"
            device_name = device.capitalize() if device != "AC" else "AC"
            message = f"✅ {action_th}{device_name}ห้อง{room.capitalize()}แล้ว"
            
            return {
                "handled": True,
                "message": message,
                "should_use_llm": False,
                "tool_result": result
            }
        else:
            return {
                "handled": False,
                "message": result.get("error", ""),
                "should_use_llm": True
            }
    except Exception as e:
        logger.error(f"Error handling device control: {e}")
        return {
            "handled": False,
            "message": "",
            "should_use_llm": True
        }


async def _handle_all_rooms_control(
    db, mqtt_handler, device: str, action: str
) -> Dict[str, Any]:
    """Handle device control for all rooms."""
    try:
        from ..core.appliance_control import control_appliance_core
        
        rooms = ["bedroom", "bathroom", "kitchen", "livingroom"]
        state = action == "ON"
        success_count = 0
        
        for room in rooms:
            try:
                result = await control_appliance_core(
                    db=db,
                    mqtt_handler=mqtt_handler,
                    room=room,
                    appliance=device,
                    state=state
                )
                if result.get("success"):
                    success_count += 1
            except Exception as e:
                logger.warning(f"Failed to control {device} in {room}: {e}")
        
        action_th = "เปิด" if state else "ปิด"
        device_name = device.capitalize() if device != "AC" else "AC"
        message = f"✅ {action_th}{device_name}ทุกห้องแล้ว ({success_count}/{len(rooms)} ห้อง)"
        
        return {
            "handled": True,
            "message": message,
            "should_use_llm": False
        }
    except Exception as e:
        logger.error(f"Error handling all rooms control: {e}")
        return {
            "handled": False,
            "message": "",
            "should_use_llm": True
        }
