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
    room = arguments.get("room", "")
    device = arguments.get("device", "")
    action = arguments.get("action", "")
    
    if not room or not device or not action:
        return {
            "success": False,
            "tool": "e_device_control",
            "message": "",
            "error": "Missing required arguments: room, device, or action"
        }
    
    # Normalize room and device names
    normalized_room = normalize_room_name(room)
    normalized_device = normalize_device_name(device)
    
    # Validate room
    if normalized_room not in ROOM_DEVICES:
        return {
            "success": False,
            "tool": "e_device_control",
            "message": "",
            "error": f"Invalid room: {room}. Available rooms: {', '.join(ROOM_DEVICES.keys())}"
        }
    
    # Validate device for room
    available_devices = ROOM_DEVICES.get(normalized_room, [])
    if normalized_device not in available_devices:
        return {
            "success": False,
            "tool": "e_device_control",
            "message": "",
            "error": f"Device '{device}' not available in {room}. Available devices: {', '.join(available_devices)}"
        }
    
    # Convert action to boolean
    state = action.upper() == "ON"
    
    try:
        # Send control command via MQTT
        success = await mqtt_handler.send_control_command(
            room=normalized_room,
            appliance=normalized_device,
            state=state
        )
        
        if not success:
            return {
                "success": False,
                "tool": "e_device_control",
                "message": "",
                "error": "Failed to send control command via MQTT"
            }
        
        # Update database
        await db.update_appliance_state(normalized_room, normalized_device, state)
        
        # Broadcast state change via WebSocket to sync all clients
        try:
            # Broadcast appliance_update (existing event)
            await mqtt_handler._broadcast_ws({
                "type": "appliance_update",
                "room": normalized_room,
                "appliance": normalized_device,
                "state": state,
                "timestamp": datetime.now().isoformat()
            })
            logger.info(f"Broadcasted appliance update: {normalized_room}/{normalized_device} = {state}")
            
            # Also broadcast device_state_update for MCP compatibility
            await mqtt_handler._broadcast_ws({
                "type": "device_state_update",
                "room": normalized_room,
                "device": normalized_device,
                "state": state,
                "timestamp": datetime.now().isoformat()
            })
            logger.info(f"Broadcasted device_state_update: {normalized_room}/{normalized_device} = {state}")
        except Exception as e:
            logger.warning(f"Failed to broadcast appliance/device state update: {e}")
        
        action_text = "on" if state else "off"
        return {
            "success": True,
            "tool": "e_device_control",
            "message": f"Turned {action_text} {normalized_device} in {room}.",
            "error": None
        }
        
    except Exception as e:
        logger.error(f"Error controlling device: {e}", exc_info=True)
        return {
            "success": False,
            "tool": "e_device_control",
            "message": "",
            "error": f"Error controlling device: {str(e)}"
        }


async def handle_schedule_modifier(db, mqtt_handler, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle schedule_modifier tool call.
    Modifies the user's schedule (add, delete, or change activities).
    
    Args:
        db: Database instance
        mqtt_handler: MQTT handler instance
        arguments: Tool arguments
        
    Returns:
        Tool execution result
    """
    modify_type = arguments.get("modify_type", "").lower()
    time = arguments.get("time", "")
    activity = arguments.get("activity", "")
    old_time = arguments.get("old_time", "")
    old_activity = arguments.get("old_activity", "")
    
    if modify_type not in ["add", "delete", "change"]:
        return {
            "success": False,
            "tool": "schedule_modifier",
            "modify_type": modify_type,
            "message": "",
            "error": f"Invalid modify_type: {modify_type}. Must be 'add', 'delete', or 'change'."
        }
    
    try:
        if modify_type == "add":
            if not time or not activity:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "message": "",
                    "error": "Time and activity are required for 'add' operation."
                }
            
            # Add schedule item
            item = {
                "time": time,
                "activity": activity
            }
            
            # Optional fields
            if arguments.get("location"):
                item["location"] = arguments.get("location")
            if arguments.get("action"):
                item["action"] = arguments.get("action")
            
            item_id = await db.add_schedule_item(item)
            
            return {
                "success": True,
                "tool": "schedule_modifier",
                "modify_type": modify_type,
                "message": f"Added {activity} at {time} to your schedule.",
                "error": None
            }
        
        elif modify_type == "delete":
            if not time:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "message": "",
                    "error": "Time is required for 'delete' operation."
                }
            
            # Delete schedule item
            success = await db.delete_schedule_item_by_time(time)
            
            if not success:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "old_time": time,
                    "message": "",
                    "error": f"No schedule item found at {time}."
                }
            
            return {
                "success": True,
                "tool": "schedule_modifier",
                "modify_type": modify_type,
                "message": f"Deleted schedule item at {time}.",
                "error": None
            }
        
        elif modify_type == "change":
            if not old_time or not time:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "message": "",
                    "error": "Both old_time and time are required for 'change' operation."
                }
            
            # Get all schedule items
            schedule_items = await db.get_schedule_items()
            
            # Find item to change
            item_to_change = None
            item_index = None
            
            for i, item in enumerate(schedule_items):
                if item.get("time") == old_time:
                    if old_activity:
                        if item.get("activity") == old_activity:
                            item_to_change = item
                            item_index = i
                            break
                    else:
                        item_to_change = item
                        item_index = i
                        break
            
            if not item_to_change:
                return {
                    "success": False,
                    "tool": "schedule_modifier",
                    "modify_type": modify_type,
                    "old_time": old_time,
                    "message": "",
                    "error": f"No schedule item found at {old_time}."
                }
            
            # Update item
            updated_item = item_to_change.copy()
            updated_item["time"] = time
            if activity:
                updated_item["activity"] = activity
            if arguments.get("location"):
                updated_item["location"] = arguments.get("location")
            if arguments.get("action"):
                updated_item["action"] = arguments.get("action")
            
            # Replace all items (since we don't have direct update by ID)
            schedule_items[item_index] = updated_item
            await db.set_schedule_items(schedule_items)
            
            return {
                "success": True,
                "tool": "schedule_modifier",
                "modify_type": modify_type,
                "message": f"Changed schedule item from {old_time} to {time}.",
                "error": None
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
            description="Control a device in a room. Turn devices ON or OFF. Available devices vary by room.",
            input_schema={
                "type": "object",
                "properties": {
                    "room": {
                        "type": "string",
                        "description": "Room name (Bedroom, Bathroom, Kitchen, Living Room)"
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
            description="Modify the user's schedule. Add new activities, delete existing ones, or change times. System automatically detects if activity is recurring or one-time.",
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
    
    # 4. get_current_state
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
