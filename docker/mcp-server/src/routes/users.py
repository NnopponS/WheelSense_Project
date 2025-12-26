"""
User APIs - User management and preferences
"""

from fastapi import APIRouter, HTTPException, Request

from ..dependencies import get_db

router = APIRouter(tags=["Users"])


@router.get("/users/{user_id}")
async def get_user(user_id: str, request: Request):
    """Get user profile."""
    db = get_db(request)
    
    user = await db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/users/{user_id}/preferences")
async def update_user_preferences(user_id: str, preferences: dict, request: Request):
    """Update user preferences."""
    db = get_db(request)
    
    success = await db.update_user_preferences(user_id, preferences)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"status": "updated"}
