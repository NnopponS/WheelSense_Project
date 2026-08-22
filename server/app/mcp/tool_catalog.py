"""Canonical policy catalog for WheelSense MCP workspace tools.

The MCP registry lives in ``app.mcp.server`` because FastMCP decorators bind
runtime callables there.  This module intentionally stays registry-free to
avoid import cycles, and exposes one policy source that EaseAI routing,
allowlists, and execution safety can share.
"""

from __future__ import annotations

from collections.abc import Collection, Mapping
from dataclasses import dataclass, replace
from typing import Literal

ToolEffect = Literal["read", "write", "noop"]
ToolRisk = Literal["low", "medium", "high", "critical"]


@dataclass(frozen=True)
class ToolPolicy:
    name: str
    effect: ToolEffect
    risk: ToolRisk
    required_scope: str | None
    playbook: str
    patient_exclusive: bool = False
    easeai_forbidden: bool = False
    requires_confirmation: bool = True


_READ_PREFIXES = ("get_", "list_")
_WRITE_PREFIXES = (
    "acknowledge_",
    "add_",
    "assign_",
    "claim_",
    "control_",
    "create_",
    "delete_",
    "handoff_",
    "mark_",
    "register_",
    "request_",
    "resolve_",
    "send_",
    "set_",
    "trigger_",
    "unassign_",
    "update_",
)


_REQUIRED_SCOPE: dict[str, str | None] = {
    "get_current_user_context": None,
    "get_system_health": None,
    "list_workspaces": "workspace.read",
    "list_visible_patients": "patients.read",
    "get_patient_details": "patients.read",
    "update_patient_room": "patients.write",
    "create_patient_record": "patients.write",
    "list_devices": "devices.read",
    "list_active_alerts": "alerts.read",
    "acknowledge_alert": "alerts.manage",
    "resolve_alert": "alerts.manage",
    "list_rooms": "rooms.read",
    "trigger_camera_photo": "cameras.capture",
    "control_room_smart_device": "room_controls.use",
    "list_workflow_tasks": "workflow.read",
    "list_workflow_schedules": "workflow.read",
    "list_task_management_tasks": "workflow.read",
    "list_facilities": "workspace.read",
    "get_ai_runtime_summary": "ai_settings.read",
    "get_patient_vitals": "patients.read",
    "get_patient_health_analysis": "patients.read",
    "get_patient_timeline": "patients.read",
    "create_workflow_task": "workflow.write",
    "create_task_management_task": "workflow.write",
    "update_workflow_task_status": "workflow.write",
    "send_message": "workflow.write",
    "get_message_recipients": "workflow.read",
    "get_workspace_analytics": "workspace.read",
    "send_device_command": "devices.command",
    "get_facility_details": "rooms.read",
    "get_floorplan_layout": "rooms.read",
    "get_floorplan_presence": "rooms.read",
    "execute_python_code": None,
    "update_patient": "patients.write",
    "delete_patient": "patients.write",
    "set_patient_mode": "patients.write",
    "list_patient_devices": "patients.read",
    "assign_patient_device": "devices.manage",
    "unassign_patient_device": "devices.manage",
    "list_patient_caregivers": "patients.read",
    "update_patient_caregivers": "patients.write",
    "list_patient_contacts": "patients.read",
    "create_patient_contact": "patients.write",
    "update_patient_contact": "patients.write",
    "delete_patient_contact": "patients.write",
    "list_messages": "workflow.read",
    "mark_message_read": "workflow.write",
    "create_workflow_schedule": "workflow.write",
    "update_workflow_schedule": "workflow.write",
    "list_handover_notes": "workflow.read",
    "create_handover_note": "workflow.write",
    "list_care_directives": "workflow.read",
    "create_care_directive": "workflow.write",
    "update_care_directive": "workflow.write",
    "acknowledge_care_directive": "workflow.write",
    "get_audit_trail": "admin.audit.read",
    "claim_workflow_item": "workflow.write",
    "handoff_workflow_item": "workflow.write",
    "get_room_details": "rooms.read",
    "create_room": "rooms.manage",
    "update_room": "rooms.manage",
    "delete_room": "rooms.manage",
    "get_device_details": "devices.read",
    "list_device_activity": "devices.read",
    "register_device": "devices.manage",
    "update_device": "devices.manage",
    "assign_device_patient": "devices.manage",
    "list_caregivers": "patients.read",
    "list_staff": "patients.read",
    "create_caregiver": "caregivers.write",
    "get_caregiver_details": "patients.read",
    "get_staff_details": "patients.read",
    "get_staff_timeline": "patients.read",
    "update_caregiver": "caregivers.write",
    "delete_caregiver": "caregivers.write",
    "list_caregiver_patients": "patients.read",
    "update_caregiver_patients": "caregivers.write",
    "list_prescriptions": "medication.read",
    "create_prescription": "medication.write",
    "update_prescription": "medication.write",
    "list_pharmacy_orders": "medication.read",
    "request_pharmacy_order": "medication.read",
    "update_pharmacy_order": "medication.write",
    "list_support_tickets": "workflow.read",
    "create_support_ticket": "workflow.write",
    "update_support_ticket": "workflow.write",
    "add_support_comment": "workflow.write",
    "list_service_requests": "workflow.read",
    "create_service_request": "workflow.write",
    "update_service_request": "workflow.write",
    "get_my_shift_checklist": "workflow.read",
    "update_my_shift_checklist": "workflow.write",
    "list_workspace_shift_checklists": "workflow.read",
    "list_calendar_events": "workflow.read",
    "get_ai_settings": "ai_settings.read",
    "update_ai_settings": "ai_settings.write",
    "create_facility": "rooms.manage",
    "update_facility": "rooms.manage",
    "delete_facility": "rooms.manage",
    "list_facility_floors": "rooms.read",
    "create_facility_floor": "rooms.manage",
    "update_facility_floor": "rooms.manage",
    "list_users": "ai_settings.read",
    "create_user": "workspace.read",
    "update_user": "workspace.read",
    "delete_user": "workspace.read",
    "add_vital_reading": "vitals.write",
    "add_health_observation": "vitals.write",
    "add_timeline_event": "vitals.write",
    "create_alert": "alerts.manage",
    "sos_create_alert": "alerts.read",
    "get_alert_details": "alerts.read",
    "list_all_alerts": "alerts.read",
}

