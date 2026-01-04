"""
Shared appliance control logic.
Used by both API endpoint (/appliances/control) and tool handler (e_device_control).
Ensures identical behavior regardless of entry point.
"""

from datetime import datetime
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


async def control_appliance_core(
    db,
    mqtt_handler,
    room: str,
    appliance: str,
    state: bool,
    value: Optional[int] = None
) -> Dict[str, Any]:
    """
    Core appliance control logic shared by API endpoint and tool handler.
    This ensures identical behavior regardless of entry point.
    
    Execution order (matches manual toggle):
    1. Send MQTT command to physical device
    2. Update database (device_states → appliances)
    3. Broadcast WebSocket updates
    4. Log activity
    
    Args:
        db: Database instance
        mqtt_handler: MQTT handler instance
        room: Room name (normalized)
        appliance: Appliance/device type (e.g., "light", "AC", "fan")
        state: New state (True = ON, False = OFF)
        value: Optional value for sliders (brightness, temperature, volume, speed)
    
    Returns:
        Dict with success status and details:
        {
            "success": bool,
            "room": str,
            "appliance": str,
            "state": bool,
            "error": Optional[str]
        }
    """
    # Step 1: Send MQTT command to physical device FIRST (like manual toggle)
    # Convert device name for MQTT: lowercase except "AC" stays "AC"
    mqtt_success = False
    
    if mqtt_handler:
        if appliance == "AC":
            mqtt_appliance = "AC"
        else:
            mqtt_appliance = appliance.lower()
        
        mqtt_success = await mqtt_handler.send_control_command(
            room=room,
            appliance=mqtt_appliance,
            state=state,
            value=value
        )
        
        if not mqtt_success:
            logger.warning(f"Failed to send MQTT command for {room}/{appliance}, but continuing with database update")
            # Note: We continue even if MQTT fails, as database update is critical
        else:
            logger.info(f"MQTT command sent successfully: {room}/{mqtt_appliance} = {'ON' if state else 'OFF'}")
    else:
        logger.warning(f"MQTT handler not available, skipping MQTT command for {room}/{appliance}")
    
    # Step 2: Update database (DATABASE-FIRST ARCHITECTURE)
    # device_states table is the single source of truth
    if not db:
        return {
            "success": False,
            "room": room,
            "appliance": appliance,
            "state": state,
            "error": "Database not available"
        }
    
    try:
        # Update device_states table (source of truth)
        await db.set_device_state(room, appliance, state)
        logger.info(f"Updated device_states (source of truth): {room}/{appliance} = {state}")
        
        # Sync to appliances table for backward compatibility
        try:
            # Use proper SQLite method to update appliances table
            await db.update_appliance_state(room, appliance, state)
            logger.debug(f"Synced to appliances table: {room}/{appliance} = {state}")
        except Exception as sync_error:
            # Non-critical: appliances sync failed but device_states was updated
            logger.warning(f"Failed to sync to appliances table (non-critical): {sync_error}")
            
    except Exception as e:
        logger.error(f"Failed to update device_states (critical): {e}", exc_info=True)
        return {
            "success": False,
            "room": room,
            "appliance": appliance,
            "state": state,
            "error": f"Failed to persist device state: {str(e)}"
        }
    
    # Step 3: Broadcast state change via WebSocket to sync all clients
    # Database has already been updated above, so WebSocket failure doesn't affect correctness
    try:
        # Broadcast appliance_update (existing event)
        await mqtt_handler._broadcast_ws({
            "type": "appliance_update",
            "room": room,
            "appliance": appliance,
            "state": state,
            "value": value,
            "timestamp": datetime.utcnow().isoformat()
        })
        logger.debug(f"Broadcasted appliance update via WebSocket: {room}/{appliance} = {state}")
        
        # Also broadcast device_state_update for MCP compatibility
        await mqtt_handler._broadcast_ws({
            "type": "device_state_update",
            "room": room,
            "device": appliance,
            "state": state,
            "timestamp": datetime.utcnow().isoformat()
        })
        logger.debug(f"Broadcasted device_state_update via WebSocket: {room}/{appliance} = {state}")
    except Exception as e:
        # WebSocket broadcast is optional - log but don't fail
        logger.debug(f"WebSocket broadcast failed (optional): {e}")
    
    # Step 4: Log activity
    try:
        await db.log_activity(
            room_id=room,
            event_type="appliance_on" if state else "appliance_off",
            details={
                "appliance": appliance,
                "state": state,
                "value": value
            }
        )
    except Exception as e:
        logger.warning(f"Failed to log activity for appliance control: {e}")
    
    return {
        "success": True,
        "room": room,
        "appliance": appliance,
        "state": state
    }

