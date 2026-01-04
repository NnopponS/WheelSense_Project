"""
Tool Handlers for MCP-style tool execution.
Each handler implements a specific tool's logic.
"""

import logging
from typing import Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


# Room name normalization mapping
ROOM_NORMALIZATION = {
    "bedroom": "bedroom",
    "bed room": "bedroom",
    "bathroom": "bathroom",
    "bath room": "bathroom",
    "kitchen": "kitchen",
    "livingroom": "livingroom",
    "living room": "livingroom",
    "living": "livingroom",
}

# Device name normalization mapping
DEVICE_NORMALIZATION = {
    "light": "Light",
    "lights": "Light",
    "ac": "AC",
    "air": "AC",
    "air conditioner": "AC",
    "airconditioner": "AC",
    "tv": "TV",
    "television": "TV",
    "fan": "Fan",
    "alarm": "Alarm",
}

# Available devices per room
ROOM_DEVICES = {
    "bedroom": ["Light", "AC", "Alarm"],
    "bathroom": ["Light"],
    "kitchen": ["Light", "Alarm"],
    "livingroom": ["Light", "TV", "AC", "Fan"],
}


def normalize_room_name(room: str) -> str:
    """
    Normalize room name to standard format.
    
    Args:
        room: Room name (case-insensitive)
        
    Returns:
        Normalized room name (lowercase, no spaces)
    """
    if not room:
        return ""
    
    room_lower = room.lower().strip()
    return ROOM_NORMALIZATION.get(room_lower, room_lower.replace(" ", ""))


def normalize_device_name(device: str) -> str:
    """
    Normalize device name to standard format.
    
    Args:
        device: Device name (case-insensitive)
        
    Returns:
        Normalized device name (capitalized)
    """
    if not device:
        return ""
    
    device_lower = device.lower().strip()
    normalized = DEVICE_NORMALIZATION.get(device_lower, device.capitalize())
    return normalized


