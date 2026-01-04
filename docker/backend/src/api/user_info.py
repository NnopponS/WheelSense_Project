"""
User Info APIs - MCP user information management
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from ..dependencies import get_db, get_mqtt_handler

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
        if update.name is not None:
            await db.set_user_name(name=update.name or "")
        
        if update.condition is not None:
            await db.set_user_condition(update.condition)
        
        if update.current_location is not None:
            await db.set_current_location(update.current_location)
        
        # Return updated user info
        user_info = await db.get_user_info()
        
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
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to broadcast user_info_update: {e}")
        
        return user_info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update user info: {str(e)}")

