from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.dependencies import ROLE_CAPABILITIES, ROLE_TOKEN_SCOPES, RequireRole
from app.api.endpoints.devices import ROLE_DEVICE_MANAGERS
from app.roles import canonicalize_role, role_is_allowed
from app.schemas.caregivers import CareGiverCreate, CareGiverPatch
from app.schemas.mcp_auth import ROLE_MCP_SCOPES
from app.schemas.demo_control import DemoActorOut, DemoWorkflowAdvanceRequest
from app.schemas.support import SupportTicketCommentOut
from app.schemas.task_management import (
    DailyBoardUserRow,
    PatientFixRoutineCreate,
    RoutineTaskCreate,
)
from app.schemas.tasks import TaskBoardUserRow, TaskCreate
from app.schemas.users import UserCreate, UserUpdate
from app.schemas.workflow import (
    CareScheduleCreate,
    CareWorkflowJobAssigneeOut,
    RoleMessageCreate,
    WorkflowHandoffRequest,
    WorkflowPersonOut,
)
from app.services.ai_chat import (
    _ADMIN_ONLY_TOOLS,
    WORKSPACE_ACTION_MANAGER_ROLES,
    get_role_mcp_tool_allowlist,
    patient_exclusive_tools,
)
from app.services.calendar import CALENDAR_EDITOR_ROLES
from app.services.support import SUPPORT_MANAGER_ROLES
from app.services.tasks import STAFF_WIDE_ROLES
from app.services.workflow import _user_can_delete_message_row


def test_legacy_head_nurse_role_normalizes_to_head_caregiver() -> None:
    assert canonicalize_role("head_nurse") == "head_caregiver"


def test_legacy_supervisor_role_normalizes_to_head_caregiver() -> None:
    assert canonicalize_role("supervisor") == "head_caregiver"


def test_legacy_observer_role_normalizes_to_caregiver() -> None:
    assert canonicalize_role("observer") == "caregiver"


def test_canonical_and_unrelated_roles_are_unchanged() -> None:
    for role in ("admin", "head_caregiver", "caregiver", "patient", None):
        assert canonicalize_role(role) == role


def test_role_gate_compares_canonical_and_legacy_operational_lead_names() -> None:
    assert role_is_allowed("head_caregiver", {"head_caregiver"})
    assert role_is_allowed("head_nurse", {"head_caregiver"})
    assert role_is_allowed("supervisor", {"head_caregiver"})
    assert not role_is_allowed("head_caregiver", {"admin"})


def test_user_write_schemas_accept_legacy_input_but_emit_head_caregiver() -> None:
    assert UserCreate(username="legacy_user", password="secret1", role="head_nurse").role == "head_caregiver"
    assert UserCreate(username="legacy_user2", password="secret1", role="supervisor").role == "head_caregiver"
    assert UserUpdate(role="head_nurse").role == "head_caregiver"
    assert UserUpdate(role="supervisor").role == "head_caregiver"


def test_caregiver_write_schemas_accept_legacy_input_but_emit_head_caregiver() -> None:
    assert CareGiverCreate(first_name="Legacy", last_name="Lead", role="head_nurse").role == "head_caregiver"
    assert CareGiverCreate(first_name="Legacy", last_name="Lead", role="supervisor").role == "head_caregiver"
    assert CareGiverPatch(role="head_nurse").role == "head_caregiver"
    assert CareGiverPatch(role="supervisor").role == "head_caregiver"


def test_workflow_role_fields_accept_legacy_input_but_emit_head_caregiver() -> None:
    now = __import__("datetime").datetime.now(__import__("datetime").UTC)
    person = WorkflowPersonOut(
        user_id=1,
        username="lead",
        role="head_nurse",
        display_name="Lead",
        person_type="caregiver",
    )
    assert person.role == "head_caregiver"
    assert WorkflowHandoffRequest(target_mode="role", target_role="head_nurse").target_role == "head_caregiver"
    assert CareScheduleCreate(title="Round", starts_at=now, assigned_role="supervisor").assigned_role == "head_caregiver"
    assert RoleMessageCreate(recipient_role="head_nurse", body="Update").recipient_role == "head_caregiver"
    assert CareWorkflowJobAssigneeOut(user_id=1, role_hint="supervisor").role_hint == "head_caregiver"


