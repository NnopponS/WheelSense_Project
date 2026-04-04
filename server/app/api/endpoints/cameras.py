import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.dependencies import RequireRole, get_current_user_workspace, get_db
from app.models.core import Workspace
from app.schemas.camera import PhotoRecordOut
from app.services.camera import camera_service

router = APIRouter()


@router.get("/photos", response_model=List[PhotoRecordOut])
async def list_photos(
    device_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    """Retrieve list of captured photos."""
    if device_id:
        # Use underlying CRUDBase filter, or manual select
        query = select(camera_service.model).where(
            camera_service.model.workspace_id == ws.id,
            camera_service.model.device_id == device_id
        ).order_by(camera_service.model.timestamp.desc()).offset(skip).limit(limit)
        
        result = await db.execute(query)
        photos = result.scalars().all()
    else:
        # get_multi doesn't sort by default, let's manual select for order
        query = select(camera_service.model).where(
            camera_service.model.workspace_id == ws.id
        ).order_by(camera_service.model.timestamp.desc()).offset(skip).limit(limit)
        
        result = await db.execute(query)
        photos = result.scalars().all()

    # Construct the virtual url property
    for photo in photos:
        photo.url = f"/api/cameras/photos/{photo.id}/content"

    return photos


@router.get("/photos/{photo_id}/content")
async def get_photo_content(
    photo_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    """Retrieve actual binary photo content."""
    photo = await camera_service.get(db, ws_id=ws.id, id=photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
        
    if not os.path.exists(photo.filepath):
        raise HTTPException(status_code=404, detail="Photo file missing from disk")

    return FileResponse(
        path=photo.filepath,
        media_type="image/jpeg",
        filename=f"photo_{photo.photo_id}.jpg"
    )


@router.delete("/photos/{photo_id}", response_model=PhotoRecordOut)
async def delete_photo(
    photo_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _=Depends(RequireRole(["admin", "supervisor"]))
):
    """Delete a photo and its disk file."""
    photo = await camera_service.delete_photo(db, ws_id=ws.id, photo_id=photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
        
    photo.url = "" # Doesn't matter because it's deleted, but satisfies schema
    return photo
