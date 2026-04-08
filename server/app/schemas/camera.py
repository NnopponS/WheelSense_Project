from __future__ import annotations

from pydantic import BaseModel
from datetime import datetime

class PhotoRecordBase(BaseModel):
    device_id: str
    photo_id: str
    file_size: int

class PhotoRecordCreate(PhotoRecordBase):
    filepath: str

class PhotoRecordOut(PhotoRecordBase):
    id: int
    workspace_id: int
    timestamp: datetime
    url: str # Virtual field for frontend access

    class Config:
        from_attributes = True
