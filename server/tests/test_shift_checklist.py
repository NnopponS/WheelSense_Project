"""Shift checklist API — workspace persistence and admin/head-nurse visibility."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import get_db
from app.core.security import get_password_hash
from app.models.users import User


@pytest.mark.asyncio
async def test_shift_checklist_observer_roundtrip(
    client: AsyncClient,
    db_session,
    admin_user: User,
    make_token_headers,
):
    observer = User(
        workspace_id=admin_user.workspace_id,
        username="obs_chk",
        hashed_password=get_password_hash("p"),
        role="observer",
        is_active=True,
    )
    db_session.add(observer)
    await db_session.commit()
    await db_session.refresh(observer)
    oh = make_token_headers(observer)

    d = "2026-04-12"
    r0 = await client.get(f"/api/shift-checklist/me?shift_date={d}", headers=oh)
    assert r0.status_code == 200
    j0 = r0.json()
    assert len(j0["items"]) == 8
    assert all(not x["checked"] for x in j0["items"])

    items = [dict(x) for x in j0["items"]]
    items[0]["checked"] = True
    items[1]["checked"] = False
    r1 = await client.put(
        "/api/shift-checklist/me",
        json={"shift_date": d, "items": items},
        headers=oh,
    )
    assert r1.status_code == 200, r1.text
    body = r1.json()
    assert body["user_id"] == observer.id
    assert len(body["items"]) == 8
    assert body["items"][0]["checked"] is True

    r2 = await client.get(f"/api/shift-checklist/me?shift_date={d}", headers=oh)
    assert r2.status_code == 200
    j2 = r2.json()
    assert len(j2["items"]) == 8
    assert j2["items"][0]["checked"] is True


@pytest.mark.asyncio
async def test_shift_checklist_workspace_admin_and_observer_forbidden(
    client: AsyncClient,
    db_session,
    admin_user: User,
    make_token_headers,
):
    observer = User(
        workspace_id=admin_user.workspace_id,
        username="obs_chk2",
        hashed_password=get_password_hash("p"),
        role="observer",
        is_active=True,
    )
    hn = User(
        workspace_id=admin_user.workspace_id,
        username="hn_chk",
        hashed_password=get_password_hash("p"),
        role="head_nurse",
        is_active=True,
    )
    db_session.add_all([observer, hn])
    await db_session.commit()
    await db_session.refresh(observer)
    await db_session.refresh(hn)

    d = "2026-04-13"
    g0 = await client.get(f"/api/shift-checklist/me?shift_date={d}", headers=make_token_headers(observer))
    assert g0.status_code == 200
    items = [dict(x) for x in g0.json()["items"]]
    items[0]["checked"] = True
    await client.put(
        "/api/shift-checklist/me",
        json={
            "shift_date": d,
            "items": items,
        },
        headers=make_token_headers(observer),
    )

    ws_admin = await client.get(f"/api/shift-checklist/workspace?shift_date={d}")
    assert ws_admin.status_code == 200
    rows = ws_admin.json()
    assert isinstance(rows, list)
    obs_row = next((r for r in rows if r["user_id"] == observer.id), None)
    assert obs_row is not None
    assert obs_row["percent_complete"] == 12
    assert obs_row["username"] == "obs_chk2"
    assert len(obs_row["items"]) == 8

    ws_hn = await client.get(
        f"/api/shift-checklist/workspace?shift_date={d}",
        headers=make_token_headers(hn),
    )
    assert ws_hn.status_code == 200

    forbidden = await client.get(
        f"/api/shift-checklist/workspace?shift_date={d}",
        headers=make_token_headers(observer),
    )
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_shift_checklist_template_head_nurse(
    client: AsyncClient,
    db_session,
    admin_user: User,
    make_token_headers,
):
    observer = User(
        workspace_id=admin_user.workspace_id,
        username="obs_tpl",
        hashed_password=get_password_hash("p"),
        role="observer",
        is_active=True,
    )
    hn = User(
        workspace_id=admin_user.workspace_id,
        username="hn_tpl",
        hashed_password=get_password_hash("p"),
        role="head_nurse",
        is_active=True,
    )
    db_session.add_all([observer, hn])
    await db_session.commit()
    await db_session.refresh(observer)
    await db_session.refresh(hn)
    hn_h = make_token_headers(hn)

    r0 = await client.get(f"/api/shift-checklist/users/{observer.id}/template", headers=hn_h)
    assert r0.status_code == 200
    assert len(r0.json()["items"]) == 8

    new_items = [
        {
            "id": "a1",
            "label_key": "observer.checklist.signIn",
            "checked": False,
            "category": "shift",
        },
        {
            "id": "a2",
            "label_key": "observer.checklist.emergencyEquip",
            "checked": False,
            "category": "shift",
        },
    ]
    r1 = await client.put(
        f"/api/shift-checklist/users/{observer.id}/template",
        json={"items": new_items},
        headers=hn_h,
    )
    assert r1.status_code == 200, r1.text
    assert len(r1.json()["items"]) == 2

    gme = await client.get("/api/shift-checklist/me?shift_date=2026-04-20", headers=make_token_headers(observer))
    assert gme.status_code == 200
    assert len(gme.json()["items"]) == 2


@pytest.mark.asyncio
async def test_shift_checklist_patient_forbidden_me(
    db_session,
    admin_user: User,
    make_token_headers,
):
    patient = User(
        workspace_id=admin_user.workspace_id,
        username="pat_chk",
        hashed_password=get_password_hash("p"),
        role="patient",
        patient_id=None,
        is_active=True,
    )
    db_session.add(patient)
    await db_session.commit()
    await db_session.refresh(patient)

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
                headers=make_token_headers(patient),
            ) as ac:
                res = await ac.get("/api/shift-checklist/me")
                assert res.status_code == 403
        finally:
            app.dependency_overrides.clear()
