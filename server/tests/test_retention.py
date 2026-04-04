"""Tests for Data Retention Service (Phase 6) — TDD first."""

from __future__ import annotations

import datetime as _dt
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import Workspace, Device
from app.models.telemetry import IMUTelemetry, RSSIReading, RoomPrediction
from app.services.retention import RetentionService


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _create_workspace(db: AsyncSession) -> Workspace:
    ws = Workspace(name="retention_test", is_active=True)
    db.add(ws)
    await db.flush()
    return ws


async def _seed_imu(db: AsyncSession, ws_id: int, count: int, days_old: int) -> None:
    """Insert IMU rows with timestamps `days_old` days in the past."""
    ts = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=days_old)
    for i in range(count):
        row = IMUTelemetry(
            workspace_id=ws_id,
            device_id="DEV_RET",
            timestamp=ts - _dt.timedelta(seconds=i),
            ax=0.0, ay=0.0, az=0.0, gx=0.0, gy=0.0, gz=0.0,
        )
        db.add(row)
    await db.flush()


async def _seed_rssi(db: AsyncSession, ws_id: int, count: int, days_old: int) -> None:
    ts = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=days_old)
    for i in range(count):
        row = RSSIReading(
            workspace_id=ws_id,
            device_id="DEV_RET",
            timestamp=ts - _dt.timedelta(seconds=i),
            node_id="NODE_1",
            rssi=-50,
        )
        db.add(row)
    await db.flush()


async def _seed_predictions(db: AsyncSession, ws_id: int, count: int, days_old: int) -> None:
    ts = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=days_old)
    for i in range(count):
        row = RoomPrediction(
            workspace_id=ws_id,
            device_id="DEV_RET",
            timestamp=ts - _dt.timedelta(seconds=i),
            predicted_room_id=1,
            predicted_room_name="Room A",
            confidence=0.9,
        )
        db.add(row)
    await db.flush()


async def _count_rows(db: AsyncSession, model, ws_id: int) -> int:
    result = await db.execute(
        select(func.count(model.id)).where(model.workspace_id == ws_id)
    )
    return result.scalar_one()


# ── Service Tests ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_old_imu_deletes_only_expired(db_session: AsyncSession):
    """IMU rows older than retention_days are deleted; recent rows kept."""
    ws = await _create_workspace(db_session)

    # 5 old rows (10 days) + 3 recent rows (1 day)
    await _seed_imu(db_session, ws.id, count=5, days_old=10)
    await _seed_imu(db_session, ws.id, count=3, days_old=1)
    await db_session.commit()

    deleted = await RetentionService.delete_old_imu_telemetry(
        db_session, ws_id=ws.id, days=7,
    )

    assert deleted == 5
    remaining = await _count_rows(db_session, IMUTelemetry, ws.id)
    assert remaining == 3


@pytest.mark.asyncio
async def test_delete_old_rssi_deletes_only_expired(db_session: AsyncSession):
    ws = await _create_workspace(db_session)

    await _seed_rssi(db_session, ws.id, count=4, days_old=10)
    await _seed_rssi(db_session, ws.id, count=2, days_old=1)
    await db_session.commit()

    deleted = await RetentionService.delete_old_rssi_readings(
        db_session, ws_id=ws.id, days=7,
    )

    assert deleted == 4
    remaining = await _count_rows(db_session, RSSIReading, ws.id)
    assert remaining == 2


@pytest.mark.asyncio
async def test_delete_old_predictions_deletes_only_expired(db_session: AsyncSession):
    ws = await _create_workspace(db_session)

    await _seed_predictions(db_session, ws.id, count=6, days_old=35)
    await _seed_predictions(db_session, ws.id, count=4, days_old=5)
    await db_session.commit()

    deleted = await RetentionService.delete_old_room_predictions(
        db_session, ws_id=ws.id, days=30,
    )

    assert deleted == 6
    remaining = await _count_rows(db_session, RoomPrediction, ws.id)
    assert remaining == 4


@pytest.mark.asyncio
async def test_delete_nothing_when_all_recent(db_session: AsyncSession):
    """No deletions when all data is within retention period."""
    ws = await _create_workspace(db_session)

    await _seed_imu(db_session, ws.id, count=5, days_old=2)
    await db_session.commit()

    deleted = await RetentionService.delete_old_imu_telemetry(
        db_session, ws_id=ws.id, days=7,
    )

    assert deleted == 0
    remaining = await _count_rows(db_session, IMUTelemetry, ws.id)
    assert remaining == 5


@pytest.mark.asyncio
async def test_workspace_isolation(db_session: AsyncSession):
    """Retention only deletes data from the specified workspace."""
    ws1 = Workspace(name="ws1_ret", is_active=True)
    ws2 = Workspace(name="ws2_ret", is_active=False)
    db_session.add_all([ws1, ws2])
    await db_session.flush()

    await _seed_imu(db_session, ws1.id, count=3, days_old=10)
    await _seed_imu(db_session, ws2.id, count=3, days_old=10)
    await db_session.commit()

    deleted = await RetentionService.delete_old_imu_telemetry(
        db_session, ws_id=ws1.id, days=7,
    )

    assert deleted == 3
    # ws2 data untouched
    ws2_remaining = await _count_rows(db_session, IMUTelemetry, ws2.id)
    assert ws2_remaining == 3


@pytest.mark.asyncio
async def test_get_retention_stats(db_session: AsyncSession):
    ws = await _create_workspace(db_session)

    await _seed_imu(db_session, ws.id, count=10, days_old=3)
    await _seed_rssi(db_session, ws.id, count=5, days_old=3)
    await _seed_predictions(db_session, ws.id, count=8, days_old=3)
    await db_session.commit()

    stats = await RetentionService.get_retention_stats(db_session, ws_id=ws.id)

    assert stats.total_rows == 23
    assert len(stats.tables) == 3

    imu_stats = next(t for t in stats.tables if t.table_name == "imu_telemetry")
    assert imu_stats.row_count == 10


@pytest.mark.asyncio
async def test_run_full_cleanup(db_session: AsyncSession):
    ws = await _create_workspace(db_session)

    await _seed_imu(db_session, ws.id, count=5, days_old=10)
    await _seed_rssi(db_session, ws.id, count=3, days_old=10)
    await _seed_predictions(db_session, ws.id, count=4, days_old=35)
    # Some recent data that should survive
    await _seed_imu(db_session, ws.id, count=2, days_old=1)
    await db_session.commit()

    report = await RetentionService.run_full_cleanup(
        db_session, ws_id=ws.id,
        imu_days=7, rssi_days=7, predictions_days=30,
    )

    assert report.total_deleted == 12  # 5 + 3 + 4
    assert len(report.results) == 3
    assert report.duration_seconds >= 0

    # Recent IMU data survived
    remaining = await _count_rows(db_session, IMUTelemetry, ws.id)
    assert remaining == 2


# ── API Tests ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_retention_stats_endpoint(client):
    resp = await client.get("/api/retention/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "tables" in data
    assert "total_rows" in data


@pytest.mark.asyncio
async def test_retention_config_endpoint(client):
    resp = await client.get("/api/retention/config")
    assert resp.status_code == 200
    data = resp.json()
    assert "retention_enabled" in data
    assert "retention_imu_days" in data


@pytest.mark.asyncio
async def test_retention_run_endpoint(client):
    resp = await client.post("/api/retention/run")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_deleted" in data
    assert "results" in data
