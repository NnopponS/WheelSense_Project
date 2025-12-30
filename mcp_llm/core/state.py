"""
State management for devices, user location, and reminders.
In-memory state only - no persistence.
"""

from config import ROOMS, DEFAULT_USER_LOCATION
from core.activity_derivation import ActivityDerivationService


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
            
            if room not in ROOMS:
                return False, f"Schedule item 'action.devices[{idx}].room' must be a valid room from {list(ROOMS.keys())}, got: '{room}'"
            
            if "device" not in device_spec:
                return False, f"Schedule item 'action.devices[{idx}]' missing required field: 'device'"
            
            device = device_spec.get("device")
            if not isinstance(device, str) or not device.strip():
                return False, f"Schedule item 'action.devices[{idx}].device' must be a non-empty string"
            
            if device not in ROOMS[room]:
                return False, f"Schedule item 'action.devices[{idx}].device' must be a valid device in {room} from {ROOMS[room]}, got: '{device}'"
            
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
        
        if location not in ROOMS:
            return False, f"Schedule item 'location' must be a valid room from {list(ROOMS.keys())}, got: '{location}'"
    
    return True, ""


class StateManager:
    """
    Manages the state of the smart environment system.
    
    Tracks:
    - current_location: User's current room location
    - device states: ON/OFF state for each device in each room
    - do_not_remind: List of items the system should not remind about
    - notification_preferences: Dict tracking which devices should not trigger notifications
                                Format: {(room, device): bool} where True means "don't notify"
    """
    
    def __init__(self):
        """Initialize state with all devices OFF and empty reminder list."""
        self._current_location = DEFAULT_USER_LOCATION
        self._devices = {}
        self._do_not_remind = []
        self._notification_preferences = {}  # {(room, device): True} means don't notify
        self._activity_derivation = ActivityDerivationService()  # Activity derivation service
        
        # Initialize user information with mock-up data
        self._user_info = {
            "name": {
                "thai": "สมชาย ใจดี",
                "english": "Somchai Jaidee"
            },
            "schedule": [
                {
                    "time": "07:00",
                    "activity": "Wake up",
                    "action": {
                        "devices": [
                            {"room": "Bedroom", "device": "Alarm", "state": "ON"},
                            {"room": "Bedroom", "device": "Light", "state": "ON"}
                        ]
                    },
                    "location": "Bedroom"
                },
                {
                    "time": "07:30",
                    "activity": "Morning exercise"
                },
                {
                    "time": "08:00",
                    "activity": "Breakfast",
                    "location": "Kitchen"
                },
                {
                    "time": "09:00",
                    "activity": "Work",
                    "action": {
                        "devices": [
                            {"room": "Living Room", "device": "Light", "state": "ON"},
                            {"room": "Living Room", "device": "AC", "state": "ON"}
                        ]
                    },
                    "location": "Living Room"
                },
                {
                    "time": "12:00",
                    "activity": "Lunch",
                    "location": "Kitchen"
                },
                {
                    "time": "13:00",
                    "activity": "Continue Working",
                    "action": {
                        "devices": [
                            {"room": "Living Room", "device": "Light", "state": "ON"},
                            {"room": "Living Room", "device": "AC", "state": "ON"}
                        ]
                    },
                    "location": "Living Room"
                },
                {
                    "time": "18:00",
                    "activity": "Dinner",
                    "location": "Kitchen"
                },
                {
                    "time": "20:00",
                    "activity": "Relaxation time"
                },
                {
                    "time": "22:00",
                    "activity": "Prepare for bed",
                    "action": {
                        "devices": [
                            {"room": "Bedroom", "device": "AC", "state": "ON"},
                            {"room": "Bedroom", "device": "Light", "state": "ON"}
                        ]
                    },
                    "location": "Bedroom"
                },
                {
                    "time": "23:00",
                    "activity": "Sleep",
                    "action": {
                        "devices": [
                            {"room": "Bedroom", "device": "Light", "state": "OFF"}
                        ]
                    },
                    "location": "Bedroom"
                }
            ],
            "condition": "Mild diabetes (Type 2) - requires blood sugar monitoring. Allergic to dust mites. Uses a wheelchair for mobility.",
            "one_time_events": [],  # List of {"date": str, "time": str, "activity": str} - one-time events added by LLM (user can't see/edit)
            "schedule_modifications": {
                "daily_clone": None,  # Cloned copy of original schedule for today: [{"time": str, "activity": str}, ...]
                "daily_clone_date": None  # Date when daily_clone was created (YYYY-MM-DD)
            }
        }
        
        # Initialize all devices to OFF
        for room, device_list in ROOMS.items():
            self._devices[room] = {device: False for device in device_list}
    
    # ========== Location Management ==========
    
    @property
    def current_location(self) -> str:
        """Get the current user location."""
        return self._current_location
    
    def set_location(self, location: str) -> bool:
        """
        Set the user location.
        
        Args:
            location: Room name (must exist in ROOMS config)
            
        Returns:
            True if successful, False if location doesn't exist
        """
        if location in ROOMS:
            self._current_location = location
            return True
        return False
    
    # ========== Device State Management ==========
    
    def get_device_state(self, room: str, device: str) -> bool:
        """
        Get the current state of a device.
        
        Args:
            room: Room name
            device: Device name
            
        Returns:
            True if ON, False if OFF or device doesn't exist
        """
        return self._devices.get(room, {}).get(device, False)
    
    def set_device_state(self, room: str, device: str, state: bool) -> bool:
        """
        Set the state of a device.
        
        Args:
            room: Room name
            device: Device name
            state: True for ON, False for OFF
            
        Returns:
            True if successful, False if room/device doesn't exist
        """
        print(f"[STATE DEBUG] set_device_state called: room='{room}', device='{device}', state={state}")
        print(f"[STATE DEBUG] Available rooms: {list(self._devices.keys())}")
        if room in self._devices:
            print(f"[STATE DEBUG] Room '{room}' found. Available devices: {list(self._devices[room].keys())}")
            if device in self._devices[room]:
                old_state = self._devices[room][device]
                self._devices[room][device] = state
                print(f"[STATE DEBUG] Device state updated: {room}/{device} {old_state} -> {state}")
                return True
            else:
                print(f"[STATE DEBUG] ERROR: Device '{device}' not found in room '{room}'")
        else:
            print(f"[STATE DEBUG] ERROR: Room '{room}' not found")
        return False
    
    def get_room_devices(self, room: str) -> dict:
        """
        Get all devices and their states for a specific room.
        
        Args:
            room: Room name
            
        Returns:
            Dictionary mapping device names to their states (True/False)
        """
        return self._devices.get(room, {}).copy()
    
    def get_all_devices(self) -> dict:
        """
        Get the complete device state dictionary.
        
        Returns:
            Nested dictionary: {room: {device: state}}
        """
        return {
            room: devices.copy()
            for room, devices in self._devices.items()
        }
    
    # ========== Do Not Remind Management ==========
    
    def add_to_do_not_remind(self, item: str) -> None:
        """
        Add an item to the do_not_remind list.
        
        Args:
            item: Item to add (e.g., "turn off lights", "bedroom light1")
        """
        if item not in self._do_not_remind:
            self._do_not_remind.append(item)
    
    def remove_from_do_not_remind(self, item: str) -> bool:
        """
        Remove an item from the do_not_remind list.
        
        Args:
            item: Item to remove
            
        Returns:
            True if item was removed, False if not found
        """
        if item in self._do_not_remind:
            self._do_not_remind.remove(item)
            return True
        return False
    
    def get_do_not_remind(self) -> list:
        """
        Get the complete do_not_remind list.
        
        Returns:
            List of items that should not be reminded about
        """
        return self._do_not_remind.copy()
    
    def should_remind(self, item: str) -> bool:
        """
        Check if the system should remind about an item.
        
        Args:
            item: Item to check
            
        Returns:
            True if should remind, False if in do_not_remind list
        """
        return item not in self._do_not_remind
    
    def clear_do_not_remind(self) -> None:
        """Clear the entire do_not_remind list."""
        self._do_not_remind.clear()
    
    # ========== Notification Preferences Management ==========
    
    def set_notification_preference(self, room: str, device: str, do_not_notify: bool) -> bool:
        """
        Set notification preference for a specific device.
        
        When do_not_notify=True, the system will never ask about this device
        when it's ON in a different room than the user.
        
        Args:
            room: Room name
            device: Device name
            do_not_notify: True to disable notifications for this device, False to enable
            
        Returns:
            True if successful, False if room/device doesn't exist
        """
        if room not in self._devices or device not in self._devices.get(room, {}):
            return False
        
        key = (room, device)
        if do_not_notify:
            self._notification_preferences[key] = True
        else:
            # Remove preference if enabling notifications
            self._notification_preferences.pop(key, None)
        
        return True
    
    def should_notify_about_device(self, room: str, device: str) -> bool:
        """
        Check if the system should notify about a device.
        
        Args:
            room: Room name
            device: Device name
            
        Returns:
            True if should notify, False if notification is disabled for this device
        """
        key = (room, device)
        return not self._notification_preferences.get(key, False)
    
    def get_notification_preferences(self) -> dict:
        """
        Get all notification preferences.
        
        Returns:
            Dictionary mapping (room, device) tuples to boolean (True = don't notify)
        """
        return self._notification_preferences.copy()
    
    def clear_notification_preferences(self) -> None:
        """Clear all notification preferences."""
        self._notification_preferences.clear()
    
    # ========== User Information Management ==========
    
    def set_user_name(self, thai: str = "", english: str = "") -> None:
        """
        Set user name in Thai and/or English.
        
        Args:
            thai: User's Thai name
            english: User's English name
        """
        if thai:
            self._user_info["name"]["thai"] = thai
        if english:
            self._user_info["name"]["english"] = english
    
    def get_user_name(self) -> dict:
        """
        Get user name.
        
        Returns:
            Dictionary with "thai" and "english" keys
        """
        return self._user_info["name"].copy()
    
    def set_user_schedule(self, schedule: list) -> None:
        """
        Set user's daily schedule.
        
        Args:
            schedule: List of dictionaries with "time" and "activity" keys
                     Example: [{"time": "08:00", "activity": "Wake up"}]
        """
        self._user_info["schedule"] = schedule.copy() if schedule else []
    
    def add_schedule_item(self, time: str, activity: str) -> None:
        """
        Add a single item to the daily schedule.
        
        Args:
            time: Time string (e.g., "08:00")
            activity: Activity description
        """
        self._user_info["schedule"].append({"time": time, "activity": activity})
    
    def remove_schedule_item(self, index: int) -> bool:
        """
        Remove a schedule item by index.
        
        Args:
            index: Index of the item to remove
            
        Returns:
            True if removed, False if index out of range
        """
        if 0 <= index < len(self._user_info["schedule"]):
            self._user_info["schedule"].pop(index)
            return True
        return False
    
    def get_user_schedule(self) -> list:
        """
        Get user's daily schedule.
        
        Returns:
            List of dictionaries with "time" and "activity" keys
        """
        return [item.copy() for item in self._user_info["schedule"]]
    
    def set_user_condition(self, condition: str) -> None:
        """
        Set user's condition information (e.g., medical conditions).
        
        Args:
            condition: Condition description
        """
        self._user_info["condition"] = condition
    
    def get_user_condition(self) -> str:
        """
        Get user's condition information.
        
        Returns:
            Condition description string
        """
        return self._user_info["condition"]
    
    def add_schedule_addon(self, date: str, time: str, activity: str) -> None:
        """
        Add a temporary schedule item for a specific date (LLM only).
        This is for one-time events added by the LLM (e.g., "gym at 14:00 today").
        
        Args:
            date: Date string in YYYY-MM-DD format
            time: Time string (e.g., "14:00")
            activity: Activity description
        """
        self._user_info["one_time_events"].append({
            "date": date,
            "time": time,
            "activity": activity
        })
    
    def remove_schedule_addon(self, date: str, time: str = None) -> int:
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
        initial_count = len(self._user_info["one_time_events"])
        if time:
            self._user_info["one_time_events"] = [
                item for item in self._user_info["one_time_events"]
                if not (item["date"] == date and item["time"] == time)
            ]
        else:
            self._user_info["one_time_events"] = [
                item for item in self._user_info["one_time_events"]
                if item["date"] != date
            ]
        return initial_count - len(self._user_info["one_time_events"])
    
    def cleanup_old_one_time_events(self) -> int:
        """
        Remove one-time events older than today to prevent accumulation.
        Phase 5: One-Time Events Cleanup
        
        Returns:
            Number of events removed
        """
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        
        initial_count = len(self._user_info["one_time_events"])
        self._user_info["one_time_events"] = [
            item for item in self._user_info["one_time_events"]
            if item.get("date", "") >= today  # Keep today and future events
        ]
        removed_count = initial_count - len(self._user_info["one_time_events"])
        
        if removed_count > 0:
            print(f"[CONTEXT] Cleaned up {removed_count} old one-time events (kept {len(self._user_info['one_time_events'])} events)")
        
        return removed_count
    
    def get_schedule_addons(self, date: str = None) -> list:
        """
        Get one-time events. If date is provided, filter by that date.
        
        Args:
            date: Optional date string in YYYY-MM-DD format to filter
            
        Returns:
            List of dictionaries with "date", "time", and "activity" keys
        """
        if date:
            return [
                item.copy() for item in self._user_info["one_time_events"]
                if item["date"] == date
            ]
        return [item.copy() for item in self._user_info["one_time_events"]]
    
    # ========== Schedule Modifications Management ==========
    
    def get_daily_clone(self, current_date: str = None) -> list:
        """
        Get today's schedule clone. If it doesn't exist or is outdated, create it from original schedule.
        Merges one-time events for today into the clone.
        
        When day changes:
        - Forgets past day's clone
        - Clones original schedule
        - Merges one_time_events (one-time items) for the new day
        - Stores date as metadata (daily_clone_date)
        
        Args:
            current_date: Optional date string in YYYY-MM-DD format. If None, uses current date.
                         This allows custom clock timestamps to work correctly.
        
        Returns:
            List of schedule items for today: [{"time": str, "activity": str}, ...]
        """
        from datetime import datetime
        if current_date is None:
            today = datetime.now().strftime("%Y-%m-%d")
        else:
            today = current_date
        
        mods = self._user_info["schedule_modifications"]
        clone_date = mods.get("daily_clone_date")
        existing_clone = mods.get("daily_clone")
        
        # Check if clone should be reset based on calendar day comparison
        # This ensures that modifications made on the same day are preserved even if
        # date strings differ slightly (e.g., due to timezone or custom clock calculations)
        should_reset = False
        
        if existing_clone is None:
            # No clone exists - create new one
            should_reset = True
        elif clone_date is None:
            # Clone exists but no date stored - reset to be safe
            should_reset = True
            print(f"[SCHEDULE CLONE] Clone exists but no date stored - resetting")
        else:
            # Clone exists with a date - check if dates are for different calendar days
            try:
                clone_date_obj = datetime.strptime(clone_date, "%Y-%m-%d")
                today_date_obj = datetime.strptime(today, "%Y-%m-%d")
                
                # Only reset if clone is for a different calendar day
                if clone_date_obj.date() != today_date_obj.date():
                    should_reset = True
                    print(f"[SCHEDULE CLONE] Clone date {clone_date} is different calendar day from {today} - resetting clone")
                else:
                    # Same calendar day - preserve existing clone and its modifications
                    should_reset = False
                    print(f"[SCHEDULE CLONE] Clone date {clone_date} matches {today} (same calendar day) - preserving existing clone with {len(existing_clone)} items")
            except ValueError as e:
                # Invalid date format - reset to be safe
                should_reset = True
                print(f"[SCHEDULE CLONE] Invalid clone_date format '{clone_date}' - resetting clone: {e}")
        
        # If no clone exists or clone is for a different day, create new clone
        if should_reset:
            # Day changed or no clone exists - reset and create new clone
            print(f"[SCHEDULE CLONE] Day changed from {clone_date} to {today} - creating new clone")
            
            # Start with original schedule clone
            base_schedule = [item.copy() for item in self._user_info["schedule"]]
            mods["daily_clone"] = base_schedule
            print(f"[SCHEDULE CLONE] Using original schedule ({len(base_schedule)} items)")
            
            # Merge one_time_events (one-time items) for today into the clone
            one_time_events_for_today = [item for item in self._user_info["one_time_events"] if item.get("date") == today]
            if one_time_events_for_today:
                print(f"[SCHEDULE CLONE] Merging {len(one_time_events_for_today)} one-time events for {today}")
                for event in one_time_events_for_today:
                    # Convert one-time event format to schedule item format
                    schedule_item = {
                        "time": event.get("time", ""),
                        "activity": event.get("activity", "")
                    }
                    # Include optional fields if present in the event (preserve if already set)
                    if "action" in event:
                        schedule_item["action"] = event["action"]
                    if "location" in event:
                        schedule_item["location"] = event["location"]
                    
                    # Derive action/location if not present in event
                    if "action" not in schedule_item and "location" not in schedule_item:
                        derived = self._activity_derivation.derive_fields(schedule_item.get("activity", ""))
                        if derived["action"]:
                            schedule_item["action"] = derived["action"]
                        if derived["location"]:
                            schedule_item["location"] = derived["location"]
                    
                    # Check if item with same time already exists
                    existing_idx = None
                    for idx, item in enumerate(mods["daily_clone"]):
                        if item.get("time") == schedule_item.get("time"):
                            existing_idx = idx
                            break
                    
                    if existing_idx is not None:
                        # Replace existing item at this time
                        mods["daily_clone"][existing_idx] = schedule_item
                    else:
                        # Add new item
                        mods["daily_clone"].append(schedule_item)
                
                # Sort by time
                mods["daily_clone"].sort(key=lambda x: x.get("time", ""))
            
            # Store date as metadata
            mods["daily_clone_date"] = today
            print(f"[SCHEDULE CLONE] Created new daily_clone for {today} with {len(mods['daily_clone'])} items")
        else:
            # Clone exists and is for today - return it (preserving any modifications)
            print(f"[SCHEDULE CLONE] Using existing daily_clone for {today} with {len(existing_clone)} items")
        
        # Ensure all items in daily_clone have derived action/location if missing
        # This guarantees that notifications will always have these fields available
        final_clone = []
        for item in mods["daily_clone"]:
            item_copy = item.copy()
            activity = item_copy.get("activity")
            
            # If item lacks action/location, derive them
            if activity and ("action" not in item_copy or "location" not in item_copy):
                derived = self._activity_derivation.derive_fields(activity)
                if "action" not in item_copy and derived["action"]:
                    item_copy["action"] = derived["action"]
                if "location" not in item_copy and derived["location"]:
                    item_copy["location"] = derived["location"]
            
            final_clone.append(item_copy)
        
        # Return copy of the current daily_clone with derived fields
        return final_clone
    
    def set_daily_clone(self, schedule_items: list) -> bool:
        """
        Set today's schedule clone. This replaces the entire daily clone.
        
        Args:
            schedule_items: List of schedule items: [{"time": str, "activity": str}, ...]
            
        Returns:
            True if successful
        """
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        
        mods = self._user_info["schedule_modifications"]
        mods["daily_clone"] = [item.copy() for item in schedule_items]
        mods["daily_clone_date"] = today
        return True
    
    def update_base_schedule(self, schedule_items: list) -> bool:
        """
        Update the base schedule (original schedule) with new items.
        This makes schedule modifications recurring for all future days.
        
        Args:
            schedule_items: List of schedule items to add/update
            
        Returns:
            True if successful
        """
        base_schedule = self._user_info["schedule"]
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
                # Update existing item
                base_schedule[existing_idx] = new_item.copy()
                print(f"[STATE] Updated base schedule item at {time}")
            else:
                # Add new item
                base_schedule.append(new_item.copy())
                print(f"[STATE] Added new item to base schedule at {time}")
        
        # Sort by time
        base_schedule.sort(key=lambda x: x.get("time", ""))
        return True
    
    def update_daily_clone_item(self, time: str, activity: str = None, remove: bool = False) -> bool:
        """
        Update a single item in today's schedule clone.
        
        Args:
            time: Time string (e.g., "08:00")
            activity: New activity (if None and remove=False, item is removed)
            remove: If True, remove the item with this time
            
        Returns:
            True if successful, False if item not found (when removing)
        """
        # Ensure daily clone exists
        self.get_daily_clone()
        
        mods = self._user_info["schedule_modifications"]
        clone = mods["daily_clone"]
        
        # CRITICAL: Ensure we're modifying the actual list, not a copy
        if clone is None:
            # Should not happen if get_daily_clone() was called, but safety check
            self.get_daily_clone()
            clone = mods["daily_clone"]
        
        # Normalize the input time for consistent matching
        normalized_input_time = None
        try:
            time_parts = time.strip().split(":")
            if len(time_parts) == 2:
                hours = int(time_parts[0])
                minutes = int(time_parts[1])
                normalized_input_time = f"{hours:02d}:{minutes:02d}"
        except (ValueError, IndexError):
            pass  # Will use exact match if normalization fails
        
        # Find item with matching time (try normalized first, then exact match)
        found_match = False
        for idx, item in enumerate(clone):
            item_time = item.get("time", "").strip()
            matched = False
            
            # Try normalized match first
            if normalized_input_time:
                try:
                    item_parts = item_time.split(":")
                    if len(item_parts) == 2:
                        item_hours = int(item_parts[0])
                        item_minutes = int(item_parts[1])
                        normalized_item_time = f"{item_hours:02d}:{item_minutes:02d}"
                        if normalized_input_time == normalized_item_time:
                            matched = True
                except (ValueError, IndexError):
                    pass  # Fall through to exact match
            
            # Fallback to exact match if normalized didn't match
            if not matched:
                if item_time == time or item_time == time.strip():
                    matched = True
            
            # If we found a match, process it
            if matched:
                found_match = True
                if remove:
                    clone.pop(idx)
                    # CRITICAL: Ensure the modification persists
                    mods["daily_clone"] = clone
                    print(f"[DEBUG] Removed item at {time} from daily_clone. Remaining items: {len(clone)}")
                    return True
                elif activity is not None:
                    item["activity"] = activity
                    mods["daily_clone"] = clone
                    return True
                else:
                    # Remove if activity is None
                    clone.pop(idx)
                    mods["daily_clone"] = clone
                    return True
        
        if not found_match:
            print(f"[DEBUG] Item at {time} not found in daily_clone. Clone has {len(clone)} items: {[item.get('time') for item in clone]}")
        
        # Item not found - add it if not removing
        if not remove and activity is not None:
            clone.append({"time": time, "activity": activity})
            # Sort by time
            clone.sort(key=lambda x: x.get("time", ""))
            return True
        
        return False
    
    
    def get_user_info(self, include_one_time_events: bool = True) -> dict:
        """
        Get complete user information.
        
        Args:
            include_one_time_events: If True, include one-time events (for LLM). If False, exclude (for UI).
            
        Returns:
            Dictionary with name, schedule, condition, and optionally one_time_events
        """
        info = {
            "name": self._user_info["name"].copy(),
            "schedule": [item.copy() for item in self._user_info["schedule"]],
            "condition": self._user_info["condition"]
        }
        if include_one_time_events:
            info["one_time_events"] = [item.copy() for item in self._user_info["one_time_events"]]
        return info
    
    def check_schedule_notifications(self, current_time_str: str, date_str: str = None) -> list:
        """
        Check if current time matches any schedule items that should trigger notifications.
        
        CHANGED: Now uses daily_clone from schedule_modifications instead of original schedule.
        Notifications are generated from one-time events data (daily clone), not directly from original schedule.
        
        Args:
            current_time_str: Current time in HH:MM format (e.g., "08:00", "14:30")
            date_str: Optional date in YYYY-MM-DD format (for one-time events). If None, uses today.
            
        Returns:
            List of schedule items that should trigger notifications:
            [
                {
                    "time": str,
                    "activity": str,
                    "type": "schedule" or "one_time_event",
                    "action": dict (optional),  # {"devices": [...]}
                    "location": str (optional)  # Room name
                },
                ...
            ]
        """
        matching_items = []
        
        # Normalize time string (handle formats like "08:00", "8:00", "14:30")
        try:
            # Parse and normalize time
            time_parts = current_time_str.strip().split(":")
            if len(time_parts) == 2:
                hours = int(time_parts[0])
                minutes = int(time_parts[1])
                normalized_time = f"{hours:02d}:{minutes:02d}"
            else:
                return matching_items  # Invalid format
        except (ValueError, IndexError):
            return matching_items  # Invalid format
        
        # CHANGED: Use daily_clone instead of original schedule
        # Notifications are generated from one-time events data (daily clone), not directly from original schedule
        # Get today's schedule clone (creates it if it doesn't exist)
        # IMPORTANT: get_daily_clone() returns a copy, but it reflects the current state of mods["daily_clone"]
        # Pass date_str to support custom clock timestamps
        current_date = date_str if date_str else None
        daily_clone = self.get_daily_clone(current_date=current_date)
        
        daily_clone_items = []
        for item in daily_clone:
            item_str = f"{item.get('time')}: {item.get('activity')}"
            if item.get('location'):
                item_str += f" [loc:{item.get('location')}]"
            if item.get('action'):
                item_str += f" [action:yes]"
            daily_clone_items.append(item_str)
        print(f"[DEBUG] check_schedule_notifications: Checking {len(daily_clone)} items in daily_clone at {current_time_str}")
        print(f"[DEBUG] check_schedule_notifications: Daily clone items: {daily_clone_items}")
        
        # Check daily clone schedule items (these are what notifications use)
        # These come from schedule_modifications (one-time events data), not original schedule
        for item in daily_clone:
            schedule_time = item.get("time", "").strip()
            # Normalize schedule time
            try:
                sched_parts = schedule_time.split(":")
                if len(sched_parts) == 2:
                    sched_hours = int(sched_parts[0])
                    sched_minutes = int(sched_parts[1])
                    normalized_sched_time = f"{sched_hours:02d}:{sched_minutes:02d}"
                    
                    # Check if times match
                    if normalized_time == normalized_sched_time:
                        matching_item = {
                            "time": schedule_time,
                            "activity": item.get("activity", ""),
                            "type": "one_time_event"  # Changed: daily_clone is part of one-time events data structure
                        }
                        # Include optional fields if present
                        if "action" in item:
                            action_value = item["action"]
                            # Use copy to ensure proper structure
                            if isinstance(action_value, dict):
                                matching_item["action"] = action_value.copy()
                            else:
                                matching_item["action"] = action_value
                            print(f"[DEBUG] check_schedule_notifications: Item at {schedule_time} has action field")
                            print(f"[DEBUG] check_schedule_notifications: Action field type: {type(action_value)}, content: {action_value}")
                            if isinstance(action_value, dict) and "devices" in action_value:
                                devices = action_value.get("devices", [])
                                print(f"[DEBUG] check_schedule_notifications: Action has {len(devices)} device(s) in devices list")
                                for idx, device in enumerate(devices):
                                    print(f"[DEBUG] check_schedule_notifications: Device {idx + 1}: {device}")
                            else:
                                print(f"[DEBUG] check_schedule_notifications: [WARNING] Action field exists but structure may be invalid")
                        else:
                            print(f"[DEBUG] check_schedule_notifications: Item at {schedule_time} does NOT have action field. Item keys: {list(item.keys())}")
                        
                        if "location" in item:
                            matching_item["location"] = item["location"]
                            print(f"[DEBUG] check_schedule_notifications: Item at {schedule_time} has location field: '{item.get('location')}'")
                        else:
                            print(f"[DEBUG] check_schedule_notifications: Item at {schedule_time} does NOT have location field. Item keys: {list(item.keys())}")
                        
                        print(f"[DEBUG] check_schedule_notifications: Final matching_item keys: {list(matching_item.keys())}")
                        matching_items.append(matching_item)
            except (ValueError, IndexError):
                continue  # Skip invalid time formats
        
        # Check one-time events for today
        if date_str is None:
            from datetime import datetime
            date_str = datetime.now().strftime("%Y-%m-%d")
        
        today_events = self.get_schedule_addons(date_str)
        for item in today_events:
            event_time = item.get("time", "").strip()
            # Normalize event time
            try:
                event_parts = event_time.split(":")
                if len(event_parts) == 2:
                    event_hours = int(event_parts[0])
                    event_minutes = int(event_parts[1])
                    normalized_event_time = f"{event_hours:02d}:{event_minutes:02d}"
                    
                    # Check if times match
                    if normalized_time == normalized_event_time:
                        matching_item = {
                            "time": event_time,
                            "activity": item.get("activity", ""),
                            "type": "one_time_event"
                        }
                        # Include optional fields if present
                        if "action" in item:
                            action_value = item["action"]
                            # Use copy to ensure proper structure
                            if isinstance(action_value, dict):
                                matching_item["action"] = action_value.copy()
                            else:
                                matching_item["action"] = action_value
                            print(f"[DEBUG] check_schedule_notifications: One-time event at {event_time} has action field")
                            print(f"[DEBUG] check_schedule_notifications: Action field type: {type(action_value)}, content: {action_value}")
                            if isinstance(action_value, dict) and "devices" in action_value:
                                devices = action_value.get("devices", [])
                                print(f"[DEBUG] check_schedule_notifications: Action has {len(devices)} device(s) in devices list")
                            else:
                                print(f"[DEBUG] check_schedule_notifications: [WARNING] Action field exists but structure may be invalid")
                        else:
                            print(f"[DEBUG] check_schedule_notifications: One-time event at {event_time} does NOT have action field")
                        
                        if "location" in item:
                            matching_item["location"] = item["location"]
                            print(f"[DEBUG] check_schedule_notifications: One-time event at {event_time} has location field: '{item.get('location')}'")
                        
                        matching_items.append(matching_item)
            except (ValueError, IndexError):
                continue  # Skip invalid time formats
        
        return matching_items
    
    # ========== State Summary ==========
    
    def get_state_summary(self, custom_date: str = None) -> dict:
        """
        Get a complete summary of the current state.
        
        Args:
            custom_date: Optional custom date string in YYYY-MM-DD format (for custom clock)
        
        Returns:
            Dictionary with current_location, devices, do_not_remind, notification_preferences, and user_info
        """
        # Format notification preferences as list of strings for easier LLM consumption
        notification_prefs_list = [
            f"{room} {device}" 
            for (room, device) in self._notification_preferences.keys()
            if self._notification_preferences[(room, device)]
        ]
        
        # Get today's active schedule (daily clone) for LLM context
        # Pass custom_date to support custom clock timestamps
        daily_clone = self.get_daily_clone(current_date=custom_date)
        
        return {
            "current_location": self._current_location,
            "devices": self.get_all_devices(),
            "do_not_remind": self.get_do_not_remind(),
            "notification_preferences": notification_prefs_list,
            "user_info": self.get_user_info(include_one_time_events=True),  # Include one-time events for LLM
            "today_active_schedule": daily_clone  # Today's schedule clone used for notifications
        }
    
    def reset(self) -> None:
        """Reset all state to initial values (all devices OFF, default location, empty reminders)."""
        self._current_location = DEFAULT_USER_LOCATION
        self._do_not_remind.clear()
        self._notification_preferences.clear()
        
        # Reset user info
        self._user_info = {
            "name": {"thai": "", "english": ""},
            "schedule": [],
            "condition": "",
            "one_time_events": [],
            "schedule_modifications": {
                "daily_clone": None,
                "daily_clone_date": None
            }
        }
        
        # Reset all devices to OFF
        for room in self._devices:
            for device in self._devices[room]:
                self._devices[room][device] = False
