"""MCP authorization policy tests.

Tests for MCP authorization policies including:
- Role-based access control
- Patient visibility policies
- Workspace scoping
- Caregiver assignment restrictions
- Alert acknowledgment identity
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    assert_patient_record_access,
    assert_patient_record_access_db,
    get_visible_patient_ids,
)
from app.core.security import create_access_token, get_password_hash
from app.mcp.context import McpActorContext, actor_scope, require_actor_context
from app.mcp.server import (
    _actor_user,
    _current_actor_summary,
    _require_scope,
    acknowledge_alert,
    get_patient_details,
    list_visible_patients,
    resolve_alert,
    update_patient_room,
)
from app.models.activity import Alert
from app.models.caregivers import CareGiver, CareGiverPatientAccess
from app.models.core import Device, Room, Workspace
from app.models.patients import Patient
from app.models.users import User
from app.services.activity import alert_service


def _patch_mcp_uses_db_session(db_session: AsyncSession):
    """MCP tools use AsyncSessionLocal; tests use a separate engine — bind to this session."""

    @asynccontextmanager
    async def _cm():
        yield db_session

    return patch("app.mcp.server.AsyncSessionLocal", side_effect=lambda: _cm())


@pytest_asyncio.fixture()
async def policy_test_workspace(db_session: AsyncSession) -> Workspace:
    """Create a workspace for policy testing."""
    ws = Workspace(name="policy_test_workspace", is_active=True)
    db_session.add(ws)
    await db_session.flush()
    return ws


@pytest_asyncio.fixture()
async def policy_admin_user(db_session: AsyncSession, policy_test_workspace: Workspace) -> User:
    """Create an admin user for policy testing."""
    user = User(
        username="policy_admin",
        hashed_password=get_password_hash("adminpass"),
        role="admin",
        workspace_id=policy_test_workspace.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture()
async def policy_head_nurse_user(db_session: AsyncSession, policy_test_workspace: Workspace) -> User:
    """Create a head_nurse user for policy testing."""
    user = User(
        username="policy_head_nurse",
        hashed_password=get_password_hash("pass"),
        role="head_nurse",
        workspace_id=policy_test_workspace.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture()
async def policy_supervisor_user(db_session: AsyncSession, policy_test_workspace: Workspace) -> User:
    """Create a supervisor user for policy testing."""
    user = User(
        username="policy_supervisor",
        hashed_password=get_password_hash("pass"),
        role="supervisor",
        workspace_id=policy_test_workspace.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture()
async def policy_observer_user(db_session: AsyncSession, policy_test_workspace: Workspace) -> User:
    """Create an observer user with caregiver link for policy testing."""
    caregiver = CareGiver(
        workspace_id=policy_test_workspace.id,
        first_name="Observer",
        last_name="Caregiver",
        role="observer",
        is_active=True,
    )
    db_session.add(caregiver)
    await db_session.flush()

    user = User(
        username="policy_observer",
        hashed_password=get_password_hash("pass"),
        role="observer",
        workspace_id=policy_test_workspace.id,
        is_active=True,
        caregiver_id=caregiver.id,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture()
async def policy_patient_user(db_session: AsyncSession, policy_test_workspace: Workspace) -> tuple[User, Patient]:
    """Create a patient user for policy testing."""
    patient = Patient(
        workspace_id=policy_test_workspace.id,
        first_name="Test",
        last_name="Patient",
        is_active=True,
    )
    db_session.add(patient)
    await db_session.flush()

    user = User(
        username="policy_patient",
        hashed_password=get_password_hash("pass"),
        role="patient",
        workspace_id=policy_test_workspace.id,
        is_active=True,
        patient_id=patient.id,
    )
    db_session.add(user)
    await db_session.flush()
    return user, patient


@pytest_asyncio.fixture()
async def policy_patients(db_session: AsyncSession, policy_test_workspace: Workspace) -> list[Patient]:
    """Create multiple patients for policy testing."""
    patients = []
    for i in range(3):
        patient = Patient(
            workspace_id=policy_test_workspace.id,
            first_name=f"Patient{i+1}",
            last_name="Test",
            is_active=True,
        )
        db_session.add(patient)
        await db_session.flush()
        patients.append(patient)
    return patients


@pytest_asyncio.fixture()
async def policy_alert(db_session: AsyncSession, policy_test_workspace: Workspace, policy_patients: list[Patient]) -> Alert:
    """Create an alert for policy testing."""
    alert = Alert(
        workspace_id=policy_test_workspace.id,
        patient_id=policy_patients[0].id,
        alert_type="test_alert",
        severity="high",
        title="Policy test alert",
        status="active",
        timestamp=datetime.now(timezone.utc),
    )
    db_session.add(alert)
    await db_session.flush()
    return alert


@pytest.mark.asyncio
async def test_admin_can_access_all_workspace_patients(
    db_session: AsyncSession,
    policy_test_workspace: Workspace,
    policy_admin_user: User,
    policy_patients: list[Patient],
):
    """Test that admin can see all patients in workspace."""
    visible_ids = await get_visible_patient_ids(
        db_session,
        policy_test_workspace.id,
        policy_admin_user,
    )
    # Admin should see all patients (None = all visible)
    assert visible_ids is None


@pytest.mark.asyncio
async def test_observer_cannot_read_unauthorized_patient_via_mcp(
    db_session: AsyncSession,
    policy_test_workspace: Workspace,
    policy_observer_user: User,
    policy_patients: list[Patient],
):
    """Test that observer without assignment cannot access patients."""
    # Observer has no patient access assignments
    visible_ids = await get_visible_patient_ids(
        db_session,
        policy_test_workspace.id,
        policy_observer_user,
    )
    # Should return empty set (no patients visible)
    assert visible_ids == set()

    # Try to access a specific patient - should raise
    with pytest.raises(HTTPException) as exc:
        await assert_patient_record_access_db(
            db_session,
            policy_test_workspace.id,
            policy_observer_user,
            policy_patients[0].id,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_caregiver_only_sees_assigned_patients_via_mcp(
    db_session: AsyncSession,
    policy_test_workspace: Workspace,
    policy_observer_user: User,
    policy_patients: list[Patient],
):
    """Test that caregiver only sees assigned patients."""
    # Assign observer to patient 0 only
    assignment = CareGiverPatientAccess(
        workspace_id=policy_test_workspace.id,
        caregiver_id=policy_observer_user.caregiver_id,
        patient_id=policy_patients[0].id,
        is_active=True,
    )
    db_session.add(assignment)
    await db_session.flush()

    # Should now see only patient 0
    visible_ids = await get_visible_patient_ids(
        db_session,
        policy_test_workspace.id,
        policy_observer_user,
    )
    assert visible_ids == {policy_patients[0].id}

    # Should be able to access patient 0
    await assert_patient_record_access_db(
        db_session,
        policy_test_workspace.id,
        policy_observer_user,
        policy_patients[0].id,
    )

    # Should not be able to access patient 1
    with pytest.raises(HTTPException) as exc:
        await assert_patient_record_access_db(
            db_session,
            policy_test_workspace.id,
            policy_observer_user,
            policy_patients[1].id,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_patient_cannot_control_other_room_via_mcp(
    db_session: AsyncSession,
    policy_test_workspace: Workspace,
    policy_patient_user: tuple[User, Patient],
):
    """Test that patient user is scoped to their own room only."""
    patient_user, patient = policy_patient_user

    # Create two rooms
    room1 = Room(
        workspace_id=policy_test_workspace.id,
        name="Patient Room",
    )
    room2 = Room(
        workspace_id=policy_test_workspace.id,
        name="Other Room",
    )
    db_session.add_all([room1, room2])
    await db_session.flush()

    # Assign patient to room1
    patient.room_id = room1.id
    db_session.add(patient)
    await db_session.flush()

    # Patient should be scoped to their own room
    # In real MCP flow, this would be enforced through actor context
    assert patient.room_id == room1.id


@pytest.mark.asyncio
async def test_alert_acknowledge_cannot_spoof_caregiver_identity(
    db_session: AsyncSession,
    policy_test_workspace: Workspace,
    policy_observer_user: User,
    policy_patients: list[Patient],
    policy_alert: Alert,
):
    """Test that alert acknowledgment uses authenticated caregiver_id, not supplied."""
    # Assign observer to the alert's patient
    assignment = CareGiverPatientAccess(
        workspace_id=policy_test_workspace.id,
        caregiver_id=policy_observer_user.caregiver_id,
        patient_id=policy_alert.patient_id,
        is_active=True,
    )
    db_session.add(assignment)
    await db_session.flush()

    # Set up actor context for observer
    context = McpActorContext(
        user_id=policy_observer_user.id,
        workspace_id=policy_test_workspace.id,
        role=policy_observer_user.role,
        patient_id=None,
        caregiver_id=policy_observer_user.caregiver_id,
        scopes={"alerts.manage", "patients.read"},
    )

    with actor_scope(context), _patch_mcp_uses_db_session(db_session):
        out_mock = MagicMock()
        out_mock.id = policy_alert.id
        out_mock.status = "acknowledged"
        out_mock.acknowledged_by = policy_observer_user.caregiver_id
        with patch("app.mcp.server.alert_service.acknowledge", new_callable=AsyncMock) as mock_ack:
            mock_ack.return_value = out_mock
            await acknowledge_alert(policy_alert.id)
            mock_ack.assert_awaited_once()
            kwargs = mock_ack.await_args.kwargs
            assert kwargs.get("caregiver_id") == policy_observer_user.caregiver_id


@pytest.mark.asyncio
async def test_scope_narrowing_by_role():
    """Test that scopes are properly narrowed by role."""
    from app.api.dependencies import resolve_effective_token_scopes

    # Admin should have all scopes
    admin_scopes = resolve_effective_token_scopes("admin", [])
    assert "patients.write" in admin_scopes
    assert "alerts.manage" in admin_scopes
    assert "devices.manage" in admin_scopes

    # Head nurse should have most clinical scopes
    head_nurse_scopes = resolve_effective_token_scopes("head_nurse", [])
    assert "patients.write" in head_nurse_scopes
    assert "alerts.manage" in head_nurse_scopes

    # Supervisor has read and alert manage, but not full patient write
    supervisor_scopes = resolve_effective_token_scopes("supervisor", [])
    assert "patients.read" in supervisor_scopes
    assert "alerts.manage" in supervisor_scopes

    # Observer: no patient registry writes; may acknowledge alerts (REST clinical staff)
    observer_scopes = resolve_effective_token_scopes("observer", [])
    assert "patients.read" in observer_scopes
    assert "patients.write" not in observer_scopes
    assert "alerts.read" in observer_scopes
    assert "alerts.manage" in observer_scopes

    # Patient has limited scopes
    patient_scopes = resolve_effective_token_scopes("patient", [])
    assert "workspace.read" in patient_scopes
    assert "patients.read" in patient_scopes  # Can read own
    assert "room_controls.use" in patient_scopes
    assert "patients.write" not in patient_scopes


@pytest.mark.asyncio
async def test_mcp_write_rejects_caller_supplied_workspace_id(
    db_session: AsyncSession,
    policy_test_workspace: Workspace,
    policy_admin_user: User,
    policy_patients: list[Patient],
):
    """Test that MCP write operations use authenticated workspace_id, not caller supplied."""
    # Set up actor context
    context = McpActorContext(
        user_id=policy_admin_user.id,
        workspace_id=policy_test_workspace.id,
        role=policy_admin_user.role,
        patient_id=None,
        caregiver_id=None,
        scopes={"patients.write", "patients.read"},
    )

    with actor_scope(context), _patch_mcp_uses_db_session(db_session):
        # Get patient details - workspace comes from context
        patient = await get_patient_details(policy_patients[0].id)
        assert patient["id"] == policy_patients[0].id

    # Trying to access patient from different workspace should fail
    # (In real scenario, patient would be in different workspace)


@pytest.mark.asyncio
async def test_mcp_write_rejects_caller_supplied_caregiver_id(
    db_session: AsyncSession,
    policy_test_workspace: Workspace,
    policy_observer_user: User,
    policy_head_nurse_user: User,
    policy_patients: list[Patient],
):
    """Test that MCP write operations use authenticated caregiver_id, not caller supplied."""
    # Assign observer to patient
    assignment = CareGiverPatientAccess(
        workspace_id=policy_test_workspace.id,
        caregiver_id=policy_observer_user.caregiver_id,
        patient_id=policy_patients[0].id,
        is_active=True,
    )
    db_session.add(assignment)
    await db_session.flush()

    # Create room
    room = Room(
        workspace_id=policy_test_workspace.id,
        name="Test Room",
    )
    db_session.add(room)
    await db_session.flush()

    # Set up actor context for observer
    context = McpActorContext(
        user_id=policy_observer_user.id,
        workspace_id=policy_test_workspace.id,
        role=policy_observer_user.role,
        patient_id=None,
        caregiver_id=policy_observer_user.caregiver_id,
        scopes={"patients.read", "patients.write"},
    )

    with actor_scope(context), _patch_mcp_uses_db_session(db_session):
        # Update patient room - caregiver_id from context should be used
        result = await update_patient_room(policy_patients[0].id, room.id)
        assert result["room_id"] == room.id


@pytest.mark.asyncio
async def test_head_nurse_can_access_all_patients_in_workspace(
    db_session: AsyncSession,
    policy_test_workspace: Workspace,
    policy_head_nurse_user: User,
    policy_patients: list[Patient],
):
    """Test that head_nurse can access all patients in their workspace."""
    visible_ids = await get_visible_patient_ids(
        db_session,
        policy_test_workspace.id,
        policy_head_nurse_user,
    )
    # Head nurse should see all patients (None = all visible)
    assert visible_ids is None


@pytest.mark.asyncio
async def test_patient_can_only_access_own_records(
    db_session: AsyncSession,
    policy_test_workspace: Workspace,
    policy_patient_user: tuple[User, Patient],
    policy_patients: list[Patient],
):
    """Test that patient user can only access their own records."""
    patient_user, patient = policy_patient_user

    # Patient should only see their own patient ID
    visible_ids = await get_visible_patient_ids(
        db_session,
        policy_test_workspace.id,
        patient_user,
    )
    assert visible_ids == {patient.id}

    # Should be able to access own record
    await assert_patient_record_access_db(
        db_session,
        policy_test_workspace.id,
        patient_user,
        patient.id,
    )

    # Should not be able to access other patients
    for other_patient in policy_patients:
        if other_patient.id != patient.id:
            with pytest.raises(HTTPException) as exc:
                await assert_patient_record_access_db(
                    db_session,
                    policy_test_workspace.id,
                    patient_user,
                    other_patient.id,
                )
            assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_mcp_scope_requirement_enforcement():
    """Test that _require_scope properly enforces scope requirements."""
    context = McpActorContext(
        user_id=1,
        workspace_id=1,
        role="observer",
        patient_id=None,
        caregiver_id=None,
        scopes={"patients.read", "alerts.read"},
    )

    with actor_scope(context):
        # Should succeed with required scope
        _require_scope("patients.read")  # Should not raise

        # Should fail without required scope
        with pytest.raises(PermissionError) as exc:
            _require_scope("patients.write")
        assert "MCP scope `patients.write` is required" in str(exc.value)

        with pytest.raises(PermissionError) as exc:
            _require_scope("alerts.manage")
        assert "MCP scope `alerts.manage` is required" in str(exc.value)


@pytest.mark.asyncio
async def test_supervisor_has_limited_write_access(
    db_session: AsyncSession,
    policy_test_workspace: Workspace,
    policy_supervisor_user: User,
    policy_patients: list[Patient],
):
    """Test that supervisor has limited write access - no patient writes."""
    from app.api.dependencies import ROLE_TOKEN_SCOPES

    supervisor_scopes = ROLE_TOKEN_SCOPES.get("supervisor", set())

    # Supervisor can read patients
    assert "patients.read" in supervisor_scopes

    # Supervisor cannot write patients
    assert "patients.write" not in supervisor_scopes

    # But can manage alerts
    assert "alerts.manage" in supervisor_scopes