_PLAYBOOK_BY_SCOPE_PREFIX: tuple[tuple[str, str], ...] = (
    ("patients.", "patient-management"),
    ("vitals.", "clinical-triage"),
    ("alerts.", "clinical-triage"),
    ("devices.", "device-control"),
    ("cameras.", "device-control"),
    ("room_controls.", "device-control"),
    ("rooms.", "facility-ops"),
    ("workflow.", "workflow"),
    ("medication.", "workflow"),
    ("caregivers.", "patient-management"),
    ("admin.", "system"),
    ("ai_settings.", "system"),
    ("workspace.", "system"),
)

_HIGH_RISK_TOOLS = {
    "create_user",
    "delete_user",
    "delete_patient",
    "delete_caregiver",
    "delete_facility",
    "delete_room",
    "execute_python_code",
    "send_device_command",
    "update_ai_settings",
    "update_patient_room",
    "create_patient_record",
}

_MEDIUM_RISK_PREFIXES = _WRITE_PREFIXES
_CRITICAL_RISK_TOOLS = {"execute_python_code"}
_NOOP_TOOLS = {"get_current_user_context", "get_system_health"}
_EASEAI_FORBIDDEN_TOOLS = {"execute_python_code"}
_PATIENT_EXCLUSIVE_TOOLS = {"sos_create_alert"}


def _infer_effect(name: str) -> ToolEffect:
    if name in _NOOP_TOOLS:
        return "noop"
    if name.startswith(_READ_PREFIXES):
        return "read"
    if name.startswith(_WRITE_PREFIXES):
        return "write"
    return "write"


def _infer_playbook(required_scope: str | None, name: str) -> str:
    if name.startswith(("get_ai_", "update_ai_")):
        return "system"
    if required_scope is None:
        return "system"
    for prefix, playbook in _PLAYBOOK_BY_SCOPE_PREFIX:
        if required_scope.startswith(prefix):
            return playbook
    return "system"


def _infer_risk(name: str, effect: ToolEffect) -> ToolRisk:
    if name in _CRITICAL_RISK_TOOLS:
        return "critical"
    if effect == "read":
        return "low"
    if name in _HIGH_RISK_TOOLS:
        return "high"
    if name.startswith(_MEDIUM_RISK_PREFIXES):
        return "medium"
    return "medium"


def get_tool_policy(name: str) -> ToolPolicy:
    if name not in _REQUIRED_SCOPE and name not in _NOOP_TOOLS:
        raise KeyError(f"Unknown MCP tool policy: {name}")
    effect = _infer_effect(name)
    required_scope = _REQUIRED_SCOPE.get(name)
    risk = _infer_risk(name, effect)
    policy = ToolPolicy(
        name=name,
        effect=effect,
        risk=risk,
        required_scope=required_scope,
        playbook=_infer_playbook(required_scope, name),
        patient_exclusive=name in _PATIENT_EXCLUSIVE_TOOLS,
        easeai_forbidden=name in _EASEAI_FORBIDDEN_TOOLS,
        requires_confirmation=effect == "write",
    )
    if name == "execute_python_code":
        policy = replace(policy, effect="write", risk="critical", requires_confirmation=True)
    return policy


