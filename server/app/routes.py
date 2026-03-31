"""WheelSense Server — REST API routes.

Clean, organized API:
  /api/devices           GET      - list devices
  /api/rooms             GET/POST - list/create rooms
  /api/telemetry         GET      - query IMU telemetry
  /api/rssi              GET      - query RSSI readings
  /api/localization      GET      - model info
  /api/localization/train POST    - train model
  /api/localization/predict POST  - predict room from RSSI
  /api/cameras/{id}/command POST  - send MQTT command to camera
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

import aiomqtt
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .database import (
    Device, IMUTelemetry, Room, RoomPrediction, RSSIReading, RSSITrainingData,
    get_session,
)
from .localization import get_model_info, is_model_ready, predict_room, train_model

logger = logging.getLogger("wheelsense.api")
router = APIRouter(prefix="/api")


# ─── Pydantic Models ───────────────────────────────────────────────

class RoomCreate(BaseModel):
    name: str
    description: str = ""

class TrainingDataItem(BaseModel):
    room_id: int
    room_name: str = ""
    rssi_vector: dict[str, int]  # {"WSN_001": -65, ...}

class TrainRequest(BaseModel):
    data: list[TrainingDataItem]

class PredictRequest(BaseModel):
    rssi_vector: dict[str, int]

class CameraCommand(BaseModel):
    command: str  # start_stream, stop_stream, capture_frame, set_resolution, reboot
    interval_ms: int = 200
    resolution: str = "VGA"

class MotionRecordStartRequest(BaseModel):
    device_id: str
    label: str

class MotionRecordStopRequest(BaseModel):
    device_id: str


# ─── Devices ────────────────────────────────────────────────────────

@router.get("/devices")
async def list_devices(
    device_type: str | None = None,
    db: AsyncSession = Depends(get_session),
):
    query = select(Device).order_by(desc(Device.last_seen))
    if device_type:
        query = query.where(Device.device_type == device_type)
    result = await db.execute(query)
    devices = result.scalars().all()
    return [
        {
            "id": d.id,
            "device_id": d.device_id,
            "device_type": d.device_type,
            "ip_address": d.ip_address,
            "firmware": d.firmware,
            "last_seen": d.last_seen.isoformat() if d.last_seen else None,
            "config": d.config,
        }
        for d in devices
    ]


# ─── Rooms ──────────────────────────────────────────────────────────

@router.get("/rooms")
async def list_rooms(db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(Room).order_by(Room.id))
    rooms = result.scalars().all()
    return [{"id": r.id, "name": r.name, "description": r.description} for r in rooms]


@router.post("/rooms")
async def create_room(body: RoomCreate, db: AsyncSession = Depends(get_session)):
    room = Room(name=body.name, description=body.description)
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return {"id": room.id, "name": room.name, "description": room.description}


# ─── Telemetry ──────────────────────────────────────────────────────

@router.get("/telemetry")
async def query_telemetry(
    device_id: str | None = None,
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_session),
):
    query = select(IMUTelemetry).order_by(desc(IMUTelemetry.timestamp)).limit(limit)
    if device_id:
        query = query.where(IMUTelemetry.device_id == device_id)
    result = await db.execute(query)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "device_id": r.device_id,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "seq": r.seq,
            "imu": {"ax": r.ax, "ay": r.ay, "az": r.az, "gx": r.gx, "gy": r.gy, "gz": r.gz},
            "motion": {
                "distance_m": r.distance_m,
                "velocity_ms": r.velocity_ms,
                "accel_ms2": r.accel_ms2,
                "direction": r.direction,
            },
            "battery": {
                "percentage": r.battery_pct,
                "voltage_v": r.battery_v,
                "charging": r.charging,
            },
        }
        for r in rows
    ]


@router.get("/rssi")
async def query_rssi(
    device_id: str | None = None,
    limit: int = Query(default=100, le=1000),
    db: AsyncSession = Depends(get_session),
):
    query = select(RSSIReading).order_by(desc(RSSIReading.timestamp)).limit(limit)
    if device_id:
        query = query.where(RSSIReading.device_id == device_id)
    result = await db.execute(query)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "device_id": r.device_id,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "node_id": r.node_id,
            "rssi": r.rssi,
            "mac": r.mac,
        }
        for r in rows
    ]


# ─── Localization ───────────────────────────────────────────────────

@router.get("/localization")
async def localization_info():
    """Get current model info."""
    return get_model_info()


@router.post("/localization/train")
async def train_localization(body: TrainRequest, db: AsyncSession = Depends(get_session)):
    """Train the KNN model with labeled RSSI data.

    Also persists training data to the database for retraining.
    """
    if not body.data:
        raise HTTPException(400, "No training data")

    # Persist training data
    for item in body.data:
        row = RSSITrainingData(
            room_id=item.room_id,
            room_name=item.room_name,
            rssi_vector=item.rssi_vector,
        )
        db.add(row)
    await db.commit()

    # Train model
    training_list = [
        {
            "room_id": item.room_id,
            "room_name": item.room_name,
            "rssi_vector": item.rssi_vector,
        }
        for item in body.data
    ]
    stats = train_model(training_list)
    return {"message": "Model trained", **stats}


@router.post("/localization/retrain")
async def retrain_from_db(db: AsyncSession = Depends(get_session)):
    """Retrain model from all stored training data."""
    result = await db.execute(select(RSSITrainingData))
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(400, "No training data in database")

    training_list = [
        {
            "room_id": r.room_id,
            "room_name": r.room_name,
            "rssi_vector": r.rssi_vector,
        }
        for r in rows
    ]
    stats = train_model(training_list)
    return {"message": "Model retrained from DB", **stats}


@router.post("/localization/predict")
async def predict_localization(body: PredictRequest):
    """Predict room from RSSI vector (manual/test endpoint)."""
    if not is_model_ready():
        raise HTTPException(400, "Model not trained yet. POST /api/localization/train first.")
    result = predict_room(body.rssi_vector)
    if result is None:
        raise HTTPException(500, "Prediction failed")
    return result


@router.get("/localization/predictions")
async def list_predictions(
    device_id: str | None = None,
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_session),
):
    """Get recent room predictions."""
    query = select(RoomPrediction).order_by(desc(RoomPrediction.timestamp)).limit(limit)
    if device_id:
        query = query.where(RoomPrediction.device_id == device_id)
    result = await db.execute(query)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "device_id": r.device_id,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "predicted_room_id": r.predicted_room_id,
            "predicted_room_name": r.predicted_room_name,
            "confidence": r.confidence,
            "model_type": r.model_type,
        }
        for r in rows
    ]


# ─── Motion Recording ───────────────────────────────────────────────

@router.post("/motion-record/start")
async def start_motion_recording(body: MotionRecordStartRequest):
    """Send MQTT command to start recording motion for ML classification."""
    payload = {"cmd": "start_record", "label": body.label}
    topic = f"WheelSense/{body.device_id}/control"
    try:
        async with aiomqtt.Client(
            hostname=settings.mqtt_broker,
            port=settings.mqtt_port,
            username=settings.mqtt_user or None,
            password=settings.mqtt_password or None,
        ) as client:
            await client.publish(topic, json.dumps(payload))
    except Exception as e:
        raise HTTPException(502, f"Failed to send MQTT command: {e}")
    return {"message": "Start record command sent. Device will beep for 3 seconds.", "label": body.label}


@router.post("/motion-record/stop")
async def stop_motion_recording(body: MotionRecordStopRequest):
    """Send MQTT command to manually stop recording motion."""
    payload = {"cmd": "stop_record"}
    topic = f"WheelSense/{body.device_id}/control"
    try:
        async with aiomqtt.Client(
            hostname=settings.mqtt_broker,
            port=settings.mqtt_port,
            username=settings.mqtt_user or None,
            password=settings.mqtt_password or None,
        ) as client:
            await client.publish(topic, json.dumps(payload))
    except Exception as e:
        raise HTTPException(502, f"Failed to send MQTT command: {e}")
    return {"message": "Stop record command sent."}


# ─── Camera Control ─────────────────────────────────────────────────

@router.post("/cameras/{device_id}/command")
async def send_camera_command(device_id: str, body: CameraCommand):
    """Send MQTT command to a camera node."""
    payload = {"command": body.command}
    if body.command == "start_stream":
        payload["interval_ms"] = body.interval_ms
    if body.command == "set_resolution":
        payload["resolution"] = body.resolution

    topic = f"WheelSense/camera/{device_id}/control"
    try:
        async with aiomqtt.Client(
            hostname=settings.mqtt_broker,
            port=settings.mqtt_port,
            username=settings.mqtt_user or None,
            password=settings.mqtt_password or None,
        ) as client:
            await client.publish(topic, json.dumps(payload))
    except Exception as e:
        raise HTTPException(502, f"Failed to send MQTT command: {e}")

    return {"message": f"Command '{body.command}' sent to {device_id}", "topic": topic}


# ─── Health ──────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {"status": "ok", "model_ready": is_model_ready()}
