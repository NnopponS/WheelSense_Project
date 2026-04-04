from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime

# --- SmartDevice ---
class SmartDeviceBase(BaseModel):
    name: str
    ha_entity_id: str
    device_type: str
    room_id: Optional[int] = None
    is_active: bool = True
    config: Dict[str, Any] = Field(default_factory=dict)


class SmartDeviceCreate(SmartDeviceBase):
    pass

class SmartDeviceUpdate(BaseModel):
    name: Optional[str] = None
    ha_entity_id: Optional[str] = None
    device_type: Optional[str] = None
    room_id: Optional[int] = None
    is_active: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None

class SmartDeviceResponse(SmartDeviceBase):
    id: int
    workspace_id: int
    state: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- API Payloads ---
class HADeviceControl(BaseModel):
    """Payload requested by frontend to control a device"""
    action: str = Field(..., description="E.g., 'turn_on', 'turn_off', 'toggle', 'set_value'")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="e.g., {'brightness': 255}")

class HAResponse(BaseModel):
    status: str
    message: str
    data: Optional[Dict[str, Any]] = None
