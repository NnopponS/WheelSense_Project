"""WheelSense — Motion recording and classification endpoints.

Endpoints:
    POST /record/start  — Send MQTT start-record command to device
    POST /record/stop   — Send MQTT stop-record command to device
    POST /train         — Train XGBoost from motion_training_data in DB
    POST /predict       — Predict action from raw IMU window
    GET  /model         — Get model info (status, labels, accuracy)
    POST /model/save    — Persist model to disk
    POST /model/load    — Load model from disk
"""

import json
from typing import Any

import aiomqtt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.config as config
from app.api.dependencies import get_current_user_workspace, get_db
from app.feature_engineering import create_sliding_windows, extract_features
from app.models.core import Device, Workspace
from app.models.telemetry import MotionTrainingData
from app.motion_classifier import (
    get_motion_model_info,
    is_motion_model_ready,
    load_model,
    predict_motion,
    save_model,
    train_motion_model,
)
from app.schemas.core import (
    MotionPredictRequest,
    MotionRecordStartRequest,
    MotionRecordStopRequest,
    MotionTrainRequest,
)

router = APIRouter()
settings = config.settings


# ── Recording control (existing, unchanged) ───────────────────────


@router.post("/record/start")
async def start_motion_recording(
    body: MotionRecordStartRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
) -> dict[str, str]:
    """Send MQTT command to start labeled IMU recording on device."""
    result = await db.execute(
        select(Device).where(
            Device.workspace_id == ws.id,
            Device.device_id == body.device_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(404, "Device not found in current workspace")

    payload = {"cmd": "start_record", "label": body.label, "session_id": body.session_id}
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
    return {"message": f"Start record command sent for {body.label}", "label": body.label}


@router.post("/record/stop")
async def stop_motion_recording(
    body: MotionRecordStopRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
) -> dict[str, str]:
    """Send MQTT command to stop IMU recording on device."""
    result = await db.execute(
        select(Device).where(
            Device.workspace_id == ws.id,
            Device.device_id == body.device_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(404, "Device not found in current workspace")

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


# ── ML: Train / Predict / Model management ────────────────────────


@router.post("/train")
async def train_motion(
    body: MotionTrainRequest | None = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
) -> dict[str, Any]:
    """Train XGBoost model from motion_training_data in DB.

    Pipeline: query DB → group by session → sliding window → extract features → train.
    """
    params = body or MotionTrainRequest()

    # 1. Query all motion training data for active workspace
    result = await db.execute(
        select(MotionTrainingData)
        .where(MotionTrainingData.workspace_id == ws.id)
        .order_by(MotionTrainingData.session_id, MotionTrainingData.timestamp)
    )
    rows = result.scalars().all()

    if not rows:
        raise HTTPException(400, "No motion training data in database. Record data first.")

    # 2. Group by session_id
    sessions: dict[str, list[dict[str, Any]]] = {}
    session_labels: dict[str, str] = {}
    for r in rows:
        sid = str(r.session_id) if r.session_id else "unknown"
        if sid not in sessions:
            sessions[sid] = []
            session_labels[sid] = str(r.action_label) if r.action_label else "unknown"
        sessions[sid].append({
            "ax": r.ax, "ay": r.ay, "az": r.az,
            "gx": r.gx, "gy": r.gy, "gz": r.gz,
            "distance_m": r.distance_m, "velocity_ms": r.velocity_ms,
        })

    # 3. Create sliding windows + extract features
    all_features: list[dict[str, float]] = []
    all_labels: list[str] = []

    for sid, samples in sessions.items():
        label = session_labels[sid]
        windows = create_sliding_windows(samples, params.window_size, params.overlap)
        for window in windows:
            features = extract_features(window)
            all_features.append(features)
            all_labels.append(label)

    if len(all_features) < 2:
        raise HTTPException(
            400,
            f"Not enough data windows ({len(all_features)}). "
            f"Need at least 2 windows. Record more data or reduce window_size.",
        )

    unique_labels = set(all_labels)
    if len(unique_labels) < 2:
        raise HTTPException(
            400,
            f"Need at least 2 different action labels to train. Found: {unique_labels}",
        )

    # 4. Train
    stats = train_motion_model(
        all_features, all_labels, workspace_id=ws.id, test_size=params.test_split
    )
    return {"message": "Motion model trained", **stats}


@router.post("/predict")
async def predict_motion_action(
    body: MotionPredictRequest,
    ws: Workspace = Depends(get_current_user_workspace),
) -> dict[str, Any]:
    """Predict action label from a raw IMU data window."""
    if not is_motion_model_ready(ws.id):
        raise HTTPException(400, "Motion model not trained yet. POST /api/motion/train first.")

    if len(body.imu_data) < 5:
        raise HTTPException(400, f"Need at least 5 IMU samples, got {len(body.imu_data)}")

    features = extract_features(body.imu_data)
    result = predict_motion(features, workspace_id=ws.id)
    if result is None:
        raise HTTPException(500, "Prediction failed")
    return result


@router.get("/model")
async def motion_model_info(ws: Workspace = Depends(get_current_user_workspace)) -> dict[str, Any]:
    """Get current motion model status and metadata."""
    return get_motion_model_info(ws.id)


@router.post("/model/save")
async def save_motion_model(ws: Workspace = Depends(get_current_user_workspace)) -> dict[str, str]:
    """Persist trained model to disk."""
    if not is_motion_model_ready(ws.id):
        raise HTTPException(400, "No trained model to save")
    return save_model(workspace_id=ws.id)


@router.post("/model/load")
async def load_motion_model(ws: Workspace = Depends(get_current_user_workspace)) -> dict[str, Any]:
    """Load persisted model from disk."""
    try:
        return load_model(workspace_id=ws.id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
