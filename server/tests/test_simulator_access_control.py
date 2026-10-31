"""Phase 2E — Simulator endpoint access control contract tests.

Verifies that simulator-only endpoints are admin-only and that
production mode rejects simulator reset/command even for admins.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import get_password_hash
from app.models.core import Workspace
from app.models.users import User


async def _make_user(
    db: AsyncSession,
    workspace_id: int,
    username: str,
    role: str,
) -> User:
    user = User(
        workspace_id=workspace_id,
        username=username,
        hashed_password=get_password_hash("password123"),
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_simulator_status_accessible_to_all_authenticated_roles(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    """GET /api/demo/simulator/status is read-only and available to all roles."""
    for role in ["admin", "head_caregiver", "caregiver", "patient"]:
        user = await _make_user(db_session, admin_user.workspace_id, f"sim_status_{role}", role)
        headers = make_token_headers(user)
        resp = await client.get("/api/demo/simulator/status", headers=headers)
        assert resp.status_code == 200, f"role {role} should read simulator status: {resp.text}"
        body = resp.json()
        assert "is_simulator" in body
        assert "env_mode" in body


@pytest.mark.asyncio
async def test_simulator_reset_admin_only(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    """POST /api/demo/simulator/reset is admin-only."""
    for role in ["head_caregiver", "caregiver", "patient"]:
        user = await _make_user(db_session, admin_user.workspace_id, f"sim_reset_{role}", role)
        headers = make_token_headers(user)
        resp = await client.post("/api/demo/simulator/reset", headers=headers)
        assert resp.status_code in (403, 401), f"role {role} must not reset simulator: {resp.status_code}"


@pytest.mark.asyncio
async def test_simulator_command_admin_only(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    """POST /api/demo/simulator/command is admin-only."""
    payload = {"command": "set_config", "config": {"enable_alerts": False}}
    for role in ["head_caregiver", "caregiver", "patient"]:
        user = await _make_user(db_session, admin_user.workspace_id, f"sim_cmd_{role}", role)
        headers = make_token_headers(user)
        resp = await client.post("/api/demo/simulator/command", json=payload, headers=headers)
        assert resp.status_code in (403, 401), f"role {role} must not send simulator commands: {resp.status_code}"


@pytest.mark.asyncio
async def test_demo_reset_admin_only(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    """POST /api/demo/reset is admin-only."""
    for role in ["head_caregiver", "caregiver", "patient"]:
        user = await _make_user(db_session, admin_user.workspace_id, f"demo_reset_{role}", role)
        headers = make_token_headers(user)
        resp = await client.post("/api/demo/reset", json={"profile": "show-demo"}, headers=headers)
        assert resp.status_code in (403, 401), f"role {role} must not reset demo: {resp.status_code}"


@pytest.mark.asyncio
async def test_demo_state_admin_only(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    """GET /api/demo/state is admin-only."""
    for role in ["head_caregiver", "caregiver", "patient"]:
        user = await _make_user(db_session, admin_user.workspace_id, f"demo_state_{role}", role)
        headers = make_token_headers(user)
        resp = await client.get("/api/demo/state", headers=headers)
        assert resp.status_code in (403, 401), f"role {role} must not read demo state: {resp.status_code}"


@pytest.mark.asyncio
async def test_simulator_reset_rejected_in_production_mode(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
    monkeypatch: pytest.MonkeyPatch,
):
    """POST /api/demo/simulator/reset returns 403 when ENV_MODE is not simulator."""
    monkeypatch.setattr(settings, "env_mode", "production")
    headers = make_token_headers(admin_user)
    resp = await client.post("/api/demo/simulator/reset", headers=headers)
    assert resp.status_code == 403
    body = resp.json()
    detail = body.get("detail") or str(body)
    assert "simulator mode" in detail.lower()


@pytest.mark.asyncio
async def test_simulator_command_rejected_in_production_mode(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
    monkeypatch: pytest.MonkeyPatch,
):
    """POST /api/demo/simulator/command returns 403 when ENV_MODE is not simulator."""
    monkeypatch.setattr(settings, "env_mode", "production")
    headers = make_token_headers(admin_user)
    payload = {"command": "set_config", "config": {"enable_alerts": False}}
    resp = await client.post("/api/demo/simulator/command", json=payload, headers=headers)
    assert resp.status_code == 403
    body = resp.json()
    detail = body.get("detail") or str(body)
    assert "simulator mode" in detail.lower()
