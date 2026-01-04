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
    TURN_OFF_ALL_ON = "turn_off_all_on"  # Turn off all devices that are currently ON
    STATUS_QUERY = "status_query"
    CURRENT_ROOM_QUERY = "current_room_query"
    SCHEDULE_QUERY = "schedule_query"
    ACTIVITY_DONE = "activity_done"  # User says they finished current activity
    UNKNOWN = "unknown"


@dataclass
class ParsedCommand:
    """Result of parsing a command."""
    command_type: CommandType
    device: Optional[str] = None  # Single device (for backward compatibility)
    devices: Optional[List[str]] = None  # Multiple devices
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

# Activity done keywords (user says they finished current activity)
ACTIVITY_DONE_KEYWORDS = [
    "เสร็จแล้ว", "done", "finished", "complete", "completed",
    "ทำเสร็จแล้ว", "เรียบร้อยแล้ว", "เรียบร้อย", "ทำเสร็จ",
    "เสร็จ", "จบแล้ว", "ต่อไปทำอะไร", "ต่อไป", "what's next task",
    "next task", "อะไรต่อไป", "แล้วต่อไป"
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
    """Find device type from text (returns first match)."""
    normalized = normalize_text(text)
    for device_type, keywords in DEVICE_KEYWORDS.items():
        for keyword in keywords:
            if normalize_text(keyword) in normalized:
                return device_type
    return None


def find_devices(text: str) -> List[str]:
    """Find all device types from text (supports multiple devices)."""
    normalized = normalize_text(text)
    found_devices = []
    device_found = set()  # Track which device types we've already found
    
    for device_type, keywords in DEVICE_KEYWORDS.items():
        if device_type in device_found:
            continue
        for keyword in keywords:
            if normalize_text(keyword) in normalized:
                found_devices.append(device_type)
                device_found.add(device_type)
                break
    
    return found_devices


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
    
    # Check for activity done (user finished current activity)
    if find_keyword_match(message, ACTIVITY_DONE_KEYWORDS):
        result.command_type = CommandType.ACTIVITY_DONE
        result.confidence = 0.85
        return result
    
    # Check for device control
    action = find_action(message)
    devices = find_devices(message)  # Get all devices
    
    if action:
        result.action = action
        
        # Check if multiple devices found
        if len(devices) > 1:
            result.devices = devices
            result.device = devices[0]  # Keep first for backward compatibility
            result.confidence = 0.9  # High confidence for multiple devices
        elif len(devices) == 1:
            result.device = devices[0]
            result.confidence = 0.85
        else:
            # No device specified
            if action == "OFF":
                # Turn off with no device = turn off all ON devices in current room
                result.command_type = CommandType.TURN_OFF_ALL_ON
                result.device = None
                result.confidence = 0.85
                result.room = find_room(message)
                return result
            else:
                # Turn on with no device - default to Light
                result.device = "light"
                result.confidence = 0.7
        
        if is_all_rooms(message):
            result.command_type = CommandType.DEVICE_CONTROL_ALL_ROOMS
            result.all_rooms = True
            result.confidence = 0.95
        else:
            result.command_type = CommandType.DEVICE_CONTROL
            result.room = find_room(message)
        
        return result
    
    # Unknown command - will fall back to LLM
    result.command_type = CommandType.UNKNOWN
    result.confidence = 0.0
    return result


async def execute_command(
    parsed: ParsedCommand,
    db,
    mqtt_handler,
    current_room: str = "bedroom",
    app = None  # FastAPI app instance for accessing custom_time
) -> Dict[str, Any]:
    """
    Execute a parsed command.
    
    Args:
        parsed: Parsed command from parse_command()
        db: Database instance
        mqtt_handler: MQTT handler instance
        current_room: User's current room (from user_info)
        app: FastAPI app instance (for custom_time access)
        
    Returns:
        Dict with success status and response message
    """
    # Note: control_appliance_core is imported in the handler functions below
    
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
    
    if parsed.command_type == CommandType.ACTIVITY_DONE:
        return await _handle_activity_done(db, app)
    
    if parsed.command_type == CommandType.TURN_OFF_ALL_ON:
        room = parsed.room or current_room
        return await _handle_turn_off_all_on(db, mqtt_handler, room)
    
    if parsed.command_type == CommandType.DEVICE_CONTROL:
        room = parsed.room or current_room
        
        # Check if multiple devices
        if parsed.devices and len(parsed.devices) > 1:
            return await _handle_multiple_device_control(
                db, mqtt_handler, room, parsed.devices, parsed.action
            )
        else:
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


async def _handle_activity_done(db, app=None) -> Dict[str, Any]:
    """Handle activity done command - tell user about next activity."""
    try:
        from datetime import datetime
        import time
        
        # Get today's schedule
        schedule = await db.get_schedule_items()
        
        # Use custom time if set, otherwise use real time
        if app and hasattr(app.state, 'custom_time') and app.state.custom_time:
            custom_time = app.state.custom_time
            custom_time_set_timestamp = getattr(app.state, 'custom_time_set_timestamp', time.time())
            # Parse custom time and add elapsed seconds
            parts = custom_time.split(":")
            if len(parts) >= 2:
                hours = int(parts[0])
                minutes = int(parts[1])
                elapsed_seconds = int(time.time() - custom_time_set_timestamp)
                total_minutes = hours * 60 + minutes + (elapsed_seconds // 60)
                hours = (total_minutes // 60) % 24
                minutes = total_minutes % 60
                current_time = f"{hours:02d}:{minutes:02d}"
            else:
                current_time = custom_time
            logger.info(f"Using custom time for activity done: {current_time}")
        else:
            current_time = datetime.now().strftime("%H:%M")
        
        # Sort by time
        sorted_schedule = sorted(schedule, key=lambda x: x.get("time", "99:99"))
        
        # Find current and next activities
        current_activity = None
        next_activity = None
        
        for i, item in enumerate(sorted_schedule):
            item_time = item.get("time", "")
            if item_time <= current_time:
                current_activity = item
            elif item_time > current_time:
                next_activity = item
                break
        
        # Build response message
        lines = []
        
        if current_activity:
            lines.append(f"✅ {current_activity.get('activity', 'กิจกรรม')} เสร็จเรียบร้อย!")
        else:
            lines.append("✅ เรียบร้อยแล้ว!")
        
        if next_activity:
            next_time = next_activity.get("time", "")
            next_name = next_activity.get("activity", "กิจกรรม")
            next_location = next_activity.get("location", "")
            
            lines.append("")
            lines.append(f"⏰ กิจกรรมต่อไป: {next_name}")
            lines.append(f"   เวลา: {next_time}")
            if next_location:
                lines.append(f"   สถานที่: {next_location}")
            
            # Check if there are device actions
            action = next_activity.get("action")
            if action and action.get("devices"):
                devices = action.get("devices", [])
                device_list = [f"{d.get('device')} ({d.get('state')})" for d in devices]
                if device_list:
                    lines.append(f"   อุปกรณ์: {', '.join(device_list)}")
        else:
            lines.append("")
            lines.append("🎉 ไม่มีกิจกรรมที่กำหนดไว้แล้ววันนี้ พักผ่อนได้เลย!")
        
        return {
            "handled": True,
            "message": "\n".join(lines),
            "should_use_llm": False
        }
    except Exception as e:
        logger.error(f"Error handling activity done: {e}")
        return {
            "handled": False,
            "message": "",
            "should_use_llm": True
        }


async def _handle_turn_off_all_on(db, mqtt_handler, room: str) -> Dict[str, Any]:
    """Handle turn off all ON devices in a room."""
    try:
        from ..core.appliance_control import control_appliance_core
        from ..core.database import normalize_room_name
        
        # Normalize room name
        normalized_room = normalize_room_name(room)
        
        # Get device states for this room
        device_states = await db.get_all_device_states()
        room_devices = device_states.get(normalized_room, {})
        
        # Find devices that are ON
        on_devices = [dev for dev, state in room_devices.items() if state]
        
        if not on_devices:
            return {
                "handled": True,
                "message": f"ไม่มีอุปกรณ์ใดเปิดอยู่ใน {room.capitalize()}",
                "should_use_llm": False
            }
        
        # Turn off each ON device
        success_count = 0
        turned_off = []
        
        for device in on_devices:
            try:
                result = await control_appliance_core(
                    db=db,
                    mqtt_handler=mqtt_handler,
                    room=normalized_room,
                    appliance=device,
                    state=False
                )
                if result.get("success"):
                    success_count += 1
                    turned_off.append(device.capitalize() if device.lower() != "ac" else "AC")
            except Exception as e:
                logger.warning(f"Failed to turn off {device} in {normalized_room}: {e}")
        
        if turned_off:
            room_name = room.capitalize()
            message = f"ปิด {', '.join(turned_off)} ใน {room_name} แล้ว"
            return {
                "handled": True,
                "message": message,
                "should_use_llm": False,
                "tool_result": {"success": True, "devices_turned_off": turned_off}
            }
        else:
            return {
                "handled": False,
                "message": "",
                "should_use_llm": True
            }
    except Exception as e:
        logger.error(f"Error handling turn off all ON: {e}")
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
        from ..core.database import normalize_room_name
        
        # Normalize room name to match database format (lowercase, no spaces)
        normalized_room = normalize_room_name(room)
        
        state = action == "ON"
        result = await control_appliance_core(
            db=db,
            mqtt_handler=mqtt_handler,
            room=normalized_room,
            appliance=device,
            state=state
        )
        
        if result.get("success"):
            action_str = "ON" if state else "OFF"
            device_name = device.capitalize() if device != "AC" else "AC"
            room_name = room.capitalize()
            message = f"Set {room_name} {device_name} to {action_str}"
            
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


async def _handle_multiple_device_control(
    db, mqtt_handler, room: str, devices: List[str], action: str
) -> Dict[str, Any]:
    """Handle multiple device control in a single room."""
    try:
        from ..core.appliance_control import control_appliance_core
        from ..core.database import normalize_room_name
        
        # Normalize room name to match database format (lowercase, no spaces)
        normalized_room = normalize_room_name(room)
        
        state = action == "ON"
        results = []
        success_count = 0
        
        for device in devices:
            try:
                result = await control_appliance_core(
                    db=db,
                    mqtt_handler=mqtt_handler,
                    room=normalized_room,
                    appliance=device,
                    state=state
                )
                if result.get("success"):
                    success_count += 1
                    results.append(result)
            except Exception as e:
                logger.warning(f"Failed to control {device} in {normalized_room}: {e}")
        
        action_str = "ON" if state else "OFF"
        device_names = [d.capitalize() if d != "AC" else "AC" for d in devices]
        room_name = room.capitalize()
        
        if success_count == len(devices):
            message = f"Set {room_name} {', '.join(device_names)} to {action_str}"
        else:
            message = f"Set {room_name} {', '.join(device_names)} to {action_str} ({success_count}/{len(devices)} succeeded)"
        
        return {
            "handled": True,
            "message": message,
            "should_use_llm": False,
            "tool_result": results[0] if results else None  # Return first result for compatibility
        }
    except Exception as e:
        logger.error(f"Error handling multiple device control: {e}")
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
        
        action_str = "ON" if state else "OFF"
        device_name = device.capitalize() if device != "AC" else "AC"
        message = f"Set {device_name} to {action_str} in all rooms ({success_count}/{len(rooms)} rooms)"
        
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
