"""
State management for devices, user location, and schedules.
Wraps database operations and provides unified state interface.
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)

# Room name mapping: lowercase IDs to English names
ROOM_NAMES = {
    "bedroom": "Bedroom",
    "bathroom": "Bathroom",
    "kitchen": "Kitchen",
    "livingroom": "Living Room"
}

# Reverse mapping: English names to lowercase IDs
ROOM_IDS = {v: k for k, v in ROOM_NAMES.items()}

# Default user location
DEFAULT_USER_LOCATION = "Bedroom"


def _validate_schedule_item(item: dict) -> tuple[bool, str]:
    """
    Validate a schedule item structure.
    
    Validates required fields (time, activity) and optional fields (action, location) if present.
    
    Args:
        item: Schedule item dict to validate
        
    Returns:
        Tuple of (is_valid, error_message)
        - is_valid: True if item is valid, False otherwise
        - error_message: Empty string if valid, error description if invalid
    """
    # Validate required fields
    if not isinstance(item, dict):
        return False, "Schedule item must be a dictionary"
    
    # Check required field: time
    if "time" not in item:
        return False, "Schedule item missing required field: 'time'"
    
    time_str = item.get("time")
    if not isinstance(time_str, str) or not time_str.strip():
        return False, "Schedule item 'time' must be a non-empty string"
    
    # Validate time format (HH:MM)
    try:
        time_parts = time_str.strip().split(":")
        if len(time_parts) != 2:
            return False, f"Schedule item 'time' must be in HH:MM format, got: '{time_str}'"
        
        hours = int(time_parts[0])
        minutes = int(time_parts[1])
        
        if not (0 <= hours <= 23):
            return False, f"Schedule item 'time' hours must be 0-23, got: {hours}"
        if not (0 <= minutes <= 59):
            return False, f"Schedule item 'time' minutes must be 0-59, got: {minutes}"
    except (ValueError, IndexError):
        return False, f"Schedule item 'time' must be in HH:MM format, got: '{time_str}'"
    
    # Check required field: activity
    if "activity" not in item:
        return False, "Schedule item missing required field: 'activity'"
    
    activity = item.get("activity")
    if not isinstance(activity, str) or not activity.strip():
        return False, "Schedule item 'activity' must be a non-empty string"
    
    # Validate optional field: action (if present)
    if "action" in item:
        action = item.get("action")
        if not isinstance(action, dict):
            return False, "Schedule item 'action' must be a dictionary"
        
        if "devices" not in action:
            return False, "Schedule item 'action' must have 'devices' key"
        
        devices = action.get("devices")
        if not isinstance(devices, list):
            return False, "Schedule item 'action.devices' must be a list"
        
        # Validate each device in the list
        for idx, device_spec in enumerate(devices):
            if not isinstance(device_spec, dict):
                return False, f"Schedule item 'action.devices[{idx}]' must be a dictionary"
            
            # Check required device fields
            if "room" not in device_spec:
                return False, f"Schedule item 'action.devices[{idx}]' missing required field: 'room'"
            
            room = device_spec.get("room")
            if not isinstance(room, str) or not room.strip():
                return False, f"Schedule item 'action.devices[{idx}].room' must be a non-empty string"
            
            # Accept both lowercase IDs and English names
            room_normalized = _normalize_room_name(room)
            if room_normalized not in ROOM_NAMES and room_normalized not in ROOM_IDS:
                return False, f"Schedule item 'action.devices[{idx}].room' must be a valid room, got: '{room}'"
            
            if "device" not in device_spec:
                return False, f"Schedule item 'action.devices[{idx}]' missing required field: 'device'"
            
            device = device_spec.get("device")
            if not isinstance(device, str) or not device.strip():
                return False, f"Schedule item 'action.devices[{idx}].device' must be a non-empty string"
            
            if "state" not in device_spec:
                return False, f"Schedule item 'action.devices[{idx}]' missing required field: 'state'"
            
            state = device_spec.get("state")
            if state not in ["ON", "OFF"]:
                return False, f"Schedule item 'action.devices[{idx}].state' must be 'ON' or 'OFF', got: '{state}'"
    
    # Validate optional field: location (if present)
    if "location" in item:
        location = item.get("location")
        if not isinstance(location, str) or not location.strip():
            return False, "Schedule item 'location' must be a non-empty string"
        
        location_normalized = _normalize_room_name(location)
        if location_normalized not in ROOM_NAMES and location_normalized not in ROOM_IDS:
            return False, f"Schedule item 'location' must be a valid room, got: '{location}'"
    
    return True, ""


def _normalize_room_name(room: str) -> str:
    """
    Normalize room name to lowercase ID format.
    
    Handles all variations:
    - "Living Room" -> "livingroom"
    - "living room" -> "livingroom"
    - "livingroom" -> "livingroom"
    - "Bedroom" -> "bedroom"
    - "bedroom" -> "bedroom"
    
    Args:
        room: Room name (may be English name or lowercase ID)
        
    Returns:
        Lowercase room ID (e.g., "bedroom", "livingroom")
    """
    if not room:
        return ""
    
    room_lower = room.lower().strip()
    # Remove spaces for matching
    room_lower = room_lower.replace(" ", "")
    
    # Check if already normalized (direct match in ROOM_NAMES)
    if room_lower in ROOM_NAMES:
        return room_lower
    
    # Handle special case: "living" -> "livingroom"
    if room_lower == "living":
        return "livingroom"
    
    # If it's already a normalized ID (in ROOM_IDS values), return as-is
    # ROOM_IDS.values() = ["bedroom", "livingroom", "kitchen", "bathroom"]
    if room_lower in ROOM_IDS.values():
        return room_lower
    
    # Try to match against English names (normalized)
    # This handles cases where input is an English name like "Living Room" or "Bedroom"
    for english_name, room_id in ROOM_IDS.items():
        english_normalized = english_name.lower().replace(" ", "")
        if room_lower == english_normalized:
            return room_id
    
    # Fallback: return normalized lowercase (may be invalid, but let caller handle validation)
    return room_lower


def _room_to_english(room: str) -> str:
    """
    Convert room ID to English name.
    
    Args:
        room: Room ID (lowercase) or English name
        
    Returns:
        English room name (e.g., "Bedroom", "Living Room")
    """
    normalized = _normalize_room_name(room)
    return ROOM_NAMES.get(normalized, room)


class StateManager:
    """
    Manages the state of the smart environment system.
    Wraps database operations and provides unified state interface.
    
    Tracks:
    - current_location: User's current room location
    - device states: ON/OFF state for each device in each room
    - do_not_remind: List of items the system should not remind about
    - notification_preferences: List of "room device" strings for devices that should not trigger notifications
    """
    
    def __init__(self, db):
        """
        Initialize state manager with database.
        
        Args:
            db: Database instance (async)
        """
        self.db = db
        # Activity derivation will be set when available
        self._activity_derivation = None
    
    def set_activity_derivation(self, activity_derivation):
        """Set activity derivation service."""
        self._activity_derivation = activity_derivation
    
    # ========== Location Management ==========
    
    @property
    async def current_location(self) -> str:
        """Get the current user location (English name)."""
        location = await self.db.get_current_location()
        return _room_to_english(location) if location else DEFAULT_USER_LOCATION
    
    async def set_location(self, location: str) -> bool:
        """
        Set the user location.
        
        Args:
            location: Room name (English name or lowercase ID)
            
        Returns:
            True if successful, False if location doesn't exist
        """
        normalized = _normalize_room_name(location)
        if normalized in ROOM_NAMES:
            # Convert to English name for storage
            english_name = _room_to_english(normalized)
            return await self.db.set_current_location(english_name)
        return False
    
    # ========== Device State Management ==========
    
    async def get_device_state(self, room: str, device: str) -> bool:
        """
        Get the current state of a device.
        
        Args:
            room: Room name (English name or lowercase ID)
            device: Device name
            
        Returns:
            True if ON, False if OFF or device doesn't exist
        """
        normalized_room = _normalize_room_name(room)
        return await self.db.get_device_state(normalized_room, device)
    
    async def set_device_state(self, room: str, device: str, state: bool) -> bool:
        """
        Set the state of a device.
        
        Args:
            room: Room name (English name or lowercase ID)
            device: Device name
            state: True for ON, False for OFF
            
        Returns:
            True if successful, False if room/device doesn't exist
        """
        normalized_room = _normalize_room_name(room)
        return await self.db.set_device_state(normalized_room, device, state)
    
    async def get_room_devices(self, room: str) -> dict:
        """
        Get all devices and their states for a specific room.
        
        Args:
            room: Room name (English name or lowercase ID)
            
        Returns:
            Dictionary mapping device names to their states (True/False)
        """
        all_devices = await self.get_all_devices()
        normalized_room = _normalize_room_name(room)
        return all_devices.get(normalized_room, {}).copy()
    
    async def get_all_devices(self) -> dict:
        """
        Get the complete device state dictionary.
        
        Returns:
            Nested dictionary: {room_id: {device: state}}
            Room IDs are lowercase (e.g., "bedroom", "livingroom")
        """
        return await self.db.get_all_device_states()
    
    # ========== Do Not Remind Management ==========
    
    async def add_to_do_not_remind(self, item: str) -> None:
        """
        Add an item to the do_not_remind list.
        
        Args:
            item: Item to add (e.g., "turn off lights", "bedroom light")
        """
        await self.db.add_to_do_not_remind(item)
    
    async def remove_from_do_not_remind(self, item: str) -> bool:
        """
        Remove an item from the do_not_remind list.
        
        Args:
            item: Item to remove
            
        Returns:
            True if item was removed, False if not found
        """
        return await self.db.remove_from_do_not_remind(item)
    
    async def get_do_not_remind(self) -> list:
        """
        Get the complete do_not_remind list.
        
        Returns:
            List of items that should not be reminded about
        """
        return await self.db.get_do_not_remind()
    
    async def should_remind(self, item: str) -> bool:
        """
        Check if the system should remind about an item.
        
        Args:
            item: Item to check
            
        Returns:
            True if should remind, False if in do_not_remind list
        """
        do_not_remind = await self.get_do_not_remind()
        return item not in do_not_remind
    
    async def clear_do_not_remind(self) -> None:
        """Clear the entire do_not_remind list."""
        await self.db.clear_do_not_remind()
    
    # ========== Notification Preferences Management ==========
    
    async def set_notification_preference(self, room: str, device: str, do_not_notify: bool) -> bool:
        """
        Set notification preference for a specific device.
        
        When do_not_notify=True, the system will never ask about this device
        when it's ON in a different room than the user.
        
        Args:
            room: Room name (English name or lowercase ID)
            device: Device name
            do_not_notify: True to disable notifications for this device, False to enable
            
        Returns:
            True if successful, False if room/device doesn't exist
        """
        normalized_room = _normalize_room_name(room)
        # Check if device exists
        all_devices = await self.get_all_devices()
        if normalized_room not in all_devices or device not in all_devices.get(normalized_room, {}):
            return False
        
        return await self.db.set_notification_preference(normalized_room, device, do_not_notify)
    
    async def should_notify_about_device(self, room: str, device: str) -> bool:
        """
        Check if the system should notify about a device.
        
        Args:
            room: Room name (English name or lowercase ID)
            device: Device name
            
        Returns:
            True if should notify, False if notification is disabled for this device
        """
        normalized_room = _normalize_room_name(room)
        prefs = await self.db.get_notification_preferences()
        device_key = f"{normalized_room} {device}"
        return device_key not in prefs
    
    async def get_notification_preferences(self) -> list:
        """
        Get all notification preferences.
        
        Returns:
            List of "room device" strings for devices that should not trigger notifications
        """
        return await self.db.get_notification_preferences()
    
    async def clear_notification_preferences(self) -> None:
        """Clear all notification preferences."""
        await self.db.clear_notification_preferences()
    
    # ========== User Information Management ==========
    
    async def set_user_name(self, thai: str = "", english: str = "") -> None:
        """
        Set user name in Thai and/or English.
        
        Args:
            thai: User's Thai name
            english: User's English name
        """
        await self.db.set_user_name(thai=thai, english=english)
    
    async def get_user_name(self) -> dict:
        """
        Get user name.
        
        Returns:
            Dictionary with "thai" and "english" keys
        """
        user_info = await self.db.get_user_info()
        return user_info.get("name", {})
    
    async def set_user_schedule(self, schedule: list) -> None:
        """
        Set user's base schedule.
        
        Args:
            schedule: List of dictionaries with "time" and "activity" keys
                     Example: [{"time": "08:00", "activity": "Wake up"}]
        """
        await self.db.set_schedule_items(schedule)
    
    async def add_schedule_item(self, item: dict) -> None:
        """
        Add a single item to the base schedule.
        
        Args:
            item: Schedule item dict with "time" and "activity" keys
        """
        await self.db.add_schedule_item(item)
    
    async def remove_schedule_item(self, time: str) -> bool:
        """
        Remove a schedule item by time.
        
        Args:
            time: Time string (e.g., "08:00")
            
        Returns:
            True if removed, False if not found
        """
        return await self.db.delete_schedule_item_by_time(time)
    
    async def get_user_schedule(self) -> list:
        """
        Get user's base schedule.
        
        Returns:
            List of dictionaries with "time" and "activity" keys
        """
        return await self.db.get_schedule_items()
    
    async def set_user_condition(self, condition: str) -> None:
        """
        Set user's condition information (e.g., medical conditions).
        
        Args:
            condition: Condition description
        """
        await self.db.set_user_condition(condition)
    
    async def get_user_condition(self) -> str:
        """
        Get user's condition information.
        
        Returns:
            Condition description string
        """
        user_info = await self.db.get_user_info()
        return user_info.get("condition", "")
    
    # ========== One-Time Events Management ==========
    
    async def add_schedule_addon(self, date: str, time: str, activity: str, action: dict = None, location: str = None) -> None:
        """
        Add a temporary schedule item for a specific date (one-time event).
        This is for one-time events added by the LLM (e.g., "gym at 14:00 today").
        
        Args:
            date: Date string in YYYY-MM-DD format
            time: Time string (e.g., "14:00")
            activity: Activity description
            action: Optional device action dict (e.g., {"devices": [...]})
            location: Optional location string
        """
        event = {
            "date": date,
            "time": time,
            "activity": activity
        }
        if action:
            event["action"] = action
        if location:
            # Normalize location to English name
            event["location"] = _room_to_english(_normalize_room_name(location))
        await self.db.add_one_time_event(event)
    
    async def remove_schedule_addon(self, date: str, time: str = None) -> int:
        """
        Remove one-time event(s) for a specific date.
        If time is provided, remove only that specific event.
        If time is None, remove all one-time events for that date.
        
        Args:
            date: Date string in YYYY-MM-DD format
            time: Optional time string to remove specific event
            
        Returns:
            Number of one-time events removed
        """
        return await self.db.delete_one_time_events(date, time)
    
    async def cleanup_old_one_time_events(self) -> int:
        """
        Remove one-time events older than today to prevent accumulation.
        
        Returns:
            Number of events removed
        """
        today = datetime.now().strftime("%Y-%m-%d")
        return await self.db.cleanup_old_one_time_events(today)
    
    async def clear_all_one_time_events(self) -> int:
        """
        Clear all one-time events (for demonstration purposes).
        
        Returns:
            Number of events cleared
        """
        return await self.db.delete_all_one_time_events()
    
    async def get_schedule_addons(self, date: str = None) -> list:
        """
        Get one-time events. If date is provided, filter by that date.
        
        Args:
            date: Optional date string in YYYY-MM-DD format to filter
            
        Returns:
            List of dictionaries with "date", "time", and "activity" keys
        """
        return await self.db.get_one_time_events(date)
    
    # ========== Daily Clone Management ==========
    
    async def get_daily_clone(self, current_date: str = None) -> list:
        """
        Get today's schedule clone. If it doesn't exist or is outdated, create it from base schedule.
        Merges one-time events for today into the clone.
        
        Args:
            current_date: Optional date string in YYYY-MM-DD format. If None, uses current date.
                         This allows custom clock timestamps to work correctly.
        
        Returns:
            List of schedule items for today: [{"time": str, "activity": str}, ...]
        """
        if current_date is None:
            today = datetime.now().strftime("%Y-%m-%d")
        else:
            today = current_date
        
        # Get existing clone from database
        existing_clone = await self.db.get_daily_clone(today)
        
        # If no clone exists, create new one
        if existing_clone is None:
            # Start with base schedule (deep copy to avoid reference issues)
            base_schedule = await self.db.get_schedule_items()
            base_schedule = [item.copy() for item in base_schedule]
            
            # Merge one-time events for today into the clone
            one_time_events_for_today = await self.db.get_one_time_events(today)
            if one_time_events_for_today:
                for event in one_time_events_for_today:
                    # Convert one-time event format to schedule item format
                    schedule_item = {
                        "time": event.get("time", ""),
                        "activity": event.get("activity", "")
                    }
                    # Include optional fields if present in the event
                    if "action" in event:
                        schedule_item["action"] = event["action"]
                    if "location" in event:
                        schedule_item["location"] = event["location"]
                    
                    # Derive action/location if not present and activity derivation is available
                    if self._activity_derivation and ("action" not in schedule_item or "location" not in schedule_item):
                        derived = self._activity_derivation.derive_fields(schedule_item.get("activity", ""))
                        if "action" not in schedule_item and derived["action"]:
                            schedule_item["action"] = derived["action"]
                        if "location" not in schedule_item and derived["location"]:
                            schedule_item["location"] = derived["location"]
                    
                    # Check if item with same time already exists
                    existing_idx = None
                    for idx, item in enumerate(base_schedule):
                        if item.get("time") == schedule_item.get("time"):
                            existing_idx = idx
                            break
                    
                    if existing_idx is not None:
                        # Replace existing item at this time
                        base_schedule[existing_idx] = schedule_item
                    else:
                        # Add new item
                        base_schedule.append(schedule_item)
                
                # Sort by time
                base_schedule.sort(key=lambda x: x.get("time", ""))
            
            # Store in database
            await self.db.set_daily_clone(today, base_schedule)
            existing_clone = base_schedule
        
        # Ensure all items in daily_clone have derived action/location if missing
        final_clone = []
        for item in existing_clone:
            item_copy = item.copy()
            activity = item_copy.get("activity")
            
            # If item lacks action/location, derive them
            if self._activity_derivation and activity and ("action" not in item_copy or "location" not in item_copy):
                derived = self._activity_derivation.derive_fields(activity)
                if "action" not in item_copy and derived["action"]:
                    item_copy["action"] = derived["action"]
                if "location" not in item_copy and derived["location"]:
                    item_copy["location"] = derived["location"]
            
            final_clone.append(item_copy)
        
        # Return copy of the current daily_clone with derived fields
        return final_clone
    
    async def set_daily_clone(self, schedule_items: list) -> bool:
        """
        Set today's schedule clone. This replaces the entire daily clone.
        
        Args:
            schedule_items: List of schedule items: [{"time": str, "activity": str}, ...]
            
        Returns:
            True if successful
        """
        today = datetime.now().strftime("%Y-%m-%d")
        await self.db.set_daily_clone(today, schedule_items)
        return True
    
    async def update_base_schedule(self, schedule_items: list) -> bool:
        """
        Update the base schedule (original schedule) with new items.
        This makes schedule modifications recurring for all future days.
        
        Args:
            schedule_items: List of schedule items to add/update
        
        Returns:
            True if successful
        """
        base_schedule = await self.db.get_schedule_items()
        # Merge new items into base schedule
        for new_item in schedule_items:
            time = new_item.get("time")
            # Check if item with same time exists
            existing_idx = None
            for idx, item in enumerate(base_schedule):
                if item.get("time") == time:
                    existing_idx = idx
                    break
            
            if existing_idx is not None:
                # Update existing item - delete and re-add
                await self.db.delete_schedule_item_by_time(time)
                await self.db.add_schedule_item(new_item)
            else:
                # Add new item
                await self.db.add_schedule_item(new_item)
        
        return True
    
    # ========== User Information ==========
    
    async def get_user_info(self, include_one_time_events: bool = True) -> dict:
        """
        Get complete user information.
        
        Args:
            include_one_time_events: If True, include one-time events (for LLM). If False, exclude (for UI).
            
        Returns:
            Dictionary with name, schedule, condition, and optionally one_time_events
        """
        db_user_info = await self.db.get_user_info()
        info = {
            "name": db_user_info.get("name", {}),
            "schedule": await self.db.get_schedule_items(),
            "condition": db_user_info.get("condition", "")
        }
        if include_one_time_events:
            info["one_time_events"] = await self.db.get_one_time_events()
        return info
    
    # ========== State Summary ==========
    
    async def get_state_summary(self, custom_date: str = None) -> dict:
        """
        Get a complete summary of the current state.
        
        Args:
            custom_date: Optional custom date string in YYYY-MM-DD format (for custom clock)
        
        Returns:
            Dictionary with current_location, devices, do_not_remind, notification_preferences, and user_info
        """
        # Get today's active schedule (daily clone) for LLM context
        daily_clone = await self.get_daily_clone(current_date=custom_date)
        
        # Get current location (English name)
        current_loc = await self.current_location
        
        return {
            "current_location": current_loc,
            "devices": await self.get_all_devices(),
            "do_not_remind": await self.get_do_not_remind(),
            "notification_preferences": await self.get_notification_preferences(),
            "user_info": await self.get_user_info(include_one_time_events=True),
            "today_active_schedule": daily_clone
        }
    
    async def detect_potential_issues(self) -> list:
        """
        Detect situations where something might be "off" in the house.
        
        This identifies devices that are ON in rooms other than where the user is located.
        These may be unintended and worth notifying the user about.
        
        Returns:
            List of dictionaries with format:
            [
                {
                    "room": str,
                    "device": str,
                    "state": bool,
                    "user_location": str
                },
                ...
            ]
        """
        current_location = await self.current_location
        current_location_id = _normalize_room_name(current_location)
        all_devices = await self.get_all_devices()
        issues = []
        
        for room, room_devices in all_devices.items():
            # Skip the user's current room
            if room == current_location_id:
                continue
            
            # Check each device in this room
            for device, state in room_devices.items():
                # If device is ON and we should notify about it
                if state and await self.should_notify_about_device(room, device):
                    issues.append({
                        "room": _room_to_english(room),
                        "device": device,
                        "state": state,
                        "user_location": current_location
                    })
        
        return issues

