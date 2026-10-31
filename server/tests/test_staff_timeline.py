from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_runtime.intent import IntentClassifier
from app.core.security import get_password_hash
from app.mcp import server as mcp_server
from app.models.caregivers import CareGiver, CareGiverDeviceAssignment
from app.models.tasks import Task, TaskReport
from app.models.telemetry import MobileDeviceTelemetry, RoomPrediction
from app.models.users import User


async def _seed_staff_timeline_rows(
    db_session: AsyncSession,
    workspace_id: int,
) -> tuple[CareGiver, User]:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    caregiver = CareGiver(
        workspace_id=workspace_id,
        first_name="Ann",
        last_name="Nurse",
        role="observer",
        department="Nursing",
        specialty="Mobility",
        phone="",
        email="ann@example.com",
    )
    db_session.add(caregiver)
    await db_session.flush()

    user = User(
        workspace_id=workspace_id,
        username="ann_staff_timeline",
        hashed_password=get_password_hash("pass"),
        role="observer",
        caregiver_id=caregiver.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    task = Task(
        workspace_id=workspace_id,
        task_type="specific",
        title="Morning mobility round",
        description="Assist assigned patients",
        priority="high",
        status="completed",
        assigned_user_id=user.id,
        assigned_user_ids=[user.id],
        created_by_user_id=user.id,
        completed_at=now - timedelta(minutes=30),
        created_at=now - timedelta(hours=2),
        updated_at=now - timedelta(minutes=30),
    )
    db_session.add(task)
    await db_session.flush()

    db_session.add(
        TaskReport(
            workspace_id=workspace_id,
            task_id=task.id,
            patient_id=None,
            submitted_by_user_id=user.id,
            notes="Round completed",
            report_data={"summary": "stable"},
            submitted_at=now - timedelta(minutes=25),
        )
    )
    db_session.add(
        CareGiverDeviceAssignment(
            workspace_id=workspace_id,
            caregiver_id=caregiver.id,
            device_id="MOB_STAFF_1",
            device_role="mobile_phone",
            assigned_at=now - timedelta(hours=3),
            is_active=True,
        )
    )
    db_session.add(
        MobileDeviceTelemetry(
            workspace_id=workspace_id,
            device_id="MOB_STAFF_1",
            timestamp=now - timedelta(minutes=10),
            battery_pct=88,
            charging=False,
            steps=42,
            linked_person_type="staff",
            linked_person_id=caregiver.id,
            source="mobile_rest",
        )
    )
    db_session.add(
        RoomPrediction(
            workspace_id=workspace_id,
            device_id="MOB_STAFF_1",
            timestamp=now - timedelta(minutes=5),
            predicted_room_id=101,
            predicted_room_name="Room 101",
            confidence=0.91,
            model_type="max_rssi",
        )
    )
    await db_session.commit()
    return caregiver, user


@pytest.mark.asyncio
async def test_caregiver_timeline_combines_task_report_and_movement_events(
    client: AsyncClient,
    admin_user: User,
    db_session: AsyncSession,
):
    caregiver, user = await _seed_staff_timeline_rows(db_session, admin_user.workspace_id)

    response = await client.get(f"/api/caregivers/{caregiver.id}/timeline?limit=20")

    assert response.status_code == 200
    body = response.json()
    assert body["caregiver_id"] == caregiver.id
    assert body["user_ids"] == [user.id]
    assert body["device_ids"] == ["MOB_STAFF_1"]

    event_types = [event["event_type"] for event in body["events"]]
    assert "task_completed" in event_types
    assert "task_report_submitted" in event_types
    assert "mobile_telemetry" in event_types
    assert "room_prediction" in event_types

    room_event = next(event for event in body["events"] if event["event_type"] == "room_prediction")
    assert room_event["room_name"] == "Room 101"
    assert room_event["metadata"]["confidence"] == 0.91


@pytest.mark.asyncio
async def test_staff_mcp_aliases_use_current_caregiver_model(
    admin_user: User,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    caregiver, user = await _seed_staff_timeline_rows(db_session, admin_user.workspace_id)

    class SameSession:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(mcp_server, "AsyncSessionLocal", lambda: SameSession())
    actor_context = {
        "user_id": admin_user.id,
        "role": "admin",
        "patient_id": None,
        "caregiver_id": None,
    }

    staff = await mcp_server.execute_workspace_tool(
        tool_name="list_staff",
        workspace_id=admin_user.workspace_id,
        actor_context=actor_context,
    )
    row = next(item for item in staff if item["id"] == caregiver.id)
    assert row["role"] == "observer"
    assert row["user_id"] == user.id
    assert "role_title" not in row

    details = await mcp_server.execute_workspace_tool(
        tool_name="get_staff_details",
        workspace_id=admin_user.workspace_id,
        arguments={"caregiver_id": caregiver.id},
        actor_context=actor_context,
    )
    assert details["role"] == "observer"
    assert details["users"][0]["id"] == user.id
    assert "access_level" not in details

    timeline = await mcp_server.execute_workspace_tool(
        tool_name="get_staff_timeline",
        workspace_id=admin_user.workspace_id,
        arguments={"caregiver_id": caregiver.id, "limit": 20},
        actor_context=actor_context,
    )
    assert {event["event_type"] for event in timeline["events"]} >= {
        "task_report_submitted",
        "room_prediction",
    }


def test_staff_intent_routes_to_staff_read_tools():
    classifier = IntentClassifier()

    match, immediate = classifier.classify("show staff directory")
    assert match is not None
    assert immediate == ("list_staff", {})

    match, immediate = classifier.classify("staff timeline 7")
    assert match is not None
    assert immediate is None
    assert match.tool_name == "get_staff_timeline"
    assert match.arguments == {"caregiver_id": 7}