def test_task_and_support_role_fields_emit_head_caregiver() -> None:
    now = __import__("datetime").datetime.now(__import__("datetime").UTC)
    assert TaskCreate(task_type="specific", title="Check", assigned_role="head_nurse").assigned_role == "head_caregiver"
    assert RoutineTaskCreate(title="Round", assigned_role="supervisor").assigned_role == "head_caregiver"
    assert PatientFixRoutineCreate(title="Routine", target_roles=["head_nurse"]).target_roles == ["head_caregiver"]
    assert TaskBoardUserRow(
        user_id=1,
        username="lead",
        display_name="Lead",
        role="head_nurse",
        total=0,
        in_progress=0,
        completed=0,
        skipped=0,
        pending=0,
        percent_complete=0,
        tasks=[],
    ).role == "head_caregiver"
    assert DailyBoardUserRow(
        user_id=1,
        username="lead",
        display_name="Lead",
        role="supervisor",
        total=0,
        done=0,
        skipped=0,
        pending=0,
        percent_complete=0,
        logs=[],
    ).role == "head_caregiver"
    assert SupportTicketCommentOut(
        id=1,
        workspace_id=1,
        ticket_id=1,
        author_user_id=1,
        author_role="head_nurse",
        body="Update",
        created_at=now,
    ).author_role == "head_caregiver"


def test_demo_role_fields_emit_head_caregiver() -> None:
    assert DemoActorOut(actor_type="user", actor_id=1, display_name="Lead", role="head_nurse").role == "head_caregiver"
    request = DemoWorkflowAdvanceRequest(target_mode="role", target_role="supervisor")
    assert request.target_role == "head_caregiver"


def test_head_caregiver_passes_role_gate_with_legacy_names() -> None:
    user = SimpleNamespace(role="head_caregiver")
    assert RequireRole(["admin", "head_caregiver"])(user) is user
    # Legacy head_nurse/supervisor should also pass a gate that accepts head_caregiver
    assert RequireRole(["head_caregiver"])(SimpleNamespace(role="head_nurse")) is not None


def test_head_caregiver_still_fails_admin_only_role_gate() -> None:
    with pytest.raises(HTTPException) as exc:
        RequireRole(["admin"])(SimpleNamespace(role="head_caregiver"))
    assert exc.value.status_code == 403


def test_head_caregiver_lacks_admin_only_capabilities() -> None:
    assert "facilities.manage" not in ROLE_CAPABILITIES["head_caregiver"]
    assert "audit.read" not in ROLE_CAPABILITIES["head_caregiver"]
    assert "reports.manage" in ROLE_CAPABILITIES["head_caregiver"]


def test_head_caregiver_mcp_tools_exclude_admin_and_patient_exclusive_tools() -> None:
    allowlist = get_role_mcp_tool_allowlist()
    head_caregiver_tools = allowlist["head_caregiver"]
    assert head_caregiver_tools.isdisjoint(_ADMIN_ONLY_TOOLS)
    assert head_caregiver_tools.isdisjoint(patient_exclusive_tools(head_caregiver_tools))


def test_head_caregiver_inherits_operational_lead_service_policies() -> None:
    for roles in (
        ROLE_DEVICE_MANAGERS,
        WORKSPACE_ACTION_MANAGER_ROLES,
        CALENDAR_EDITOR_ROLES,
        SUPPORT_MANAGER_ROLES,
        STAFF_WIDE_ROLES,
    ):
        assert "head_caregiver" in roles
    assert _user_can_delete_message_row(
        SimpleNamespace(sender_user_id=2, recipient_user_id=None),
        user_id=1,
        user_role="head_caregiver",
    )
