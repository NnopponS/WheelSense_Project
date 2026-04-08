from __future__ import annotations

from typing import Optional

import os
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telemetry import PhotoRecord
from app.schemas.camera import PhotoRecordCreate
from app.services.base import CRUDBase

class CameraService(CRUDBase[PhotoRecord, PhotoRecordCreate, PhotoRecordCreate]):

    async def delete_photo(self, db: AsyncSession, ws_id: int, photo_id: int) -> Optional[PhotoRecord]:
        """Deletes the photo record from the database and the file from disk."""
        photo = await self.get(db, ws_id=ws_id, id=photo_id)
        if not photo:
            return None

        # Delete from disk first
        try:
            if os.path.exists(photo.filepath):
                os.remove(photo.filepath)
        except OSError:
            # Maybe raise HTTPException? Log it at least.
            # We'll allow DB deletion even if file removal fails (file might be gone already)
            pass

        return await self.delete(db, ws_id=ws_id, id=photo_id)

camera_service = CameraService(PhotoRecord)
