from pydantic import BaseModel, ConfigDict
from typing import Dict, List


class WorkspaceCreate(BaseModel):
    name: str
    mode: str = "simulation"


class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    mode: str
    is_active: bool

class RoomCreate(BaseModel):
    name: str
    description: str = ""

class DeviceCreate(BaseModel):
    device_id: str
    device_type: str = "wheelchair"

class CameraCommand(BaseModel):
    command: str
    interval_ms: int = 200
    resolution: str = "VGA"

class TrainingDataItem(BaseModel):
    room_id: int
    room_name: str = ""
    rssi_vector: Dict[str, int]

class TrainRequest(BaseModel):
    data: List[TrainingDataItem]

class PredictRequest(BaseModel):
    rssi_vector: Dict[str, int]

class MotionRecordStartRequest(BaseModel):
    device_id: str
    session_id: str
    label: str

class MotionRecordStopRequest(BaseModel):
    device_id: str