async def handle_chat_message(db, mqtt_handler, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle chat_message tool call.
    Sends an informational message to the user (no state changes).
    
    Args:
        db: Database instance
        mqtt_handler: MQTT handler instance
        arguments: Tool arguments
        
    Returns:
        Tool execution result
    """
    message = arguments.get("message")
    
    if not message or not isinstance(message, str):
        return {
            "success": False,
            "tool": "chat_message",
            "message": "",
            "error": "Invalid message argument"
        }
    
    return {
        "success": True,
        "tool": "chat_message",
        "message": message,
        "error": None
    }


async def handle_e_device_control(db, mqtt_handler, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle e_device_control tool call.
    Controls a device in a room (ON/OFF).
    
    Args:
        db: Database instance
        mqtt_handler: MQTT handler instance
        arguments: Tool arguments
        
    Returns:
        Tool execution result
    """
    # Safety check: ensure arguments is a dict
    if not isinstance(arguments, dict):
        logger.error(f"e_device_control received invalid arguments type: {type(arguments)}, value: {arguments}")
        return {
            "success": False,
            "tool": "e_device_control",
            "room": "",
            "device": "",
            "action": "",
            "previous_state": None,
            "new_state": None,
            "message": "",
            "error": f"Invalid arguments format: expected dict, got {type(arguments).__name__}"
        }
    
    # Match mcp_llm-wheelsense validation approach: check for None explicitly
    room = arguments.get("room")
    device = arguments.get("device")
    action = arguments.get("action")
    
    # Debug logging to help diagnose argument extraction issues
    logger.debug(f"e_device_control arguments received: room={room}, device={device}, action={action}, full_args={arguments}")
    
    missing = []
    if room is None:
        missing.append("room")
    if device is None:
        missing.append("device")
    if action is None:
        missing.append("action")
    
    if missing:
        logger.warning(f"e_device_control missing arguments: {missing}, received arguments: {arguments}")
        return {
            "success": False,
            "tool": "e_device_control",
            "room": room or "",
            "device": device or "",
            "action": action or "",
            "previous_state": None,
            "new_state": None,
            "message": "",
            "error": f"Missing required arguments: {', '.join(missing)}"
        }
    
    # Handle case where device name might include room name (e.g., "Kitchen Light")
    # Check if device string contains a room name
    device_room = None
    device_only = device
    # English room names for matching (e.g., "Kitchen", "Living Room")
    english_room_names = ["Kitchen", "Bedroom", "Bathroom", "Living Room"]
    # Also check normalized room names (lowercase, no spaces)
    normalized_room_names = list(ROOM_DEVICES.keys())
    
    device_lower = device.lower() if device else ""
    for room_name in english_room_names + normalized_room_names:
        room_lower = room_name.lower().replace(" ", "")
        # Check if device string starts with room name (e.g., "Kitchen Light" or "kitchen light")
        if device_lower.startswith(room_lower):
            # Extract device part after room name
            remaining = device[len(room_name):].strip()
            if remaining:
                device_room = room_name
                device_only = remaining
                logger.debug(f"Extracted room from device name: '{device}' -> room='{device_room}', device='{device_only}'")
                break
    
    # Use extracted room if found, otherwise use provided room
    room_to_use = device_room if device_room else room
    device_to_use = device_only
    
    # Normalize room and device names
    normalized_room = normalize_room_name(room_to_use)
    normalized_device = normalize_device_name(device_to_use)
    
    # Validate room
    if normalized_room not in ROOM_DEVICES:
        return {
            "success": False,
            "tool": "e_device_control",
            "room": normalized_room,
            "device": normalized_device,
            "action": action.upper() if action else "",
            "previous_state": None,
            "new_state": None,
            "message": "",
            "error": f"Invalid room: {room}. Available rooms: {', '.join(ROOM_DEVICES.keys())}"
        }
    
    # Validate device for room
    available_devices = ROOM_DEVICES.get(normalized_room, [])
    if normalized_device not in available_devices:
        return {
            "success": False,
            "tool": "e_device_control",
            "room": normalized_room,
            "device": normalized_device,
            "action": action.upper() if action else "",
            "previous_state": None,
            "new_state": None,
            "message": "",
            "error": f"Device '{normalized_device}' not available in {normalized_room}. Available devices: {', '.join(available_devices)}"
        }
    
    # Get current state before change
    previous_state = await db.get_device_state(normalized_room, normalized_device)
    logger.debug(f"Previous state: {previous_state}")
    
    # Convert action to boolean
    action_upper = action.upper() if action else ""
    new_state = action_upper == "ON"
    logger.debug(f"New state: {new_state}")
    
    try:
        # Use shared control function (same logic as manual toggle /appliances/control)
        # This ensures identical behavior regardless of entry point
        from ..core.appliance_control import control_appliance_core
        
        result = await control_appliance_core(
            db=db,
            mqtt_handler=mqtt_handler,
            room=normalized_room,
            appliance=normalized_device,
            state=new_state,
            value=None
        )
        
        if not result.get("success"):
            return {
                "success": False,
                "tool": "e_device_control",
                "room": normalized_room,
                "device": normalized_device,
                "action": action_upper,
                "previous_state": previous_state,
                "new_state": None,
                "message": "",
                "error": result.get("error", "Failed to control device")
            }
        
        state_text = "ON" if new_state else "OFF"
        return {
            "success": True,
            "tool": "e_device_control",
            "room": normalized_room,
            "device": normalized_device,
            "action": action_upper,
            "previous_state": previous_state,
            "new_state": new_state,
            "message": f"Set {normalized_room} {normalized_device} to {state_text}",
            "error": None
        }
        
    except Exception as e:
        logger.error(f"Error controlling device: {e}", exc_info=True)
        return {
            "success": False,
            "tool": "e_device_control",
            "room": normalized_room if 'normalized_room' in locals() else (room or ""),
            "device": normalized_device if 'normalized_device' in locals() else (device or ""),
            "action": action_upper if 'action_upper' in locals() else (action.upper() if action else ""),
            "previous_state": previous_state if 'previous_state' in locals() else None,
            "new_state": None,
            "message": "",
            "error": f"Error controlling device: {str(e)}"
        }


def _normalize_time_format(time_str: str) -> str:
    """
    Normalize time string to HH:MM format.
    Handles formats like: "14.00", "14:00", "2.30", "14:30"
    
    Args:
        time_str: Time string in various formats
        
    Returns:
        Normalized time string in HH:MM format, or original if normalization fails
    """
    if not time_str:
        return time_str
    
    # Replace dot with colon
    time_str_normalized = time_str.replace(".", ":")
    
    # Parse and normalize
    try:
        parts = time_str_normalized.split(":")
        if len(parts) == 2:
            hours = int(parts[0])
            minutes = int(parts[1]) if parts[1] else 0
            # Validate range
            if 0 <= hours <= 23 and 0 <= minutes <= 59:
                return f"{hours:02d}:{minutes:02d}"
    except (ValueError, IndexError):
        pass
    
    return time_str  # Return original if normalization fails


def _extract_date_from_message(message: str) -> str:
    """
    Extract date from user message and convert to YYYY-MM-DD format.
    
    Handles:
    - Relative dates: "tomorrow", "next Monday", "next week"
    - Absolute dates: "March 15th", "15th March", "2024-03-15"
    - Implicit dates: no date mentioned = today
    
    Args:
        message: User message string
        
    Returns:
        Date string in YYYY-MM-DD format, or None if no date found (defaults to today)
    """
    if not message:
        return None
    
    from datetime import datetime, timedelta
    import re
    
    message_lower = message.lower().strip()
    today = datetime.now()
    
    # Relative dates
    if "tomorrow" in message_lower:
        tomorrow = today + timedelta(days=1)
        return tomorrow.strftime("%Y-%m-%d")
    
    if "next week" in message_lower:
        next_week = today + timedelta(days=7)
        return next_week.strftime("%Y-%m-%d")
    
    # Day of week patterns: "next Monday", "next monday", "next tuesday", etc.
    days_of_week = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6
    }
    
    for day_name, day_num in days_of_week.items():
        if f"next {day_name}" in message_lower:
            days_ahead = (day_num - today.weekday()) % 7
            if days_ahead == 0:  # If today is that day, go to next week
                days_ahead = 7
            target_date = today + timedelta(days=days_ahead)
            return target_date.strftime("%Y-%m-%d")
    
    # Absolute date patterns: "March 15th", "15th March", "March 15", "15 March"
    month_names = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12
    }
    
    # Pattern 1: "Month Day" or "Month Dayth"
    for month_name, month_num in month_names.items():
        pattern = rf"{month_name}\s+(\d{{1,2}})(?:st|nd|rd|th)?"
        match = re.search(pattern, message_lower)
        if match:
            day = int(match.group(1))
            try:
                target_date = datetime(today.year, month_num, day)
                if target_date < today:
                    target_date = datetime(today.year + 1, month_num, day)
                return target_date.strftime("%Y-%m-%d")
            except ValueError:
                pass
    
    # Pattern 2: "Day Month" or "Dayth Month"
    for month_name, month_num in month_names.items():
        pattern = rf"(\d{{1,2}})(?:st|nd|rd|th)?\s+{month_name}"
        match = re.search(pattern, message_lower)
        if match:
            day = int(match.group(1))
            try:
                target_date = datetime(today.year, month_num, day)
                if target_date < today:
                    target_date = datetime(today.year + 1, month_num, day)
                return target_date.strftime("%Y-%m-%d")
            except ValueError:
                pass
    
    # Pattern 3: YYYY-MM-DD format
    date_pattern = r"\d{4}-\d{2}-\d{2}"
    match = re.search(date_pattern, message)
    if match:
        date_str = match.group(0)
        try:
            parsed_date = datetime.strptime(date_str, "%Y-%m-%d")
            return parsed_date.strftime("%Y-%m-%d")
        except ValueError:
            pass
    
    # No date found - return None (will default to today)
    return None


