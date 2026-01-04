"""
User Info APIs - MCP user information management
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import logging

from ..dependencies import get_db, get_mqtt_handler

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["User Info"])


class UserInfoUpdate(BaseModel):
    name: Optional[str] = None
    condition: Optional[str] = None
    current_location: Optional[str] = None


@router.get("/user-info")
async def get_user_info(request: Request):
    """Get user information from user_info table."""
    db = get_db(request)
    
    try:
        user_info = await db.get_user_info()
        return user_info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get user info: {str(e)}")


@router.put("/user-info")
async def update_user_info(update: UserInfoUpdate, request: Request):
    """Update user information."""
    db = get_db(request)
    mqtt_handler = get_mqtt_handler(request)
    
    try:
        # Get previous location before updating (for house check)
        previous_location = None
        if update.current_location is not None:
            user_info_before = await db.get_user_info()
            previous_location = user_info_before.get("current_location")
        
        if update.name is not None:
            await db.set_user_name(name=update.name or "")
        
        if update.condition is not None:
            await db.set_user_condition(update.condition)
        
        if update.current_location is not None:
            await db.set_current_location(update.current_location)
        
        # Return updated user info
        user_info = await db.get_user_info()
        
        # Trigger house check if location changed
        if update.current_location is not None and previous_location != update.current_location:
            logger.info(f"🔍 DEBUG: Location change detected - previous: '{previous_location}', current: '{update.current_location}'")
            house_check_service = getattr(request.app.state, 'house_check_service', None)
            if house_check_service:
                logger.info(f"🔍 DEBUG: House check service found, triggering...")
                try:
                    result = await house_check_service.run_house_check(
                        previous_location,
                        update.current_location
                    )
                    logger.info(f"✅ House check triggered: {previous_location} → {update.current_location}")
                    logger.info(f"🔍 DEBUG: House check result: {result}")
                    
                    # Store recent_notification in app.state for command parser (logic-based)
                    # This allows command parser to know which devices to turn off when user responds "yes"
                    if result and result.get("notified") and result.get("devices"):
                        request.app.state.recent_notification = {
                            "devices": result.get("devices", []),
                            "message": result.get("message", ""),
                            "type": "house_check_notification"
                        }
                        logger.info(f"💾 Stored recent_notification in app.state: {len(result.get('devices', []))} device(s)")
                        logger.info(f"💾 Recent notification devices: {result.get('devices', [])}")
                except Exception as e:
                    logger.error(f"House check failed: {e}", exc_info=True)
            else:
                logger.warning(f"⚠️ House check service not found in app.state!")
        
        # Broadcast user_info_update via WebSocket
        try:
            await mqtt_handler._broadcast_ws({
                "type": "user_info_update",
                "data": {
                    "name": user_info.get("name", ""),
                    "condition": user_info.get("condition", ""),
                    "current_location": user_info.get("current_location", "")
                },
                "timestamp": datetime.now().isoformat()
            })
        except Exception as e:
            # Log but don't fail the request if WebSocket broadcast fails
            logger.warning(f"Failed to broadcast user_info_update: {e}")
        
        return user_info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update user info: {str(e)}")

