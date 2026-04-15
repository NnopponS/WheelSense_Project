import os
import datetime as _dt
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.testclient import TestClient

from app.models.core import Workspace
from app.models.telemetry import PhotoRecord
from app.services.camera import camera_service


async def _create_workspace(db: AsyncSession) -> Workspace:
    ws = Workspace(name="test_ws", is_active=True)
    db.add(ws)
    await db.flush()
    return ws


async def _seed_photo(db: AsyncSession, ws_id: int) -> PhotoRecord:
    photo = PhotoRecord(
        workspace_id=ws_id,
        device_id="CAM_1",
        photo_id="test_photo_id",
        filepath="/tmp/test_ws/test_photo_id.jpg",
        file_size=1024,
    )
    db.add(photo)
    await db.flush()
    return photo


@pytest.mark.asyncio
async def test_get_photos_for_workspace(db_session: AsyncSession):
    ws = await _create_workspace(db_session)
    await _seed_photo(db_session, ws.id)
    await db_session.commit()

    photos = await camera_service.get_multi(db_session, ws_id=ws.id)
    assert len(photos) == 1
    assert photos[0].device_id == "CAM_1"


@pytest.mark.asyncio
async def test_delete_photo_service(db_session: AsyncSession):
    ws = await _create_workspace(db_session)
    photo = await _seed_photo(db_session, ws.id)
    await db_session.commit()

    with patch("os.path.exists", return_value=True), patch("os.remove") as mock_remove:
        deleted = await camera_service.delete_photo(db_session, ws_id=ws.id, photo_id=photo.id)
        assert deleted is not None
        assert deleted.id == photo.id
        mock_remove.assert_called_once_with(photo.filepath)

    retrieved = await camera_service.get(db_session, ws_id=ws.id, id=photo.id)
    assert retrieved is None


from app.models.users import User

@pytest.mark.asyncio
async def test_api_list_photos(client: TestClient, db_session: AsyncSession, admin_user: User):
    # Setup state
    await _seed_photo(db_session, admin_user.workspace_id)
    await db_session.commit()

    # List API only returns rows whose file path still exists on disk.
    with patch("os.path.exists", return_value=True):
        resp = await client.get("/api/cameras/photos")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["photo_id"] == "test_photo_id"
    assert "/api/cameras/photos/" in data[0]["url"]


@pytest.mark.asyncio
async def test_api_delete_photo(client: TestClient, db_session: AsyncSession, admin_user: User):
    photo = await _seed_photo(db_session, admin_user.workspace_id)
    await db_session.commit()

    with patch("os.path.exists", return_value=True), patch("os.remove"):
        resp = await client.delete(f"/api/cameras/photos/{photo.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == photo.id

    # verify deleted from DB
    check_resp = await client.get("/api/cameras/photos")
    assert not any(p["id"] == photo.id for p in check_resp.json())
