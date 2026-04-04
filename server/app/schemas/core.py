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
    floor_id: int | None = None
    room_type: str | None = None
    node_device_id: str | None = None


class RoomUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    floor_id: int | None = None
    room_type: str | None = None
    node_device_id: str | None = None
    adjacent_rooms: List[int] | None = None
    config: Dict[str, object] | None = None


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

class MotionTrainRequest(BaseModel):
    window_size: int = 40          # samples per window (2 sec @ 20Hz)
    overlap: float = 0.5           # 50% overlap
    test_split: float = 0.2        # 80/20 train/test

class MotionPredictRequest(BaseModel):
    imu_data: List[Dict[str, float]]  # raw IMU samples [{ax,ay,az,gx,gy,gz}, ...]

