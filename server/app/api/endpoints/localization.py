from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RequireRole,
    get_current_active_user,
    get_current_user_workspace,
    get_db,
)
from app.localization import (
    get_localization_strategy,
    get_model_info,
    predict_room_with_strategy,
    set_localization_strategy,
    train_model,
)
from app.models.core import Device, Room, Workspace
from app.models.telemetry import (
    LocalizationCalibrationSample,
    LocalizationCalibrationSession,
    RSSITrainingData,
    RoomPrediction,
)
from app.services.localization_setup import (
    get_localization_readiness,
    repair_localization_readiness,
)
from app.models.users import User
from app.schemas.core import PredictRequest, TrainRequest
from app.schemas.localization import (
    LocalizationCalibrationSampleCreate,
    LocalizationCalibrationSampleOut,
    LocalizationCalibrationSessionCreate,
    LocalizationCalibrationSessionOut,
    LocalizationCalibrationTrainOut,
    LocalizationConfigOut,
    LocalizationConfigUpdate,
    LocalizationReadinessRepairIn,
    LocalizationReadinessOut,
)

router = APIRouter()

ROLE_LOCALIZATION_MANAGERS = ["admin", "head_nurse", "supervisor"]


@router.get("")
async def localization_info(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    info = get_model_info(ws.id)
    info["strategy"] = await get_localization_strategy(db, ws.id)
    return info


@router.get("/config", response_model=LocalizationConfigOut)
async def get_localization_config(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    from app.localization import get_or_create_localization_config

    row = await get_or_create_localization_config(db, ws.id)
    return LocalizationConfigOut(
        workspace_id=ws.id,
        strategy=row.strategy,  # type: ignore[arg-type]
        updated_at=row.updated_at,
    )


@router.get("/readiness", response_model=LocalizationReadinessOut)
async def get_readiness(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_LOCALIZATION_MANAGERS)),
):
    return LocalizationReadinessOut.model_validate(
        await get_localization_readiness(db, ws.id)
    )


@router.post("/readiness/repair", response_model=LocalizationReadinessOut)
async def repair_readiness(
    body: LocalizationReadinessRepairIn | None = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_LOCALIZATION_MANAGERS)),
):
    try:
        payload = await repair_localization_readiness(
            db,
            ws.id,
            updated_by_user_id=current_user.id,
            facility_id=body.facility_id if body else None,
            floor_id=body.floor_id if body else None,
            room_id=body.room_id if body else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return LocalizationReadinessOut.model_validate(payload)


@router.put("/config", response_model=LocalizationConfigOut)
async def update_localization_config(
    body: LocalizationConfigUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_LOCALIZATION_MANAGERS)),
):
    row = await set_localization_strategy(
        db,
        ws.id,
        strategy=body.strategy,
        updated_by_user_id=current_user.id,
    )
    return LocalizationConfigOut(
        workspace_id=ws.id,
        strategy=row.strategy,  # type: ignore[arg-type]
        updated_at=row.updated_at,
    )


@router.post("/train")
async def train_localization(
    body: TrainRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_LOCALIZATION_MANAGERS)),
):
    if not body.data:
        raise HTTPException(400, "No training data")

    training_list = []
    for item in body.data:
        db.add(
            RSSITrainingData(
                workspace_id=ws.id,
                room_id=item.room_id,
                room_name=item.room_name,
                rssi_vector=item.rssi_vector,
            )
        )
        training_list.append(
            {
                "room_id": item.room_id,
                "room_name": item.room_name,
                "rssi_vector": item.rssi_vector,
            }
        )
    await db.commit()
    stats = train_model(training_list, workspace_id=ws.id)
    if "error" in stats:
        raise HTTPException(400, stats["error"])
    return {"message": "Model trained", **stats}


@router.post("/retrain")
async def retrain_from_db(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_LOCALIZATION_MANAGERS)),
):
    rows = (
        await db.execute(select(RSSITrainingData).where(RSSITrainingData.workspace_id == ws.id))
    ).scalars().all()
    if not rows:
        raise HTTPException(400, "No training data in database for this workspace")

    stats = train_model(
        [
            {
                "room_id": r.room_id,
                "room_name": r.room_name,
                "rssi_vector": r.rssi_vector,
            }
            for r in rows
        ],
        workspace_id=ws.id,
    )
    if "error" in stats:
        raise HTTPException(400, stats["error"])
    return {"message": "Model retrained from DB", **stats}


