from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.api.dependencies import get_current_user_workspace, get_db
from app.models.core import Workspace
from app.models.telemetry import RSSITrainingData, RoomPrediction
from app.schemas.core import TrainRequest, PredictRequest
from app.localization import get_model_info, is_model_ready, predict_room, train_model

router = APIRouter()

@router.get("")
async def localization_info(ws: Workspace = Depends(get_current_user_workspace)):
    """Get current model info for the authenticated user's workspace."""
    return get_model_info(ws.id)

@router.post("/train")
async def train_localization(
    body: TrainRequest, 
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    if not body.data:
        raise HTTPException(400, "No training data")

    # Persist training data
    for item in body.data:
        row = RSSITrainingData(
            workspace_id=ws.id,
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
    stats = train_model(training_list, workspace_id=ws.id)
    return {"message": "Model trained", **stats}

@router.post("/retrain")
async def retrain_from_db(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    result = await db.execute(select(RSSITrainingData).where(RSSITrainingData.workspace_id == ws.id))
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(400, "No training data in database for this workspace")

    training_list = [
        {
            "room_id": r.room_id,
            "room_name": r.room_name,
            "rssi_vector": r.rssi_vector,
        }
        for r in rows
    ]
    stats = train_model(training_list, workspace_id=ws.id)
    return {"message": "Model retrained from DB", **stats}

@router.post("/predict")
async def predict_localization(
    body: PredictRequest,
    ws: Workspace = Depends(get_current_user_workspace),
):
    if not is_model_ready(ws.id):
        raise HTTPException(400, "Model not trained yet. POST /api/localization/train first.")
    result = predict_room(body.rssi_vector, workspace_id=ws.id)
    if result is None:
        raise HTTPException(500, "Prediction failed")
    return result

@router.get("/predictions")
async def list_predictions(
    device_id: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    query = select(RoomPrediction).where(RoomPrediction.workspace_id == ws.id).order_by(desc(RoomPrediction.timestamp)).limit(limit)
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