def _is_one_time_activity(activity: str, user_message: str = None) -> bool:
    """
    Determine if an activity is a one-time event or recurring routine.
    
    Args:
        activity: Activity name
        user_message: Optional user message for context
        
    Returns:
        True if one-time event, False if recurring routine
    """
    if not activity:
        return True  # Default to one-time if no activity
    
    activity_lower = activity.lower()
    message_lower = (user_message or "").lower()
    
    # Known recurring activities (daily routines)
    recurring_keywords = [
        "wake up", "wake", "breakfast", "lunch", "dinner",
        "work", "continue working", "exercise", "morning exercise",
        "relaxation", "relaxation time", "prepare for bed", "sleep", "bedtime"
    ]
    
    # Check if activity matches recurring patterns
    for keyword in recurring_keywords:
        if keyword in activity_lower:
            # Check if user message overrides with "every day" or similar
            if user_message:
                recurring_phrases = ["every day", "daily", "always", "regularly", "every morning", "every evening"]
                if any(phrase in message_lower for phrase in recurring_phrases):
                    return False  # Explicitly recurring
            return False  # It's recurring
    
    # One-time event keywords
    one_time_keywords = [
        "meeting", "appointment", "doctor", "dentist", "gym",
        "visit", "event", "party", "wedding", "birthday",
        "conference", "seminar", "workshop", "class", "therapy",
        "checkup", "consultation", "session"
    ]
    
    # Check if activity matches one-time patterns
    for keyword in one_time_keywords:
        if keyword in activity_lower:
            return True  # It's one-time
    
    # Check user message for context clues
    if user_message:
        # Phrases that indicate one-time events
        one_time_phrases = [
            "i have a", "i have an", "i need to", "i'm going to",
            "i'm attending", "i'm visiting", "i'm going to the",
            "this afternoon", "this evening", "this morning"
        ]
        
        # Phrases that indicate recurring
        recurring_phrases = [
            "every day", "daily", "always", "usually", "regularly",
            "every morning", "every evening", "every week"
        ]
        
        for phrase in one_time_phrases:
            if phrase in message_lower:
                return True
        
        for phrase in recurring_phrases:
            if phrase in message_lower:
                return False
    
    # Default: If activity is not in known recurring list, assume one-time
    return True


