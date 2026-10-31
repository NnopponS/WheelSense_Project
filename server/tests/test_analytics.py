"""Tests for analytics service and /api/analytics endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models.activity import Alert
from app.models.core import Workspace
from app.models.patients import Patient
from app.models.users import User
from app.services.analytics import AnalyticsService


@pytest.mark.asyncio
async def test_analytics_service_alert_summary_uses_status(
    db_session: AsyncSession,
    admin_user: User,
):
    """Alert counts use status column, not is_resolved."""
    ws_id = admin_user.workspace_id
    db_session.add_all(
        [
            Alert(
                workspace_id=ws_id,
                alert_type="fall",
                severity="critical",
                title="Fall",
                description="",
                status="active",
            ),
            Alert(
                workspace_id=ws_id,
                alert_type="fall",
                severity="critical",
                title="Fall2",
                description="",
                status="resolved",
            ),
            Alert(
                workspace_id=ws_id,
                alert_type="abnormal_hr",
                severity="warning",
                title="HR",
                description="",
                status="acknowledged",
            ),
        ]
    )
    await db_session.commit()

    out = await AnalyticsService.get_alert_summary(db_session, ws_id)
    assert out.total_active == 2  # active + acknowledged
    assert out.total_resolved == 1
    assert out.by_type.get("fall") == 1
    assert out.by_type.get("abnormal_hr") == 1


@pytest.mark.asyncio
async def test_analytics_service_ward_summary(
    db_session: AsyncSession,
    admin_user: User,
):
    ws_id = admin_user.workspace_id
    p = Patient(
        workspace_id=ws_id,
        first_name="A",
        last_name="B",
        care_level="standard",
    )
    db_session.add(p)
    await db_session.flush()
    db_session.add(
        Alert(
            workspace_id=ws_id,
            patient_id=p.id,
            alert_type="fall",
            severity="critical",
            title="t",
            description="",
            status="active",
        )
    )
    await db_session.commit()

    out = await AnalyticsService.get_ward_summary(db_session, ws_id)
    assert out.total_patients == 1
    assert out.active_alerts >= 1


@pytest.mark.asyncio
async def test_api_analytics_endpoints_ok(client: AsyncClient):
    r = await client.get("/api/analytics/alerts/summary")
    assert r.status_code == 200
    data = r.json()
    assert "total_active" in data
    assert "total_resolved" in data
    assert "by_type" in data

    r2 = await client.get("/api/analytics/vitals/averages?hours=24")
    assert r2.status_code == 200

    r3 = await client.get("/api/analytics/wards/summary")
    assert r3.status_code == 200
    assert "total_patients" in r3.json()


@pytest.mark.asyncio
async def test_ward_summary_forbidden_for_observer(
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    """Observer may not access ward summary (admin + supervisor only)."""
    ws_id = admin_user.workspace_id
    obs = User(
        username="observer_analytics",
        hashed_password=get_password_hash("p"),
        role="observer",
        workspace_id=ws_id,
    )
    db_session.add(obs)
    await db_session.commit()

    from app.main import app
    from app.api.dependencies import get_db
    from unittest.mock import AsyncMock, patch

    async def _override_db():
        yield db_session

    token = create_access_token(subject=str(obs.id), role=obs.role)
    headers = {"Authorization": f"Bearer {token}"}

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        from httpx import ASGITransport, AsyncClient

        app.dependency_overrides[get_db] = _override_db
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers=headers,
        ) as ac:
            r = await ac.get("/api/analytics/wards/summary")
            assert r.status_code == 403
        app.dependency_overrides.clear()