@router.post("/predict")
async def predict_localization(
    body: PredictRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    result = await predict_room_with_strategy(db, ws.id, body.rssi_vector)
    if result is None:
        raise HTTPException(400, "No RSSI observations available for prediction")
    return result


@router.get("/predictions")
async def list_predictions(
    device_id: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    query = (
        select(RoomPrediction)
        .where(RoomPrediction.workspace_id == ws.id)
        .order_by(desc(RoomPrediction.timestamp))
        .limit(limit)
    )
    if device_id:
        query = query.where(RoomPrediction.device_id == device_id)
    rows = (await db.execute(query)).scalars().all()
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


@router.post(
    "/calibration/sessions",
    response_model=LocalizationCalibrationSessionOut,
    status_code=201,
)
async def create_calibration_session(
    body: LocalizationCalibrationSessionCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    device = (
        await db.execute(
            select(Device).where(
                Device.workspace_id == ws.id,
                Device.device_id == body.device_id,
            )
        )
    ).scalar_one_or_none()
    if not device:
        raise HTTPException(404, "Device not found in current workspace")
    if device.hardware_type not in {"wheelchair", "mobile_phone"}:
        raise HTTPException(400, "Calibration supports only wheelchair or mobile_phone devices")

    row = LocalizationCalibrationSession(
        workspace_id=ws.id,
        device_id=body.device_id,
        status="collecting",
        notes=body.notes,
        created_by_user_id=current_user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return LocalizationCalibrationSessionOut(
        id=row.id,
        workspace_id=row.workspace_id,
        device_id=row.device_id,
        status=row.status,
        notes=row.notes,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post(
    "/calibration/sessions/{session_id}/samples",
    response_model=LocalizationCalibrationSampleOut,
    status_code=201,
)
async def add_calibration_sample(
    session_id: int,
    body: LocalizationCalibrationSampleCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(get_current_active_user),
):
    session_row = (
        await db.execute(
            select(LocalizationCalibrationSession).where(
                LocalizationCalibrationSession.id == session_id,
                LocalizationCalibrationSession.workspace_id == ws.id,
            )
        )
    ).scalar_one_or_none()
    if not session_row:
        raise HTTPException(404, "Calibration session not found")
    if session_row.status != "collecting":
        raise HTTPException(400, "Session is not in collecting state")
    if not body.rssi_vector:
        raise HTTPException(400, "rssi_vector is required")

    room = await db.get(Room, body.room_id)
    if not room or room.workspace_id != ws.id:
        raise HTTPException(404, "Room not found in current workspace")

    sample = LocalizationCalibrationSample(
        session_id=session_row.id,
        workspace_id=ws.id,
        device_id=session_row.device_id,
        room_id=room.id,
        room_name=body.room_name or room.name,
        rssi_vector=body.rssi_vector,
        captured_at=body.captured_at,
    )
    db.add(sample)
    await db.commit()
    await db.refresh(sample)
    return LocalizationCalibrationSampleOut(
        id=sample.id,
        session_id=sample.session_id,
        room_id=sample.room_id,
        room_name=sample.room_name,
        rssi_vector=sample.rssi_vector,
        captured_at=sample.captured_at,
    )


@router.post(
    "/calibration/sessions/{session_id}/train",
    response_model=LocalizationCalibrationTrainOut,
)
async def train_from_calibration_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_LOCALIZATION_MANAGERS)),
):
    session_row = (
        await db.execute(
            select(LocalizationCalibrationSession).where(
                LocalizationCalibrationSession.id == session_id,
                LocalizationCalibrationSession.workspace_id == ws.id,
            )
        )
    ).scalar_one_or_none()
    if not session_row:
        raise HTTPException(404, "Calibration session not found")
    if session_row.status == "trained":
        raise HTTPException(400, "Calibration session is already trained")

    samples = (
        await db.execute(
            select(LocalizationCalibrationSample).where(
                LocalizationCalibrationSample.session_id == session_row.id,
                LocalizationCalibrationSample.workspace_id == ws.id,
            )
        )
    ).scalars().all()
    if not samples:
        raise HTTPException(400, "No calibration samples in this session")

    training_payload = [
        {
            "room_id": item.room_id,
            "room_name": item.room_name,
            "rssi_vector": item.rssi_vector,
        }
        for item in samples
    ]
    stats = train_model(training_payload, workspace_id=ws.id)
    if "error" in stats:
        raise HTTPException(400, stats["error"])

    for item in samples:
        db.add(
            RSSITrainingData(
                workspace_id=ws.id,
                room_id=item.room_id,
                room_name=item.room_name,
                rssi_vector=item.rssi_vector,
            )
        )
    session_row.status = "trained"
    db.add(session_row)
    await db.commit()

    return LocalizationCalibrationTrainOut(
        session_id=session_row.id,
        persisted_samples=len(samples),
        training_stats=stats,
    )
