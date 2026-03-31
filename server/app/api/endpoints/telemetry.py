from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.api.dependencies import get_db, get_active_ws
from app.models.core import Workspace
from app.models.telemetry import IMUTelemetry, RSSIReading

router = APIRouter()

@router.get("/imu")
async def query_imu_telemetry(
    device_id: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_active_ws)
):
    query = select(IMUTelemetry).where(IMUTelemetry.workspace_id == ws.id).order_by(desc(IMUTelemetry.timestamp)).limit(limit)
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
    device_id: Optional[str] = None,
    limit: int = Query(default=100, le=1000),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_active_ws)
):
    query = select(RSSIReading).where(RSSIReading.workspace_id == ws.id).order_by(desc(RSSIReading.timestamp)).limit(limit)
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