def _extract_location_from_message(message: str) -> str:
    """
    Extract location/room name from user message.
    
    Looks for patterns like "in bedroom", "in living room", "in kitchen", etc.
    
    Args:
        message: User message string
        
    Returns:
        Room name (English) if found, None otherwise
    """
    if not message:
        return None
    
    message_lower = message.lower()
    
    # Room mappings
    room_patterns = {
        "bedroom": "Bedroom",
        "bathroom": "Bathroom",
        "kitchen": "Kitchen",
        "living room": "Living Room",
        "livingroom": "Living Room",
        "living": "Living Room"
    }
    
    # Look for "in [room]" pattern
    for room_pattern, room_name in room_patterns.items():
        if f"in {room_pattern}" in message_lower or f"in the {room_pattern}" in message_lower:
            return room_name
    
    return None


async def handle_schedule_modifier(db, mqtt_handler, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle schedule_modifier tool call.
    Modifies the user's schedule (add, delete, or change activities).
    Supports one-time events vs recurring activities, activity derivation, and date extraction.
    
    Args:
        db: Database instance
        mqtt_handler: MQTT handler instance
        arguments: Tool arguments (may include user_message for context)
        
    Returns:
        Tool execution result
    """
    # Import here to avoid circular dependencies
    from ..core.state_manager import StateManager, _validate_schedule_item
    from ..core.activity_derivation import ActivityDerivationService
    
    # Create StateManager and ActivityDerivationService
    state_manager = StateManager(db)
    activity_derivation = ActivityDerivationService()
    state_manager.set_activity_derivation(activity_derivation)
    
    modify_type = arguments.get("modify_type", "").lower()
    time = arguments.get("time", "")
    activity = arguments.get("activity", "")
    old_time = arguments.get("old_time", "")
    old_activity = arguments.get("old_activity", "")
    user_message = arguments.get("user_message", "")  # Extract from arguments if provided
    
    if modify_type not in ["add", "delete", "change"]:
        return {
            "success": False,
            "tool": "schedule_modifier",
            "modify_type": modify_type,
            "message": "",
            "error": f"Invalid modify_type: {modify_type}. Must be 'add', 'delete', or 'change'."
        }
    
    # Normalize time format if provided
    if time:
        time = _normalize_time_format(time)
    if old_time:
        old_time = _normalize_time_format(old_time)
    
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        
        if modify_type == "add":
            if not time:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "message": "",
                    "error": "time required for add operation"
                }
            
            if not activity:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "message": "",
                    "error": "activity required for add operation"
                }
            
            # Build schedule item with time and activity
            new_item = {"time": time, "activity": activity}
            
            # Apply activity derivation
            derived = activity_derivation.derive_fields(activity)
            if derived["action"]:
                new_item["action"] = derived["action"]
            if derived["location"]:
                new_item["location"] = derived["location"]
            
            # Override location if user specified it in the message
            if user_message:
                user_location = _extract_location_from_message(user_message)
                if user_location:
                    new_item["location"] = user_location
                    # Update action devices to use the new location if action exists
                    if "action" in new_item and new_item["action"] and "devices" in new_item["action"]:
                        for device_spec in new_item["action"]["devices"]:
                            device_spec["room"] = user_location
            
            # Override with explicitly provided fields if they were given
            if arguments.get("action"):
                new_item["action"] = arguments.get("action")
            if arguments.get("location"):
                new_item["location"] = arguments.get("location")
            
            # Validate the schedule item
            is_valid, error_msg = _validate_schedule_item(new_item)
            if not is_valid:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "message": "",
                    "error": f"Invalid schedule item: {error_msg}"
                }
            
            # Extract date from user message (or default to today)
            target_date = _extract_date_from_message(user_message) if user_message else None
            if target_date is None:
                target_date = today
            
            # Validate date is not in the past
            try:
                target_datetime = datetime.strptime(target_date, "%Y-%m-%d")
                if target_datetime.date() < datetime.now().date():
                    return {
                        "success": False,
                        "tool": "schedule_modifier",
                        "modify_type": modify_type,
                        "message": "",
                        "error": f"Cannot schedule items for past dates. Date '{target_date}' is in the past."
                    }
            except ValueError:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "message": "",
                    "error": f"Invalid date format: '{target_date}'. Expected YYYY-MM-DD format."
                }
            
            # Detect if this is a one-time event or recurring activity
            is_one_time = _is_one_time_activity(activity, user_message)
            
            if is_one_time:
                # One-time event: Add to one_time_events table
                await state_manager.add_schedule_addon(
                    target_date,
                    time,
                    activity,
                    action=new_item.get("action"),
                    location=new_item.get("location")
                )
                
                # If date is today, also add to today's daily clone
                if target_date == today:
                    daily_clone = await state_manager.get_daily_clone()
                    daily_clone.append(new_item)
                    daily_clone.sort(key=lambda x: x.get("time", ""))
                    await state_manager.set_daily_clone(daily_clone)
                
                message = f"Added one-time event '{activity}' at {time}"
                if target_date != today:
                    message += f" for {target_date}"
            else:
                # Recurring activity: Add to base schedule and today's clone if date is today
                if target_date == today:
                    # Add to today's daily clone
                    daily_clone = await state_manager.get_daily_clone()
                    daily_clone.append(new_item)
                    daily_clone.sort(key=lambda x: x.get("time", ""))
                    await state_manager.set_daily_clone(daily_clone)
                
                # Add to base schedule (for all future days)
                base_schedule = await state_manager.get_user_schedule()
                exists_in_base = any(item.get("time") == time for item in base_schedule)
                if not exists_in_base:
                    await state_manager.update_base_schedule([new_item.copy()])
                else:
                    await state_manager.update_base_schedule([new_item.copy()])
                
                message = f"Added recurring activity '{activity}' at {time}"
                if target_date != today:
                    message += f" (will appear in schedule starting from {target_date})"
            
            return {
                "success": True,
                "tool": "schedule_modifier",
                "modify_type": modify_type,
                "time": time,
                "activity": activity,
                "message": message,
                "error": None
            }
        
        elif modify_type == "delete":
            if not time:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "message": "",
                    "error": "time required for delete operation"
                }
            
            # Remove from today's daily clone
            daily_clone = await state_manager.get_daily_clone()
            found = False
            for idx, item in enumerate(daily_clone):
                if item.get("time") == time:
                    daily_clone.pop(idx)
                    found = True
                    break
            
            if found:
                await state_manager.set_daily_clone(daily_clone)
                return {
                    "success": True,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "time": time,
                    "message": f"Deleted schedule item at {time}",
                    "error": None
                }
            else:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "message": "",
                    "error": f"Schedule item at {time} not found in today's schedule"
                }
        
        elif modify_type == "change":
            if not old_time:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "message": "",
                    "error": "old_time required for change operation"
                }
            
            # At least one of time or activity must be provided
            if not time and not activity:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "message": "",
                    "error": "At least one of time or activity must be provided for change operation"
                }
            
            # Change item in today's daily clone
            daily_clone = await state_manager.get_daily_clone()
            found = False
            for idx, item in enumerate(daily_clone):
                if item.get("time") == old_time:
                    # Validate activity if old_activity provided
                    if old_activity and item.get("activity") != old_activity:
                        return {
                            "success": False,
                            "tool": "schedule_modifier",
                            "modify_type": modify_type,
                            "message": "",
                            "error": f"Activity mismatch: expected '{old_activity}' but found '{item.get('activity')}' at {old_time}"
                        }
                    
                    # Build new item with partial updates
                    new_item = {}
                    # Update time if provided, otherwise keep old time
                    if time:
                        new_item["time"] = time
                    else:
                        new_item["time"] = item.get("time")
                    # Update activity if provided, otherwise keep old activity
                    new_activity = activity if activity else item.get("activity")
                    new_item["activity"] = new_activity
                    
                    # Derive action/location from new activity
                    base_schedule = await state_manager.get_user_schedule()
                    base_item = next((it for it in base_schedule if it.get("time") == new_item["time"] and it.get("activity") == new_activity), None)
                    
                    if base_item:
                        # Preserve from base schedule
                        if "action" in base_item:
                            new_item["action"] = base_item["action"].copy()
                            if "devices" in new_item["action"]:
                                new_item["action"]["devices"] = [d.copy() for d in new_item["action"]["devices"]]
                        if "location" in base_item:
                            new_item["location"] = base_item["location"]
                    else:
                        # Derive from activity
                        derived = activity_derivation.derive_fields(new_activity)
                        if derived["action"]:
                            new_item["action"] = derived["action"]
                        if derived["location"]:
                            new_item["location"] = derived["location"]
                    
                    # Validate the new schedule item
                    is_valid, error_msg = _validate_schedule_item(new_item)
                    if not is_valid:
                        return {
                            "success": False,
                            "tool": "schedule_modifier",
                            "modify_type": modify_type,
                            "message": "",
                            "error": f"Invalid schedule item: {error_msg}"
                        }
                    
                    # Remove old item and add new item
                    old_activity_name = item.get("activity", "")
                    daily_clone.pop(idx)
                    daily_clone.append(new_item)
                    daily_clone.sort(key=lambda x: x.get("time", ""))
                    found = True
                    break
            
            if found:
                await state_manager.set_daily_clone(daily_clone)
                
                # Build message based on what was changed
                change_parts = []
                if time and time != old_time:
                    change_parts.append(f"time from {old_time} to {time}")
                if activity and activity != old_activity_name:
                    change_parts.append(f"activity to '{activity}'")
                change_msg = " and ".join(change_parts) if change_parts else "schedule item"
                
                return {
                    "success": True,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "old_time": old_time,
                    "time": new_item.get("time"),
                    "activity": new_item.get("activity"),
                    "message": f"Changed {change_msg}",
                    "error": None
                }
            else:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "message": "",
                    "error": f"Schedule item at {old_time} not found in today's schedule"
                }
        
        else:
            return {
                "success": False,
                "tool": "schedule_modifier",
                "modify_type": modify_type,
                "message": "",
                "error": f"Invalid modify_type: '{modify_type}'. Must be 'add', 'delete', or 'change'"
            }
        
    except Exception as e:
        logger.error(f"Error modifying schedule: {e}", exc_info=True)
        return {
            "success": False,
            "tool": "schedule_modifier",
            "modify_type": modify_type,
            "message": "",
            "error": f"Error modifying schedule: {str(e)}"
        }


async def handle_rag_query(db, mqtt_handler, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle rag_query tool call.
    Queries the RAG system for health knowledge.
    
    Args:
        db: Database instance
        mqtt_handler: MQTT handler instance
        arguments: Tool arguments (query, optional user_condition)
        
    Returns:
        Tool execution result with health knowledge chunks
    """
    from ..services.rag_retriever import get_rag_retriever
    
    query = arguments.get("query", "")
    user_condition = arguments.get("user_condition", "")
    
    # Validate query
    if not query or not isinstance(query, str):
        return {
            "success": False,
            "tool": "rag_query",
            "found": False,
            "chunks": None,
            "error": "Query must be a non-empty string"
        }
    
    # Get user condition from database if not provided
    if not user_condition:
        try:
            user_info = await db.get_user_info()
            user_condition = user_info.get("condition", "")
        except Exception as e:
            logger.warning(f"Failed to get user condition: {e}")
            user_condition = ""
    
    # Get RAG retriever
    try:
        rag_retriever = await get_rag_retriever()
        if not rag_retriever or not rag_retriever._initialized:
            return {
                "success": False,
                "tool": "rag_query",
                "found": False,
                "chunks": None,
                "error": "RAG system not available"
            }
    except Exception as e:
        logger.error(f"Failed to get RAG retriever: {e}", exc_info=True)
        return {
            "success": False,
            "tool": "rag_query",
            "found": False,
            "chunks": None,
            "error": f"RAG system error: {str(e)}"
        }
    
    # Build enhanced query: combine user query + user condition if available
    enhanced_query = query.strip()
    if user_condition and user_condition.strip():
        query_lower = query.lower().strip()
        condition_lower = user_condition.lower()
        
        # For exercise/activity queries, add wheelchair-specific terms if condition mentions wheelchair
        is_exercise_query = any(word in query_lower for word in ["exercise", "activity", "workout", "physical", "fitness", "movement"])
        has_wheelchair = "wheelchair" in condition_lower or "uses a wheelchair" in condition_lower
        
        if is_exercise_query and has_wheelchair:
            # Prioritize wheelchair exercise knowledge
            enhanced_query = f"{query.strip()} wheelchair exercises wheelchair users seated exercises"
        else:
            # General enhancement with key terms extraction
            key_terms = []
            
            # Extract mobility-related terms
            if "wheelchair" in condition_lower:
                key_terms.append("wheelchair")
            if "mobility" in condition_lower:
                key_terms.append("mobility")
            
            # Extract health condition terms
            health_conditions = ["diabetes", "hypertension", "arthritis", "copd", "dementia", "depression", "stroke", "parkinson"]
            for condition in health_conditions:
                if condition in condition_lower:
                    key_terms.append(condition)
                    break  # Usually only one primary condition
            
            # Build enhanced query with key terms prioritized
            if key_terms:
                enhanced_query = f"{query.strip()} {' '.join(key_terms)} {user_condition.strip()}"
            else:
                enhanced_query = f"{query.strip()} {user_condition.strip()}"
    
    try:
        # Call RAG retriever with higher threshold for better precision
        result = await rag_retriever.retrieve(enhanced_query, top_k=3, threshold=0.5)
        
        if result.get("found"):
            chunks = result.get("chunks", [])
            return {
                "success": True,
                "tool": "rag_query",
                "found": True,
                "chunks": chunks,
                "error": None
            }
        else:
            return {
                "success": True,
                "tool": "rag_query",
                "found": False,
                "chunks": None,
                "error": None
            }
    
    except Exception as e:
        logger.error(f"RAG retrieval error: {e}", exc_info=True)
        return {
            "success": False,
            "tool": "rag_query",
            "found": False,
            "chunks": None,
            "error": f"RAG retrieval error: {str(e)}"
        }


async def handle_get_current_state(db, mqtt_handler, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle get_current_state tool call.
    Retrieves current system state (location, devices, schedule).
    
    Args:
        db: Database instance
        mqtt_handler: MQTT handler instance
        arguments: Tool arguments (empty for this tool)
        
    Returns:
        Tool execution result with system state
    """
    try:
        # Get user info
        user_info = await db.get_user_info()
        
        # Get device states
        device_states = {}
        rooms = ["bedroom", "bathroom", "kitchen", "livingroom"]
        for room in rooms:
            appliances = await db.get_appliances_by_room(room)
            room_devices = {}
            for app in appliances:
                device_name = app.get("type", "").capitalize()
                room_devices[device_name] = {
                    "state": "ON" if app.get("state") == 1 else "OFF",
                    "room": room
                }
            if room_devices:
                device_states[room] = room_devices
        
        # Get schedule items
        schedule_items = await db.get_schedule_items()
        
        return {
            "success": True,
            "tool": "get_current_state",
            "current_location": user_info.get("current_location", "Unknown"),
            "devices": device_states,
            "schedule_items": schedule_items,
            "user_info": user_info,
            "message": "Retrieved current system state.",
            "error": None
        }
    
    except Exception as e:
        logger.error(f"Error getting current state: {e}", exc_info=True)
        return {
            "success": False,
            "tool": "get_current_state",
            "current_location": "",
            "devices": {},
            "schedule_items": [],
            "user_info": {},
            "message": "",
            "error": f"Failed to retrieve system state: {str(e)}"
        }


def register_all_tools(tool_registry) -> None:
    """
    Register all available tools with the tool registry.
    
    This function centralizes tool registration for both the main application
    and test suite, ensuring consistency.
    
    Args:
        tool_registry: ToolRegistry instance to register tools with
    """
    from .tool_registry import ToolDefinition
    
    # 1. chat_message
    tool_registry.register_tool(
        ToolDefinition(
            name="chat_message",
            description="Send a text message to the user. Use this for answering questions or providing information.",
            input_schema={
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "Message content to display"
                    }
                },
                "required": ["message"]
            },
            output_schema={}
        ),
        handle_chat_message
    )
    
    # 2. e_device_control
    tool_registry.register_tool(
        ToolDefinition(
            name="e_device_control",
            description="Control a device in a room. Turn devices ON or OFF. Available devices vary by room. REQUIRED for ANY device control - MUST call this tool to actually turn devices on/off. room: Actual room name from 'Current Location:' in CURRENT SYSTEM STATE (e.g., if state shows 'Current Location: Living Room', use room='Living Room'). If user doesn't specify a room, ALWAYS use the Current Location from system state.",
            input_schema={
                "type": "object",
                "properties": {
                    "room": {
                        "type": "string",
                        "description": "Room name (Bedroom, Bathroom, Kitchen, Living Room). MUST use the exact room name from 'Current Location:' in CURRENT SYSTEM STATE if user doesn't specify a room."
                    },
                    "device": {
                        "type": "string",
                        "description": "Device name (Light, AC, TV, Fan, Alarm)"
                    },
                    "action": {
                        "type": "string",
                        "enum": ["ON", "OFF"],
                        "description": "Action to perform: ON or OFF"
                    }
                },
                "required": ["room", "device", "action"]
            },
            output_schema={}
        ),
        handle_e_device_control
    )
    
    # 3. schedule_modifier
    tool_registry.register_tool(
        ToolDefinition(
            name="schedule_modifier",
            description="Modify the user's schedule. Add new activities, delete existing ones, or change times. System automatically detects if activity is recurring or one-time. Supports date extraction from user messages (e.g., 'tomorrow', 'next Monday').",
            input_schema={
                "type": "object",
                "properties": {
                    "modify_type": {
                        "type": "string",
                        "enum": ["add", "delete", "change"],
                        "description": "Type of modification: add, delete, or change"
                    },
                    "time": {
                        "type": "string",
                        "description": "Time in HH:MM format (e.g., '14:00'). Required for add and change operations."
                    },
                    "activity": {
                        "type": "string",
                        "description": "Activity name. Required for add, optional for change."
                    },
                    "user_message": {
                        "type": "string",
                        "description": "Optional user message for context (used for date extraction and one-time vs recurring detection)"
                    },
                    "old_time": {
                        "type": "string",
                        "description": "Original time to modify. Required for change operation."
                    },
                    "old_activity": {
                        "type": "string",
                        "description": "Original activity name for validation. Optional for change operation."
                    }
                },
                "required": ["modify_type"]
            },
            output_schema={}
        ),
        handle_schedule_modifier
    )
    
    # 4. rag_query
    tool_registry.register_tool(
        ToolDefinition(
            name="rag_query",
            description="Query the health knowledge base for information about health conditions, medications, exercises, or other health-related topics. Use this when the user asks health-related questions.",
            input_schema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Health-related query string"
                    },
                    "user_condition": {
                        "type": "string",
                        "description": "Optional user condition context (e.g., 'diabetes', 'wheelchair user'). If not provided, will be retrieved from user profile."
                    }
                },
                "required": ["query"]
            },
            output_schema={}
        ),
        handle_rag_query
    )
    
    # 5. get_current_state
    tool_registry.register_tool(
        ToolDefinition(
            name="get_current_state",
            description="Get a summary of current system state including user location, device states, and upcoming schedule items.",
            input_schema={
                "type": "object",
                "properties": {},
                "required": []
            },
            output_schema={}
        ),
        handle_get_current_state
    )
    
    logger.info(f"Registered {len(tool_registry.get_tools())} tools with tool registry")
