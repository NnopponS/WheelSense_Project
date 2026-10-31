"""Admin database clear API."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import get_db
from app.core.security import create_access_token, get_password_hash
from app.models.core import Workspace
from app.models.users import User


@pytest.mark.asyncio
async def test_admin_clear_database_wrong_password(client: AsyncClient):
    res = await client.post("/api/admin/database/clear", json={"password": "not-the-password"})
    assert res.status_code == 400
    body = res.json()
    msg = body.get("detail") or body.get("error", {}).get("message", "")
    assert "invalid" in str(msg).lower()


@pytest.mark.asyncio
async def test_admin_clear_database_success_new_workspace(
    client: AsyncClient,
    admin_user: User,
):
    old_ws = admin_user.workspace_id
    await client.post("/api/rooms", json={"name": "RoomClearMe", "description": ""})

    res = await client.post("/api/admin/database/clear", json={"password": "adminpass"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["preserved_user_id"] == admin_user.id
    assert body["new_workspace_id"] != old_ws

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["workspace_id"] == body["new_workspace_id"]

    rooms = await client.get("/api/rooms")
    assert rooms.status_code == 200
    assert rooms.json() == []


@pytest.mark.asyncio
async def test_admin_clear_database_non_admin_forbidden(
    db_session,
    admin_user: User,
    make_token_headers,
):
    observer = User(
        workspace_id=admin_user.workspace_id,
        username="observer_clear_db",
        hashed_password=get_password_hash("observer-pass"),
        role="observer",
        is_active=True,
    )
    db_session.add(observer)
    await db_session.commit()
    await db_session.refresh(observer)

    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        from app.main import app

        app.dependency_overrides[get_db] = _override_db
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
                headers=make_token_headers(observer),
            ) as ac:
                res = await ac.post(
                    "/api/admin/database/clear",
                    json={"password": "observer-pass"},
                )
                assert res.status_code == 403
        finally:
            app.dependency_overrides.clear()