def build_tool_catalog(tool_names: set[str] | frozenset[str]) -> dict[str, ToolPolicy]:
    return {name: get_tool_policy(name) for name in sorted(tool_names)}


def is_tool_read_only(name: str) -> bool:
    try:
        return get_tool_policy(name).effect != "write"
    except KeyError:
        return False


def requires_confirmation(name: str) -> bool:
    try:
        return get_tool_policy(name).requires_confirmation
    except KeyError:
        return True


def tool_intent_metadata(name: str) -> dict[str, object]:
    policy = get_tool_policy(name)
    risk_level = "high" if policy.risk == "critical" else policy.risk
    return {
        "playbook": policy.playbook,
        "permission_basis": [policy.required_scope] if policy.required_scope else [],
        "risk_level": risk_level,
        "read_only": policy.effect != "write",
    }


def easeai_forbidden_tools(tool_names: set[str] | frozenset[str]) -> set[str]:
    return {name for name in tool_names if get_tool_policy(name).easeai_forbidden}


def patient_exclusive_tools(tool_names: set[str] | frozenset[str]) -> set[str]:
    return {name for name in tool_names if get_tool_policy(name).patient_exclusive}


def read_only_tools(tool_names: set[str] | frozenset[str]) -> frozenset[str]:
    return frozenset(name for name in tool_names if is_tool_read_only(name))


def mutating_tools(tool_names: set[str] | frozenset[str]) -> frozenset[str]:
    return frozenset(name for name in tool_names if not is_tool_read_only(name))


def missing_catalog_scopes(tool_names: set[str] | frozenset[str]) -> list[str]:
    return sorted(
        name
        for name in tool_names
        if name not in _REQUIRED_SCOPE and name not in {"get_current_user_context", "get_system_health"}
    )


def validate_catalog_coverage(registry: Mapping[str, object] | Collection[str]) -> None:
    registry_names = set(registry.keys() if isinstance(registry, Mapping) else registry)
    catalog_names = set(_REQUIRED_SCOPE) | _NOOP_TOOLS
    missing = sorted(registry_names - catalog_names)
    extra = sorted(catalog_names - registry_names)
    if missing or extra:
        raise ValueError(f"MCP tool catalog coverage mismatch: missing={missing}, extra={extra}")

    name_mismatches = sorted(name for name, policy in build_tool_catalog(registry_names).items() if policy.name != name)
    if name_mismatches:
        raise ValueError(f"MCP tool catalog name mismatch: {name_mismatches}")

    read_only_mutations = sorted(name for name in mutating_tools(registry_names) if is_tool_read_only(name))
    if read_only_mutations:
        raise ValueError(f"MCP mutation tools marked read-only: {read_only_mutations}")


TOOL_CATALOG: dict[str, ToolPolicy] = build_tool_catalog(frozenset(_REQUIRED_SCOPE) | frozenset(_NOOP_TOOLS))
READ_ONLY_TOOL_NAMES: frozenset[str] = read_only_tools(frozenset(TOOL_CATALOG))
MUTATION_TOOL_NAMES: frozenset[str] = mutating_tools(frozenset(TOOL_CATALOG))
EASEAI_FORBIDDEN_TOOLS: frozenset[str] = frozenset(_EASEAI_FORBIDDEN_TOOLS)
PATIENT_EXCLUSIVE_TOOLS: frozenset[str] = frozenset(_PATIENT_EXCLUSIVE_TOOLS)


__all__ = [
    "ToolEffect",
    "ToolPolicy",
    "ToolRisk",
    "EASEAI_FORBIDDEN_TOOLS",
    "MUTATION_TOOL_NAMES",
    "PATIENT_EXCLUSIVE_TOOLS",
    "READ_ONLY_TOOL_NAMES",
    "TOOL_CATALOG",
    "build_tool_catalog",
    "easeai_forbidden_tools",
    "get_tool_policy",
    "is_tool_read_only",
    "missing_catalog_scopes",
    "mutating_tools",
    "patient_exclusive_tools",
    "read_only_tools",
    "requires_confirmation",
    "tool_intent_metadata",
    "validate_catalog_coverage",
]
