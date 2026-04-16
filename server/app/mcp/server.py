from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
from collections.abc import Awaitable, Callable
from typing import Any

import aiomqtt
from mcp import types as mcp_types
from mcp.server.fastmcp import FastMCP
from sqlalchemy import select
from starlette.applications import Starlette
from starlette.routing import Mount

import app.config as config
from app.api.dependencies import (
    assert_patient_may_access_assigned_device_db,
    assert_patient_record_access_db,
    get_visible_patient_ids,
    resolve_effective_token_scopes,
)
from app.db.session import AsyncSessionLocal
from app.mcp.auth import wrap_mcp_app
from app.mcp.context import require_actor_context
from app.models.activity import Alert
from app.models.chat import WorkspaceAISettings
from app.models.core import Device, Room, SmartDevice, Workspace
from app.models.facility import Facility, Floor
from app.models.patients import Patient, PatientContact, PatientDeviceAssignment
from app.models.caregivers import CareGiver, CareGiverPatientAccess
from app.models.medication import Prescription, PharmacyOrder
from app.models.workflow import (
    AuditTrailEvent,
    CareDirective,
    CareSchedule,
    CareTask,
    HandoverNote,
    RoleMessage,
)
from app.models.users import User
from app.schemas.activity import AlertCreate, AlertResolve
from app.schemas.homeassistant import HADeviceControl
from app.schemas.patients import (
    PatientCreate,
    PatientUpdate,
    PatientContactCreate,
    PatientContactUpdate,
    ModeSwitchRequest,
    DeviceAssignmentCreate,
)
from app.schemas.caregivers import (
    CareGiverCreate,
    CareGiverPatch,
    CaregiverPatientAccessReplace,
)
from app.schemas.medication import (
    PrescriptionCreate,
    PrescriptionUpdate,
    PharmacyOrderRequest,
    PharmacyOrderUpdate,
)
from app.schemas.support import (
    SupportTicketCreateIn,
    SupportTicketPatchIn,
    SupportTicketCommentCreateIn,
)
from app.schemas.service_requests import ServiceRequestCreateIn, ServiceRequestPatchIn
from app.schemas.shift_checklist import ShiftChecklistPutIn
from app.schemas.core import RoomCreate, RoomUpdate
from app.schemas.devices import DeviceCommandRequest, DeviceCreate, DevicePatch, DevicePatientAssign
from app.schemas.users import UserCreate, UserUpdate
from app.services.activity import alert_service
from app.services.ai_chat import get_workspace_ai_defaults
from app.services.analytics import AnalyticsService
from app.services.auth import UserService
from app.services.homeassistant import ha_service
from app.services.medication import prescription_service, pharmacy_order_service
from app.services.patient import patient_service
from app.services.vitals import vital_reading_service, health_observation_service
from app.services.workflow import (
    audit_trail_service,
    care_directive_service,
    care_task_service,
    handover_note_service,
    role_message_service,
    schedule_service,
)
from app.services.activity import activity_service
from app.services.device_management import dispatch_command
from app.services.service_requests import service_request_service
from app.services.shift_checklist import shift_checklist_service
from app.services.support import SupportService
from app.services.calendar import list_calendar_events as calendar_list_events
from app.schemas.workflow import (
    CareDirectiveCreate,
    CareDirectiveUpdate,
    CareScheduleCreate,
    CareScheduleUpdate,
    CareTaskCreate,
    HandoverNoteCreate,
    RoleMessageCreate,
)

logger = logging.getLogger("wheelsense.mcp")
settings = config.settings

mcp = FastMCP("WheelSense")


def _require_scope(scope: str) -> None:
    actor = require_actor_context()
    if scope not in actor.scopes:
        raise PermissionError(f"MCP scope `{scope}` is required")


def _current_actor_summary() -> dict[str, Any]:
    actor = require_actor_context()
    return {
        "user_id": actor.user_id,
        "workspace_id": actor.workspace_id,
        "role": actor.role,
        "patient_id": actor.patient_id,
        "caregiver_id": actor.caregiver_id,
        "scopes": sorted(actor.scopes),
    }


def _json_payload(payload: Any) -> str:
    return json.dumps(payload, default=str, ensure_ascii=False)


async def _visible_patients_payload(query: str | None = None) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("patients.read")
    async with AsyncSessionLocal() as db:
        stmt = select(Patient).where(Patient.workspace_id == actor.workspace_id)
        visible_patient_ids = await get_visible_patient_ids(db, actor.workspace_id, _actor_user())
        if visible_patient_ids is not None:
            if not visible_patient_ids:
                return []
            stmt = stmt.where(Patient.id.in_(visible_patient_ids))
        rows = (await db.execute(stmt.order_by(Patient.id.asc()))).scalars().all()
        needle = (query or "").strip().lower()
        return [
            {
                "id": row.id,
                "first_name": row.first_name,
                "last_name": row.last_name,
                "nickname": row.nickname,
                "room_id": row.room_id,
                "care_level": row.care_level,
                "is_active": row.is_active,
            }
            for row in rows
            if not needle
            or needle in f"{row.first_name} {row.last_name}".lower()
            or needle in (row.nickname or "").lower()
        ]


def _actor_user() -> Any:
    actor = require_actor_context()
    return type(
        "McpActorUser",
        (),
        {
            "id": actor.user_id,
            "workspace_id": actor.workspace_id,
            "role": actor.role,
            "patient_id": actor.patient_id,
            "caregiver_id": actor.caregiver_id,
        },
    )()


@mcp.resource(
    "wheelsense://current-user",
    name="current_user_context",
    title="Current User Context",
    description="Current authenticated MCP user plus effective scopes and links.",
    mime_type="application/json",
)
async def current_user_resource() -> str:
    return _json_payload(_current_actor_summary())


@mcp.resource(
    "wheelsense://patients/visible",
    name="visible_patients",
    title="Visible Patients",
    description="Patients visible to the acting MCP user after backend policy filtering.",
    mime_type="application/json",
)
async def visible_patients_resource() -> str:
    return _json_payload(await _visible_patients_payload())


@mcp.resource(
    "wheelsense://alerts/active",
    name="active_alerts",
    title="Active Alerts",
    description="Workspace alerts filtered by the current user's visibility policy.",
    mime_type="application/json",
)
async def active_alerts_resource() -> str:
    return _json_payload(await list_active_alerts())


@mcp.resource(
    "wheelsense://rooms",
    name="rooms_catalog",
    title="Rooms",
    description="Rooms visible inside the actor's workspace.",
    mime_type="application/json",
)
async def rooms_resource() -> str:
    return _json_payload(await list_rooms())


@mcp.prompt(
    name="admin-operations",
    title="Admin Operations",
    description="Operational playbook for infrastructure, staffing, facilities, and broad workspace actions.",
)
def admin_operations_prompt() -> str:
    return (
        "Use workspace-wide reads first, then produce a concise plan. "
        "Never mutate patients, devices, facilities, or AI settings without an explicit confirmation step."
    )


@mcp.prompt(
    name="clinical-triage",
    title="Clinical Triage",
    description="Playbook for reading patient state, alerts, and workflow queues safely.",
)
def clinical_triage_prompt() -> str:
    return (
        "Prioritize active alerts, visible patients only, and current workflow load. "
        "Do not diagnose; summarize risks and next operational steps."
    )


@mcp.prompt(
    name="observer-shift-assistant",
    title="Observer Shift Assistant",
    description="Playbook for floor staff tasking and alert follow-up.",
)
def observer_shift_prompt() -> str:
    return "Focus on assigned patients, visible rooms, current tasks, and escalation hygiene."


@mcp.prompt(
    name="patient-support",
    title="Patient Support",
    description="Playbook for patient-safe assistance.",
)
def patient_support_prompt() -> str:
    return "Use simple language. Only use own-scope patient, room, and schedule information."


@mcp.prompt(
    name="device-control",
    title="Device Control",
    description="Playbook for device and room-control operations.",
)
def device_control_prompt() -> str:
    return "Validate target scope first, then describe the exact command or device mutation before execution."


@mcp.prompt(
    name="facility-ops",
    title="Facility Operations",
    description="Playbook for facilities, floorplans, and room workflows.",
)
def facility_ops_prompt() -> str:
    return "Ground on facilities, floors, rooms, and presence before proposing layout or room actions."


@mcp.tool(
    name="get_current_user_context",
    description="Read current MCP actor identity, workspace links, and effective scopes.",
    annotations=mcp_types.ToolAnnotations(
        title="Current User Context",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def get_current_user_context() -> dict[str, Any]:
    return _current_actor_summary()


@mcp.tool(
    name="get_system_health",
    description="Checks if the WheelSense platform backend is healthy.",
    annotations=mcp_types.ToolAnnotations(
        title="System Health",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def get_system_health() -> dict[str, Any]:
    return {"status": "ok", "message": "WheelSense Platform is running and healthy."}


@mcp.tool(
    name="list_workspaces",
    description="List the actor's current workspace context.",
    annotations=mcp_types.ToolAnnotations(
        title="List Workspaces",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def list_workspaces() -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("workspace.read")
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Workspace).where(Workspace.id == actor.workspace_id).order_by(Workspace.id)
        )
        rows = result.scalars().all()
        return [{"id": row.id, "name": row.name} for row in rows]


@mcp.tool(
    name="list_visible_patients",
    description="List patients visible to the acting user after backend policy filtering.",
    annotations=mcp_types.ToolAnnotations(
        title="List Visible Patients",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def list_visible_patients(query: str | None = None) -> list[dict[str, Any]]:
    return await _visible_patients_payload(query=query)


@mcp.tool(
    name="get_patient_details",
    description="Read a single patient if visible to the acting user.",
    annotations=mcp_types.ToolAnnotations(
        title="Get Patient Details",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def get_patient_details(patient_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.read")
    async with AsyncSessionLocal() as db:
        await assert_patient_record_access_db(db, actor.workspace_id, _actor_user(), patient_id)
        patient = await patient_service.get(db, ws_id=actor.workspace_id, id=patient_id)
        if not patient:
            raise ValueError("Patient not found")
        return {
            "id": patient.id,
            "first_name": patient.first_name,
            "last_name": patient.last_name,
            "nickname": patient.nickname,
            "room_id": patient.room_id,
            "care_level": patient.care_level,
            "is_active": patient.is_active,
            "medical_conditions": list(patient.medical_conditions or []),
            "allergies": list(patient.allergies or []),
            "medications": list(patient.medications or []),
        }


@mcp.tool(
    name="update_patient_room",
    description="Update the canonical facility room for a visible patient.",
    annotations=mcp_types.ToolAnnotations(
        title="Update Patient Room",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def update_patient_room(patient_id: int, room_id: int | None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.write")
    async with AsyncSessionLocal() as db:
        await assert_patient_record_access_db(db, actor.workspace_id, _actor_user(), patient_id)
        patient = await patient_service.get(db, ws_id=actor.workspace_id, id=patient_id)
        if not patient:
            raise ValueError("Patient not found")
        updated = await patient_service.update(
            db,
            ws_id=actor.workspace_id,
            db_obj=patient,
            obj_in=PatientUpdate(room_id=room_id),
        )
        return {
            "id": updated.id,
            "room_id": updated.room_id,
            "message": f"Patient {updated.id} room updated.",
        }


@mcp.tool(
    name="create_patient_record",
    description="Create a new patient record in the current workspace.",
    annotations=mcp_types.ToolAnnotations(
        title="Create Patient Record",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def create_patient_record(
    first_name: str,
    last_name: str,
    nickname: str = "",
    medical_conditions: list[str] | None = None,
    notes: str = "",
    care_level: str = "normal",
    room_id: int | None = None,
) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.write")
    async with AsyncSessionLocal() as db:
        created = await patient_service.create(
            db,
            ws_id=actor.workspace_id,
            obj_in=PatientCreate(
                first_name=first_name.strip(),
                last_name=last_name.strip(),
                nickname=nickname.strip(),
                medical_conditions=list(medical_conditions or []),
                notes=notes.strip(),
                care_level=care_level,
                room_id=room_id,
            ),
        )
        return {
            "id": created.id,
            "first_name": created.first_name,
            "last_name": created.last_name,
            "nickname": created.nickname,
            "room_id": created.room_id,
            "care_level": created.care_level,
            "medical_conditions": created.medical_conditions,
            "notes": created.notes,
            "message": f"Patient {created.first_name} {created.last_name} created.",
        }


@mcp.tool(
    name="list_devices",
    description="List devices visible to the acting user.",
    annotations=mcp_types.ToolAnnotations(
        title="List Devices",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def list_devices() -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("devices.read")
    async with AsyncSessionLocal() as db:
        stmt = select(Device).where(Device.workspace_id == actor.workspace_id)
        rows = (await db.execute(stmt.order_by(Device.id.asc()))).scalars().all()
        payload: list[dict[str, Any]] = []
        for row in rows:
            try:
                await assert_patient_may_access_assigned_device_db(db, actor.workspace_id, _actor_user(), row.device_id)
            except Exception:
                if actor.role == "patient":
                    continue
            payload.append(
                {
                    "id": row.id,
                    "device_id": row.device_id,
                    "device_type": row.device_type,
                    "hardware_type": getattr(row, "hardware_type", row.device_type),
                    "display_name": getattr(row, "display_name", "") or "",
                    "last_seen": row.last_seen.isoformat() if row.last_seen else None,
                }
            )
        return payload


@mcp.tool(
    name="list_active_alerts",
    description="List active alerts filtered by the acting user's patient visibility.",
    annotations=mcp_types.ToolAnnotations(
        title="List Active Alerts",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def list_active_alerts() -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("alerts.read")
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Alert)
            .where(Alert.workspace_id == actor.workspace_id, Alert.status != "resolved")
            .order_by(Alert.timestamp.desc())
            .limit(100)
        )
        visible_patient_ids = await get_visible_patient_ids(db, actor.workspace_id, _actor_user())
        rows = result.scalars().all()
        return [
            {
                "id": row.id,
                "alert_type": row.alert_type,
                "severity": row.severity,
                "status": row.status,
                "patient_id": row.patient_id,
                "created_at": row.timestamp.isoformat() if row.timestamp else None,
            }
            for row in rows
            if visible_patient_ids is None or row.patient_id in visible_patient_ids
        ]


@mcp.tool(
    name="acknowledge_alert",
    description="Acknowledge an alert as the current authenticated actor.",
    annotations=mcp_types.ToolAnnotations(
        title="Acknowledge Alert",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def acknowledge_alert(alert_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("alerts.manage")
    async with AsyncSessionLocal() as db:
        existing = await alert_service.get(db, ws_id=actor.workspace_id, id=alert_id)
        if not existing:
            raise ValueError("Alert not found")
        if existing.patient_id is not None:
            await assert_patient_record_access_db(db, actor.workspace_id, _actor_user(), existing.patient_id)
        out = await alert_service.acknowledge(
            db,
            ws_id=actor.workspace_id,
            alert_id=alert_id,
            caregiver_id=actor.caregiver_id,
        )
        if not out:
            raise ValueError("Alert could not be acknowledged")
        return {"id": out.id, "status": out.status, "acknowledged_by": out.acknowledged_by}


@mcp.tool(
    name="resolve_alert",
    description="Resolve an alert as the current authenticated actor.",
    annotations=mcp_types.ToolAnnotations(
        title="Resolve Alert",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def resolve_alert(alert_id: int, note: str = "") -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("alerts.manage")
    async with AsyncSessionLocal() as db:
        existing = await alert_service.get(db, ws_id=actor.workspace_id, id=alert_id)
        if not existing:
            raise ValueError("Alert not found")
        if existing.patient_id is not None:
            await assert_patient_record_access_db(db, actor.workspace_id, _actor_user(), existing.patient_id)
        out = await alert_service.resolve(
            db,
            ws_id=actor.workspace_id,
            alert_id=alert_id,
            resolution_note=note,
        )
        if not out:
            raise ValueError("Alert could not be resolved")
        return {"id": out.id, "status": out.status, "resolution_note": out.resolution_note}


@mcp.tool(
    name="list_rooms",
    description="List rooms in the actor's workspace.",
    annotations=mcp_types.ToolAnnotations(
        title="List Rooms",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def list_rooms() -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("rooms.read")
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(select(Room).where(Room.workspace_id == actor.workspace_id).order_by(Room.id.asc()))
        ).scalars().all()
        return [
            {"id": row.id, "name": row.name, "node_device_id": getattr(row, "node_device_id", None)}
            for row in rows
        ]


async def _publish_camera_command(device_id_str: str, payload: dict[str, Any]) -> None:
    topic = f"WheelSense/camera/{device_id_str}/control"
    async with aiomqtt.Client(
        hostname=settings.mqtt_broker,
        port=settings.mqtt_port,
        username=settings.mqtt_user or None,
        password=settings.mqtt_password or None,
    ) as client:
        await client.publish(topic, json.dumps(payload))


@mcp.tool(
    name="trigger_camera_photo",
    description="Trigger a camera capture for a visible camera device.",
    annotations=mcp_types.ToolAnnotations(
        title="Trigger Camera Photo",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def trigger_camera_photo(device_pk: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("cameras.capture")
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Device).where(Device.id == device_pk, Device.workspace_id == actor.workspace_id)
        )
        dev = result.scalar_one_or_none()
        if not dev:
            raise ValueError("Camera device not found in workspace")
        if dev.device_type != "camera":
            raise ValueError("Device is not a camera")
        await _publish_camera_command(dev.device_id, {"command": "capture_frame"})
        return {"device_id": dev.device_id, "message": f"Triggered photo capture for {dev.device_id}"}


@mcp.tool(
    name="control_room_smart_device",
    description="Control a room smart device with patient-safe room scoping.",
    annotations=mcp_types.ToolAnnotations(
        title="Control Room Smart Device",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def control_room_smart_device(
    device_id: int,
    action: str,
    value: str | int | float | bool | None = None,
) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("room_controls.use")
    current_user = _actor_user()
    async with AsyncSessionLocal() as db:
        from app.api.endpoints.homeassistant import _get_smart_device_for_user

        device = await _get_smart_device_for_user(db, actor.workspace_id, device_id, current_user)
        success = await ha_service.call_service(
            action,
            device.ha_entity_id,
            {"value": value} if value is not None else None,
        )
        if not success:
            raise RuntimeError("Home Assistant command failed")
        return {"device_id": device.id, "ha_entity_id": device.ha_entity_id, "action": action}


@mcp.tool(
    name="list_workflow_tasks",
    description="List visible workflow tasks for the acting user.",
    annotations=mcp_types.ToolAnnotations(
        title="List Workflow Tasks",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def list_workflow_tasks(limit: int = 20) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("workflow.read")
    async with AsyncSessionLocal() as db:
        visible_patient_ids = await get_visible_patient_ids(db, actor.workspace_id, _actor_user())
        tasks = await care_task_service.list_visible_tasks(
            db,
            ws_id=actor.workspace_id,
            user_id=actor.user_id,
            user_role=actor.role,
            visible_patient_ids=visible_patient_ids,
            limit=limit,
        )
        return [
            {
                "id": row.id,
                "title": row.title,
                "status": row.status,
                "priority": row.priority,
                "patient_id": row.patient_id,
            }
            for row in tasks
        ]


@mcp.tool(
    name="list_workflow_schedules",
    description="List visible workflow schedules for the acting user.",
    annotations=mcp_types.ToolAnnotations(
        title="List Workflow Schedules",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def list_workflow_schedules(limit: int = 20) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("workflow.read")
    async with AsyncSessionLocal() as db:
        visible_patient_ids = await get_visible_patient_ids(db, actor.workspace_id, _actor_user())
        rows = await schedule_service.list_schedules(
            db,
            ws_id=actor.workspace_id,
            visible_patient_ids=visible_patient_ids,
            patient_id=actor.patient_id if actor.role == "patient" else None,
            limit=limit,
        )
        return [
            {
                "id": row.id,
                "title": row.title,
                "status": row.status,
                "patient_id": row.patient_id,
                "room_id": row.room_id,
            }
            for row in rows
        ]


@mcp.tool(
    name="list_facilities",
    description="List facilities and floors in the actor's workspace.",
    annotations=mcp_types.ToolAnnotations(
        title="List Facilities",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def list_facilities() -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("workspace.read")
    async with AsyncSessionLocal() as db:
        facilities = (
            await db.execute(select(Facility).where(Facility.workspace_id == actor.workspace_id).order_by(Facility.id.asc()))
        ).scalars().all()
        floors = (
            await db.execute(select(Floor).where(Floor.workspace_id == actor.workspace_id).order_by(Floor.id.asc()))
        ).scalars().all()
        floors_by_facility: dict[int, list[dict[str, Any]]] = {}
        for floor in floors:
            floors_by_facility.setdefault(floor.facility_id, []).append(
                {"id": floor.id, "name": floor.name, "level": floor.level}
            )
        return [
            {"id": facility.id, "name": facility.name, "floors": floors_by_facility.get(facility.id, [])}
            for facility in facilities
        ]


@mcp.tool(
    name="get_ai_runtime_summary",
    description="Read workspace AI runtime/provider configuration for admin users.",
    annotations=mcp_types.ToolAnnotations(
        title="AI Runtime Summary",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def get_ai_runtime_summary() -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("ai_settings.read")
    async with AsyncSessionLocal() as db:
        provider, model = await get_workspace_ai_defaults(db, actor.workspace_id)
        row = (
            await db.execute(
                select(WorkspaceAISettings).where(WorkspaceAISettings.workspace_id == actor.workspace_id)
            )
        ).scalar_one_or_none()
        return {
            "provider": provider,
            "model": model,
            "copilot_connected": bool(row and row.copilot_token_encrypted),
        }


# =============================================================================
# Patient Vitals Tools
# =============================================================================

@mcp.tool(
    name="get_patient_vitals",
    description="Get patient vitals data including heart rate, SpO2, and temperature.",
    annotations=mcp_types.ToolAnnotations(
        title="Get Patient Vitals",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def get_patient_vitals(patient_id: int, limit: int = 20) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.read")
    async with AsyncSessionLocal() as db:
        await assert_patient_record_access_db(db, actor.workspace_id, _actor_user(), patient_id)
        vitals = await vital_reading_service.get_recent_by_patient(
            db, ws_id=actor.workspace_id, patient_id=patient_id, limit=limit
        )
        observations = await health_observation_service.get_recent_by_patient(
            db, ws_id=actor.workspace_id, patient_id=patient_id, limit=limit
        )
        return {
            "patient_id": patient_id,
            "vitals": [
                {
                    "id": v.id,
                    "timestamp": v.timestamp.isoformat() if v.timestamp else None,
                    "heart_rate_bpm": v.heart_rate_bpm,
                    "rr_interval_ms": v.rr_interval_ms,
                    "spo2": v.spo2,
                    "source": v.source,
                }
                for v in vitals
            ],
            "observations": [
                {
                    "id": o.id,
                    "timestamp": o.timestamp.isoformat() if o.timestamp else None,
                    "observation_type": o.observation_type,
                    "blood_pressure_sys": o.blood_pressure_sys,
                    "blood_pressure_dia": o.blood_pressure_dia,
                    "temperature_c": o.temperature_c,
                    "weight_kg": o.weight_kg,
                    "pain_level": o.pain_level,
                    "description": o.description,
                }
                for o in observations
            ],
        }


# =============================================================================
# Patient Timeline Tools
# =============================================================================

@mcp.tool(
    name="get_patient_timeline",
    description="Get patient timeline events and activity history.",
    annotations=mcp_types.ToolAnnotations(
        title="Get Patient Timeline",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def get_patient_timeline(patient_id: int, limit: int = 50) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.read")
    async with AsyncSessionLocal() as db:
        await assert_patient_record_access_db(db, actor.workspace_id, _actor_user(), patient_id)
        events = await activity_service.get_timeline_by_patient(
            db, ws_id=actor.workspace_id, patient_id=patient_id, limit=limit
        )
        return {
            "patient_id": patient_id,
            "events": [
                {
                    "id": e.id,
                    "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                    "event_type": e.event_type,
                    "description": e.description,
                    "caregiver_id": e.caregiver_id,
                    "data": e.data,
                }
                for e in events
            ],
        }


# =============================================================================
# Workflow Task Creation Tools
# =============================================================================

@mcp.tool(
    name="create_workflow_task",
    description="Create a new care task for a patient or workspace.",
    annotations=mcp_types.ToolAnnotations(
        title="Create Workflow Task",
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=False,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def create_workflow_task(
    title: str,
    patient_id: int | None = None,
    description: str = "",
    priority: str = "normal",
    assigned_role: str | None = None,
    assigned_user_id: int | None = None,
) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("workflow.write")
    async with AsyncSessionLocal() as db:
        if patient_id is not None:
            await assert_patient_record_access_db(db, actor.workspace_id, _actor_user(), patient_id)
        task = await care_task_service.create_task(
            db,
            ws_id=actor.workspace_id,
            actor_user_id=actor.user_id,
            obj_in=CareTaskCreate(
                title=title,
                patient_id=patient_id,
                description=description,
                priority=priority,
                assigned_role=assigned_role,
                assigned_user_id=assigned_user_id,
            ),
        )
        return {
            "id": task.id,
            "title": task.title,
            "status": task.status,
            "priority": task.priority,
            "patient_id": task.patient_id,
            "assigned_role": task.assigned_role,
            "assigned_user_id": task.assigned_user_id,
            "created_at": task.created_at.isoformat() if task.created_at else None,
        }


@mcp.tool(
    name="update_workflow_task_status",
    description="Update workflow task status: claim, handoff, or complete a task.",
    annotations=mcp_types.ToolAnnotations(
        title="Update Workflow Task Status",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def update_workflow_task_status(
    task_id: int,
    action: str,  # claim, handoff, complete, reopen
    target_role: str | None = None,
    target_user_id: int | None = None,
    note: str = "",
) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("workflow.write")
    async with AsyncSessionLocal() as db:
        task = await care_task_service.get(db, ws_id=actor.workspace_id, id=task_id)
        if not task:
            raise ValueError("Task not found")

        if action == "claim":
            result = await care_task_service.claim(
                db,
                ws_id=actor.workspace_id,
                actor_user_id=actor.user_id,
                task_id=task_id,
                note=note,
            )
        elif action == "handoff":
            result = await care_task_service.handoff(
                db,
                ws_id=actor.workspace_id,
                actor_user_id=actor.user_id,
                task_id=task_id,
                target_role=target_role,
                target_user_id=target_user_id,
                note=note,
            )
        elif action == "complete":
            result = await care_task_service.update_task(
                db,
                ws_id=actor.workspace_id,
                actor_user_id=actor.user_id,
                task_id=task_id,
                obj_in={"status": "completed"},
            )
        elif action == "reopen":
            result = await care_task_service.update_task(
                db,
                ws_id=actor.workspace_id,
                actor_user_id=actor.user_id,
                task_id=task_id,
                obj_in={"status": "pending"},
            )
        else:
            raise ValueError(f"Invalid action: {action}. Use claim, handoff, complete, or reopen.")

        if not result:
            raise RuntimeError(f"Failed to {action} task")

        return {
            "id": result.id,
            "title": result.title,
            "status": result.status,
            "action": action,
            "assigned_role": result.assigned_role,
            "assigned_user_id": result.assigned_user_id,
        }


# =============================================================================
# Messaging Tools
# =============================================================================

@mcp.tool(
    name="send_message",
    description="Send a workflow message to staff or patient.",
    annotations=mcp_types.ToolAnnotations(
        title="Send Message",
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=False,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def send_message(
    body: str,
    subject: str = "",
    recipient_role: str | None = None,
    recipient_user_id: int | None = None,
    patient_id: int | None = None,
) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("workflow.write")
    async with AsyncSessionLocal() as db:
        if patient_id is not None:
            await assert_patient_record_access_db(db, actor.workspace_id, _actor_user(), patient_id)
        message = await role_message_service.send_message(
            db,
            ws_id=actor.workspace_id,
            sender_user_id=actor.user_id,
            obj_in=RoleMessageCreate(
                recipient_role=recipient_role,
                recipient_user_id=recipient_user_id,
                patient_id=patient_id,
                subject=subject,
                body=body,
            ),
        )
        return {
            "id": message.id,
            "subject": message.subject,
            "recipient_role": message.recipient_role,
            "recipient_user_id": message.recipient_user_id,
            "patient_id": message.patient_id,
            "created_at": message.created_at.isoformat() if message.created_at else None,
        }


@mcp.tool(
    name="get_message_recipients",
    description="Get available message recipients in the workspace.",
    annotations=mcp_types.ToolAnnotations(
        title="Get Message Recipients",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def get_message_recipients(limit: int = 50) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("workspace.read")
    async with AsyncSessionLocal() as db:
        users = await UserService.search_users(
            db,
            ws_id=actor.workspace_id,
            roles=["admin", "head_nurse", "supervisor", "observer"],
            limit=limit,
        )
        return [
            {
                "user_id": u["user_id"],
                "username": u["username"],
                "role": u["role"],
                "display_name": u["display_name"],
                "person_type": u["person_type"],
            }
            for u in users
        ]


# =============================================================================
# Analytics Tools
# =============================================================================

@mcp.tool(
    name="get_workspace_analytics",
    description="Get workspace-level analytics summary including alerts and vitals.",
    annotations=mcp_types.ToolAnnotations(
        title="Get Workspace Analytics",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def get_workspace_analytics(hours: int = 24) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("workspace.read")
    async with AsyncSessionLocal() as db:
        alert_summary = await AnalyticsService.get_alert_summary(db, ws_id=actor.workspace_id)
        vitals_avg = await AnalyticsService.get_vitals_averages(
            db, ws_id=actor.workspace_id, hours=hours
        )
        ward_summary = await AnalyticsService.get_ward_summary(db, ws_id=actor.workspace_id)
        return {
            "workspace_id": actor.workspace_id,
            "alert_summary": {
                "total_active": alert_summary.total_active,
                "total_resolved": alert_summary.total_resolved,
                "by_type": alert_summary.by_type,
            },
            "vitals_averages": {
                "heart_rate_bpm_avg": vitals_avg.heart_rate_bpm_avg,
                "rr_interval_ms_avg": vitals_avg.rr_interval_ms_avg,
                "spo2_avg": vitals_avg.spo2_avg,
            },
            "ward_summary": {
                "total_patients": ward_summary.total_patients,
                "active_alerts": ward_summary.active_alerts,
                "critical_patients": ward_summary.critical_patients,
            },
        }


# =============================================================================
# Device Command Tools
# =============================================================================

@mcp.tool(
    name="send_device_command",
    description="Send command to wheelchair or device via MQTT.",
    annotations=mcp_types.ToolAnnotations(
        title="Send Device Command",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def send_device_command(
    device_id: str,
    command: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("devices.command")
    async with AsyncSessionLocal() as db:
        result = await dispatch_command(
            db,
            ws_id=actor.workspace_id,
            device_id=device_id,
            body=DeviceCommandRequest(
                channel="default",
                payload={**(payload or {}), "command": command},
            ),
        )
        return {
            "command_id": result.id,
            "device_id": result.device_id,
            "topic": result.topic,
            "status": result.status,
            "dispatched_at": result.dispatched_at.isoformat() if result.dispatched_at else None,
        }


# =============================================================================
# Facilities/Floorplans Tools
# =============================================================================

@mcp.tool(
    name="get_facility_details",
    description="Get facility details with floors and rooms.",
    annotations=mcp_types.ToolAnnotations(
        title="Get Facility Details",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def get_facility_details(facility_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("rooms.read")
    async with AsyncSessionLocal() as db:
        facility = await db.get(Facility, facility_id)
        if not facility or facility.workspace_id != actor.workspace_id:
            raise ValueError("Facility not found")

        floors = (
            await db.execute(
                select(Floor).where(Floor.facility_id == facility_id).order_by(Floor.level)
            )
        ).scalars().all()

        floor_ids = [f.id for f in floors]
        rooms = []
        if floor_ids:
            rooms = (
                await db.execute(
                    select(Room).where(Room.floor_id.in_(floor_ids)).order_by(Room.name)
                )
            ).scalars().all()

        rooms_by_floor: dict[int, list[dict[str, Any]]] = {}
        for room in rooms:
            rooms_by_floor.setdefault(room.floor_id, []).append(
                {
                    "id": room.id,
                    "name": room.name,
                    "node_device_id": room.node_device_id,
                }
            )

        return {
            "id": facility.id,
            "name": facility.name,
            "address": getattr(facility, "address", None),
            "floors": [
                {
                    "id": f.id,
                    "name": f.name,
                    "level": f.level,
                    "rooms": rooms_by_floor.get(f.id, []),
                }
                for f in floors
            ],
        }


@mcp.tool(
    name="get_floorplan_layout",
    description="Get floorplan layout data for a facility floor.",
    annotations=mcp_types.ToolAnnotations(
        title="Get Floorplan Layout",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def get_floorplan_layout(facility_id: int, floor_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("rooms.read")
    async with AsyncSessionLocal() as db:
        from app.services.floorplans import FloorplanLayoutService

        floor = await db.get(Floor, floor_id)
        if not floor or floor.workspace_id != actor.workspace_id:
            raise ValueError("Floor not found")

        layout = await FloorplanLayoutService.get_for_scope(
            db, ws_id=actor.workspace_id, facility_id=facility_id, floor_id=floor_id
        )

        return {
            "facility_id": facility_id,
            "floor_id": floor_id,
            "floor_name": floor.name,
            "layout": layout.layout_json if layout else None,
            "has_layout": layout is not None,
        }


@mcp.tool(
    name="execute_python_code",
    description="Executes python code within the workspace sandbox context (subprocess). Allowed for executing tests or data queries.",
    annotations=mcp_types.ToolAnnotations(
        title="Execute Python Code",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=True,
    ),
    structured_output=True,
)
async def execute_python_code(code: str) -> dict[str, Any]:
    actor = require_actor_context()
    
    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False, encoding="utf-8") as f:
        f.write(code)
        script_path = f.name
        
    env = os.environ.copy()
    env["WORKSPACE_ID"] = str(actor.workspace_id)
    env["DATABASE_URL"] = config.settings.database_url_sync
    
    try:
        result = subprocess.run(
            ["python", script_path],
            capture_output=True,
            text=True,
            env=env,
            timeout=30.0,
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
            "success": result.returncode == 0,
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "stdout": exc.stdout if isinstance(exc.stdout, str) else (exc.stdout.decode() if exc.stdout else ""),
            "stderr": exc.stderr if isinstance(exc.stderr, str) else (exc.stderr.decode() if exc.stderr else ""),
            "error": "Execution timed out",
            "success": False,
        }
    except Exception as exc:
        return {
            "error": str(exc),
            "success": False,
        }
    finally:
        try:
            os.remove(script_path)
        except OSError:
            pass



# ---------------------------------------------------------------------------
# BATCH A — Patient Management
# ---------------------------------------------------------------------------

@mcp.tool(name="update_patient", description="Update patient record fields (name, care level, notes, etc.).",
          annotations=mcp_types.ToolAnnotations(title="Update Patient", readOnlyHint=False, destructiveHint=False))
async def update_patient(patient_id: int, **kwargs: Any) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.write")
    async with AsyncSessionLocal() as db:
        p = (await db.execute(select(Patient).where(Patient.id == patient_id, Patient.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not p:
            raise ValueError(f"Patient {patient_id} not found")
        update_data = {k: v for k, v in kwargs.items() if v is not None}
        update = PatientUpdate(**update_data)
        updated = await patient_service.update(db, actor.workspace_id, p, update)
        return {"id": updated.id, "first_name": updated.first_name, "last_name": updated.last_name, "care_level": updated.care_level, "is_active": updated.is_active}


@mcp.tool(name="delete_patient", description="Deactivate (soft-delete) a patient record. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Delete Patient", readOnlyHint=False, destructiveHint=True))
async def delete_patient(patient_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.write")
    if actor.role != "admin":
        raise PermissionError("Only admin can delete patient records")
    async with AsyncSessionLocal() as db:
        p = (await db.execute(select(Patient).where(Patient.id == patient_id, Patient.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not p:
            raise ValueError(f"Patient {patient_id} not found")
        p.is_active = False
        await db.commit()
        return {"deleted": True, "patient_id": patient_id}


@mcp.tool(name="set_patient_mode", description="Switch patient mode (e.g. standard, emergency, discharge).",
          annotations=mcp_types.ToolAnnotations(title="Set Patient Mode", readOnlyHint=False, destructiveHint=False))
async def set_patient_mode(patient_id: int, mode: str) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.write")
    async with AsyncSessionLocal() as db:
        p = (await db.execute(select(Patient).where(Patient.id == patient_id, Patient.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not p:
            raise ValueError(f"Patient {patient_id} not found")
        p.mode = mode
        await db.commit()
        await db.refresh(p)
        return {"patient_id": p.id, "mode": p.mode}


@mcp.tool(name="list_patient_devices", description="List devices assigned to a patient.",
          annotations=mcp_types.ToolAnnotations(title="List Patient Devices", readOnlyHint=True))
async def list_patient_devices(patient_id: int) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("patients.read")
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(PatientDeviceAssignment).where(
                PatientDeviceAssignment.patient_id == patient_id,
                PatientDeviceAssignment.workspace_id == actor.workspace_id,
            )
        )).scalars().all()
        return [{"id": r.id, "device_id": r.device_id, "assigned_at": str(r.assigned_at), "is_active": r.is_active} for r in rows]


@mcp.tool(name="assign_patient_device", description="Assign a device to a patient.",
          annotations=mcp_types.ToolAnnotations(title="Assign Patient Device", readOnlyHint=False, destructiveHint=False))
async def assign_patient_device(patient_id: int, device_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("devices.write")
    async with AsyncSessionLocal() as db:
        assignment = PatientDeviceAssignment(
            workspace_id=actor.workspace_id,
            patient_id=patient_id,
            device_id=device_id,
        )
        db.add(assignment)
        await db.commit()
        await db.refresh(assignment)
        return {"id": assignment.id, "patient_id": patient_id, "device_id": device_id}


@mcp.tool(name="unassign_patient_device", description="Remove a device assignment from a patient.",
          annotations=mcp_types.ToolAnnotations(title="Unassign Patient Device", readOnlyHint=False, destructiveHint=True))
async def unassign_patient_device(patient_id: int, device_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("devices.write")
    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(PatientDeviceAssignment).where(
                PatientDeviceAssignment.workspace_id == actor.workspace_id,
                PatientDeviceAssignment.patient_id == patient_id,
                PatientDeviceAssignment.device_id == device_id,
            )
        )).scalar_one_or_none()
        if not row:
            raise ValueError("Assignment not found")
        await db.delete(row)
        await db.commit()
        return {"removed": True, "patient_id": patient_id, "device_id": device_id}


@mcp.tool(name="list_patient_caregivers", description="List caregivers assigned to a patient.",
          annotations=mcp_types.ToolAnnotations(title="List Patient Caregivers", readOnlyHint=True))
async def list_patient_caregivers(patient_id: int) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("patients.read")
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(CareGiverPatientAccess, CareGiver)
            .join(CareGiver, CareGiver.id == CareGiverPatientAccess.caregiver_id)
            .where(
                CareGiverPatientAccess.patient_id == patient_id,
                CareGiver.workspace_id == actor.workspace_id,
            )
        )).all()
        return [{"caregiver_id": cg.id, "name": f"{cg.first_name} {cg.last_name}", "role_title": cg.role_title, "access_level": acc.access_level} for acc, cg in rows]


@mcp.tool(name="update_patient_caregivers", description="Replace the caregiver list for a patient.",
          annotations=mcp_types.ToolAnnotations(title="Update Patient Caregivers", readOnlyHint=False, destructiveHint=False))
async def update_patient_caregivers(patient_id: int, caregiver_ids: list[int]) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.write")
    async with AsyncSessionLocal() as db:
        await db.execute(
            CareGiverPatientAccess.__table__.delete().where(
                CareGiverPatientAccess.patient_id == patient_id
            )
        )
        for cg_id in caregiver_ids:
            db.add(CareGiverPatientAccess(caregiver_id=cg_id, patient_id=patient_id))
        await db.commit()
        return {"patient_id": patient_id, "caregiver_ids": caregiver_ids}


@mcp.tool(name="list_patient_contacts", description="List emergency contacts for a patient.",
          annotations=mcp_types.ToolAnnotations(title="List Patient Contacts", readOnlyHint=True))
async def list_patient_contacts(patient_id: int) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("patients.read")
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(PatientContact).where(
                PatientContact.patient_id == patient_id,
                PatientContact.workspace_id == actor.workspace_id,
            )
        )).scalars().all()
        return [{"id": r.id, "name": r.name, "relationship": r.relationship, "phone": r.phone, "email": r.email} for r in rows]


@mcp.tool(name="create_patient_contact", description="Add an emergency contact for a patient.",
          annotations=mcp_types.ToolAnnotations(title="Create Patient Contact", readOnlyHint=False, destructiveHint=False))
async def create_patient_contact(patient_id: int, name: str, relationship: str, phone: str | None = None, email: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.write")
    async with AsyncSessionLocal() as db:
        c = PatientContact(workspace_id=actor.workspace_id, patient_id=patient_id, name=name, relationship=relationship, phone=phone, email=email)
        db.add(c)
        await db.commit()
        await db.refresh(c)
        return {"id": c.id, "name": c.name, "relationship": c.relationship, "phone": c.phone, "email": c.email}


@mcp.tool(name="update_patient_contact", description="Update an emergency contact for a patient.",
          annotations=mcp_types.ToolAnnotations(title="Update Patient Contact", readOnlyHint=False, destructiveHint=False))
async def update_patient_contact(patient_id: int, contact_id: int, name: str | None = None, relationship: str | None = None, phone: str | None = None, email: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.write")
    async with AsyncSessionLocal() as db:
        c = (await db.execute(
            select(PatientContact).where(PatientContact.id == contact_id, PatientContact.patient_id == patient_id, PatientContact.workspace_id == actor.workspace_id)
        )).scalar_one_or_none()
        if not c:
            raise ValueError("Contact not found")
        if name is not None:
            c.name = name
        if relationship is not None:
            c.relationship = relationship
        if phone is not None:
            c.phone = phone
        if email is not None:
            c.email = email
        await db.commit()
        await db.refresh(c)
        return {"id": c.id, "name": c.name, "relationship": c.relationship, "phone": c.phone, "email": c.email}


@mcp.tool(name="delete_patient_contact", description="Remove an emergency contact from a patient.",
          annotations=mcp_types.ToolAnnotations(title="Delete Patient Contact", readOnlyHint=False, destructiveHint=True))
async def delete_patient_contact(patient_id: int, contact_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.write")
    async with AsyncSessionLocal() as db:
        c = (await db.execute(
            select(PatientContact).where(PatientContact.id == contact_id, PatientContact.patient_id == patient_id, PatientContact.workspace_id == actor.workspace_id)
        )).scalar_one_or_none()
        if not c:
            raise ValueError("Contact not found")
        await db.delete(c)
        await db.commit()
        return {"deleted": True, "contact_id": contact_id}


# ---------------------------------------------------------------------------
# BATCH B — Workflow Messaging & Coordination
# ---------------------------------------------------------------------------

@mcp.tool(name="list_messages", description="List received/sent messages in the workflow messaging inbox.",
          annotations=mcp_types.ToolAnnotations(title="List Messages", readOnlyHint=True))
async def list_messages(limit: int = 30) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("workflow.read")
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(RoleMessage).where(
                RoleMessage.workspace_id == actor.workspace_id,
            ).order_by(RoleMessage.created_at.desc()).limit(limit)
        )).scalars().all()
        return [{"id": r.id, "subject": r.subject, "body": r.body, "sender_role": r.sender_role, "recipient_role": r.recipient_role, "is_read": r.is_read, "created_at": str(r.created_at)} for r in rows]


@mcp.tool(name="mark_message_read", description="Mark a workflow message as read.",
          annotations=mcp_types.ToolAnnotations(title="Mark Message Read", readOnlyHint=False, destructiveHint=False, idempotentHint=True))
async def mark_message_read(message_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("workflow.write")
    async with AsyncSessionLocal() as db:
        msg = (await db.execute(
            select(RoleMessage).where(RoleMessage.id == message_id, RoleMessage.workspace_id == actor.workspace_id)
        )).scalar_one_or_none()
        if not msg:
            raise ValueError(f"Message {message_id} not found")
        msg.is_read = True
        await db.commit()
        return {"message_id": message_id, "is_read": True}


@mcp.tool(name="create_workflow_schedule", description="Create a new care schedule entry (e.g. medication, therapy session).",
          annotations=mcp_types.ToolAnnotations(title="Create Workflow Schedule", readOnlyHint=False, destructiveHint=False))
async def create_workflow_schedule(
    title: str,
    scheduled_at: str,
    patient_id: int | None = None,
    caregiver_user_id: int | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("workflow.write")
    async with AsyncSessionLocal() as db:
        payload = CareScheduleCreate(
            title=title,
            scheduled_at=scheduled_at,
            patient_id=patient_id,
            caregiver_user_id=caregiver_user_id,
            notes=notes,
        )
        sched = await schedule_service.create(db, actor.workspace_id, payload)
        return {"id": sched.id, "title": sched.title, "scheduled_at": str(sched.scheduled_at), "patient_id": sched.patient_id}


@mcp.tool(name="update_workflow_schedule", description="Update fields of an existing care schedule entry.",
          annotations=mcp_types.ToolAnnotations(title="Update Workflow Schedule", readOnlyHint=False, destructiveHint=False))
async def update_workflow_schedule(
    schedule_id: int,
    title: str | None = None,
    scheduled_at: str | None = None,
    notes: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("workflow.write")
    async with AsyncSessionLocal() as db:
        sched = await schedule_service.get(db, actor.workspace_id, schedule_id)
        if not sched:
            raise ValueError(f"Schedule {schedule_id} not found")
        from app.schemas.workflow import CareScheduleUpdate
        update = CareScheduleUpdate(**{k: v for k, v in {"title": title, "scheduled_at": scheduled_at, "notes": notes, "status": status}.items() if v is not None})
        sched = await schedule_service.update(db, actor.workspace_id, sched, update)
        return {"id": sched.id, "title": sched.title, "status": sched.status}


@mcp.tool(name="list_handover_notes", description="List handover notes for the workspace shift transitions.",
          annotations=mcp_types.ToolAnnotations(title="List Handover Notes", readOnlyHint=True))
async def list_handover_notes(limit: int = 20) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("workflow.read")
    async with AsyncSessionLocal() as db:
        rows = await handover_note_service.get_multi(db, actor.workspace_id, limit=limit)
        return [{"id": r.id, "body": r.body, "from_role": r.from_role, "to_role": r.to_role, "created_at": str(r.created_at)} for r in rows]


@mcp.tool(name="create_handover_note", description="Create a shift handover note for incoming staff.",
          annotations=mcp_types.ToolAnnotations(title="Create Handover Note", readOnlyHint=False, destructiveHint=False))
async def create_handover_note(body: str, to_role: str, patient_id: int | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("workflow.write")
    async with AsyncSessionLocal() as db:
        payload = HandoverNoteCreate(body=body, to_role=to_role, patient_id=patient_id, from_role=actor.role)
        note = await handover_note_service.create(db, actor.workspace_id, payload)
        return {"id": note.id, "body": note.body, "from_role": note.from_role, "to_role": note.to_role}


@mcp.tool(name="list_care_directives", description="List care directives for patients/staff.",
          annotations=mcp_types.ToolAnnotations(title="List Care Directives", readOnlyHint=True))
async def list_care_directives(patient_id: int | None = None, limit: int = 30) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("workflow.read")
    async with AsyncSessionLocal() as db:
        stmt = select(CareDirective).where(CareDirective.workspace_id == actor.workspace_id)
        if patient_id:
            stmt = stmt.where(CareDirective.patient_id == patient_id)
        rows = (await db.execute(stmt.order_by(CareDirective.created_at.desc()).limit(limit))).scalars().all()
        return [{"id": r.id, "title": r.title, "body": r.body, "status": r.status, "patient_id": r.patient_id, "acknowledged_at": str(r.acknowledged_at) if r.acknowledged_at else None} for r in rows]


@mcp.tool(name="create_care_directive", description="Create a care directive for a patient or staff role.",
          annotations=mcp_types.ToolAnnotations(title="Create Care Directive", readOnlyHint=False, destructiveHint=False))
async def create_care_directive(title: str, body: str, patient_id: int | None = None, target_role: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("workflow.write")
    async with AsyncSessionLocal() as db:
        payload = CareDirectiveCreate(title=title, body=body, patient_id=patient_id, target_role=target_role, issuer_role=actor.role)
        directive = await care_directive_service.create(db, actor.workspace_id, payload)
        return {"id": directive.id, "title": directive.title, "status": directive.status}


@mcp.tool(name="update_care_directive", description="Update a care directive (title, body, status).",
          annotations=mcp_types.ToolAnnotations(title="Update Care Directive", readOnlyHint=False, destructiveHint=False))
async def update_care_directive(directive_id: int, title: str | None = None, body: str | None = None, status: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("workflow.write")
    async with AsyncSessionLocal() as db:
        d = await care_directive_service.get(db, actor.workspace_id, directive_id)
        if not d:
            raise ValueError(f"Directive {directive_id} not found")
        update = CareDirectiveUpdate(**{k: v for k, v in {"title": title, "body": body, "status": status}.items() if v is not None})
        d = await care_directive_service.update(db, actor.workspace_id, d, update)
        return {"id": d.id, "title": d.title, "status": d.status}


@mcp.tool(name="acknowledge_care_directive", description="Acknowledge a care directive (mark as seen and actioned).",
          annotations=mcp_types.ToolAnnotations(title="Acknowledge Care Directive", readOnlyHint=False, destructiveHint=False, idempotentHint=True))
async def acknowledge_care_directive(directive_id: int, note: str = "") -> dict[str, Any]:
    from datetime import datetime, timezone
    actor = require_actor_context()
    _require_scope("workflow.write")
    async with AsyncSessionLocal() as db:
        d = (await db.execute(select(CareDirective).where(CareDirective.id == directive_id, CareDirective.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not d:
            raise ValueError(f"Directive {directive_id} not found")
        d.status = "acknowledged"
        d.acknowledged_at = datetime.now(timezone.utc)
        d.acknowledgement_note = note
        await db.commit()
        return {"directive_id": directive_id, "acknowledged": True}


@mcp.tool(name="get_audit_trail", description="Retrieve workflow audit trail events. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Get Audit Trail", readOnlyHint=True))
async def get_audit_trail(limit: int = 50, entity_type: str | None = None) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("audit.read")
    if actor.role != "admin":
        raise PermissionError("Only admin can access the audit trail")
    async with AsyncSessionLocal() as db:
        stmt = select(AuditTrailEvent).where(AuditTrailEvent.workspace_id == actor.workspace_id)
        if entity_type:
            stmt = stmt.where(AuditTrailEvent.entity_type == entity_type)
        rows = (await db.execute(stmt.order_by(AuditTrailEvent.created_at.desc()).limit(limit))).scalars().all()
        return [{"id": r.id, "entity_type": r.entity_type, "entity_id": r.entity_id, "action": r.action, "actor_role": r.actor_role, "created_at": str(r.created_at)} for r in rows]


@mcp.tool(name="claim_workflow_item", description="Claim a workflow item (task/schedule/directive) to yourself.",
          annotations=mcp_types.ToolAnnotations(title="Claim Workflow Item", readOnlyHint=False, destructiveHint=False, idempotentHint=True))
async def claim_workflow_item(item_type: str, item_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("workflow.write")
    valid_types = {"task": CareTask, "schedule": CareSchedule, "directive": CareDirective}
    if item_type not in valid_types:
        raise ValueError(f"item_type must be one of: {list(valid_types)}")
    Model = valid_types[item_type]
    async with AsyncSessionLocal() as db:
        obj = (await db.execute(select(Model).where(Model.id == item_id, Model.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not obj:
            raise ValueError(f"{item_type} {item_id} not found")
        obj.claimed_by_user_id = actor.user_id
        obj.status = "in_progress"
        await db.commit()
        return {"item_type": item_type, "item_id": item_id, "claimed_by": actor.user_id}


@mcp.tool(name="handoff_workflow_item", description="Hand off a workflow item to another user.",
          annotations=mcp_types.ToolAnnotations(title="Handoff Workflow Item", readOnlyHint=False, destructiveHint=False))
async def handoff_workflow_item(item_type: str, item_id: int, to_user_id: int, note: str = "") -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("workflow.write")
    valid_types = {"task": CareTask, "schedule": CareSchedule, "directive": CareDirective}
    if item_type not in valid_types:
        raise ValueError(f"item_type must be one of: {list(valid_types)}")
    Model = valid_types[item_type]
    async with AsyncSessionLocal() as db:
        obj = (await db.execute(select(Model).where(Model.id == item_id, Model.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not obj:
            raise ValueError(f"{item_type} {item_id} not found")
        obj.claimed_by_user_id = to_user_id
        obj.handoff_note = note
        await db.commit()
        return {"item_type": item_type, "item_id": item_id, "handed_to": to_user_id}


# ---------------------------------------------------------------------------
# BATCH C — Room Management
# ---------------------------------------------------------------------------

@mcp.tool(name="get_room_details", description="Get detailed information about a specific room, including floor and facility.",
          annotations=mcp_types.ToolAnnotations(title="Get Room Details", readOnlyHint=True))
async def get_room_details(room_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("rooms.read")
    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(Room, Floor, Facility)
            .outerjoin(Floor, Floor.id == Room.floor_id)
            .outerjoin(Facility, Facility.id == Floor.facility_id)
            .where(Room.id == room_id, Room.workspace_id == actor.workspace_id)
        )).first()
        if not row:
            raise ValueError(f"Room {room_id} not found")
        room, floor, facility = row
        return {"id": room.id, "name": room.name, "description": room.description, "room_type": room.room_type, "floor_id": room.floor_id, "floor_name": floor.name if floor else None, "facility_name": facility.name if facility else None, "adjacent_rooms": room.adjacent_rooms or [], "config": room.config or {}}


@mcp.tool(name="create_room", description="Create a new room in the workspace. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Create Room", readOnlyHint=False, destructiveHint=False))
async def create_room(name: str, room_type: str = "patient", floor_id: int | None = None, description: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("rooms.write")
    if actor.role != "admin":
        raise PermissionError("Only admin can create rooms")
    async with AsyncSessionLocal() as db:
        room = Room(workspace_id=actor.workspace_id, name=name, room_type=room_type, floor_id=floor_id, description=description)
        db.add(room)
        await db.commit()
        await db.refresh(room)
        return {"id": room.id, "name": room.name, "room_type": room.room_type}


@mcp.tool(name="update_room", description="Update room details. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Update Room", readOnlyHint=False, destructiveHint=False))
async def update_room(room_id: int, name: str | None = None, description: str | None = None, room_type: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("rooms.write")
    if actor.role != "admin":
        raise PermissionError("Only admin can update rooms")
    async with AsyncSessionLocal() as db:
        room = (await db.execute(select(Room).where(Room.id == room_id, Room.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not room:
            raise ValueError(f"Room {room_id} not found")
        if name is not None:
            room.name = name
        if description is not None:
            room.description = description
        if room_type is not None:
            room.room_type = room_type
        await db.commit()
        await db.refresh(room)
        return {"id": room.id, "name": room.name, "room_type": room.room_type}


@mcp.tool(name="delete_room", description="Delete a room. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Delete Room", readOnlyHint=False, destructiveHint=True))
async def delete_room(room_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("rooms.write")
    if actor.role != "admin":
        raise PermissionError("Only admin can delete rooms")
    async with AsyncSessionLocal() as db:
        room = (await db.execute(select(Room).where(Room.id == room_id, Room.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not room:
            raise ValueError(f"Room {room_id} not found")
        await db.delete(room)
        await db.commit()
        return {"deleted": True, "room_id": room_id}


# ---------------------------------------------------------------------------
# BATCH D — Device Management
# ---------------------------------------------------------------------------

@mcp.tool(name="get_device_details", description="Get detailed information about a specific device.",
          annotations=mcp_types.ToolAnnotations(title="Get Device Details", readOnlyHint=True))
async def get_device_details(device_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("devices.read")
    async with AsyncSessionLocal() as db:
        d = (await db.execute(select(Device).where(Device.id == device_id, Device.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not d:
            raise ValueError(f"Device {device_id} not found")
        return {"id": d.id, "name": d.name, "device_type": d.device_type, "serial_number": d.serial_number, "status": d.status, "room_id": d.room_id, "mac_address": d.mac_address, "firmware_version": d.firmware_version, "last_seen": str(d.last_seen) if d.last_seen else None}


@mcp.tool(name="list_device_activity", description="List recent device activity/event log.",
          annotations=mcp_types.ToolAnnotations(title="List Device Activity", readOnlyHint=True))
async def list_device_activity(limit: int = 30) -> list[dict[str, Any]]:
    from app.models.activity import DeviceActivityEvent
    actor = require_actor_context()
    _require_scope("devices.read")
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(DeviceActivityEvent).where(DeviceActivityEvent.workspace_id == actor.workspace_id)
            .order_by(DeviceActivityEvent.created_at.desc()).limit(limit)
        )).scalars().all()
        return [{"id": r.id, "device_id": r.device_id, "event_type": r.event_type, "payload": r.payload, "created_at": str(r.created_at)} for r in rows]


@mcp.tool(name="register_device", description="Register a new device in the workspace. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Register Device", readOnlyHint=False, destructiveHint=False))
async def register_device(name: str, device_type: str, serial_number: str | None = None, room_id: int | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("devices.write")
    if actor.role != "admin":
        raise PermissionError("Only admin can register devices")
    async with AsyncSessionLocal() as db:
        d = Device(workspace_id=actor.workspace_id, name=name, device_type=device_type, serial_number=serial_number, room_id=room_id)
        db.add(d)
        await db.commit()
        await db.refresh(d)
        return {"id": d.id, "name": d.name, "device_type": d.device_type, "serial_number": d.serial_number}


@mcp.tool(name="update_device", description="Update device metadata (name, room, status).",
          annotations=mcp_types.ToolAnnotations(title="Update Device", readOnlyHint=False, destructiveHint=False))
async def update_device(device_id: int, name: str | None = None, room_id: int | None = None, status: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("devices.write")
    async with AsyncSessionLocal() as db:
        d = (await db.execute(select(Device).where(Device.id == device_id, Device.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not d:
            raise ValueError(f"Device {device_id} not found")
        if name is not None:
            d.name = name
        if room_id is not None:
            d.room_id = room_id
        if status is not None:
            d.status = status
        await db.commit()
        await db.refresh(d)
        return {"id": d.id, "name": d.name, "status": d.status, "room_id": d.room_id}


@mcp.tool(name="assign_device_patient", description="Link a device to a patient account.",
          annotations=mcp_types.ToolAnnotations(title="Assign Device to Patient", readOnlyHint=False, destructiveHint=False))
async def assign_device_patient(device_id: int, patient_id: int | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("devices.write")
    async with AsyncSessionLocal() as db:
        d = (await db.execute(select(Device).where(Device.id == device_id, Device.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not d:
            raise ValueError(f"Device {device_id} not found")
        d.patient_id = patient_id
        await db.commit()
        return {"device_id": device_id, "patient_id": patient_id}


# ---------------------------------------------------------------------------
# BATCH E — Caregiver Management
# ---------------------------------------------------------------------------

@mcp.tool(name="list_caregivers", description="List all caregivers in the workspace.",
          annotations=mcp_types.ToolAnnotations(title="List Caregivers", readOnlyHint=True))
async def list_caregivers(limit: int = 50) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("patients.read")
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(CareGiver).where(CareGiver.workspace_id == actor.workspace_id).limit(limit)
        )).scalars().all()
        return [{"id": r.id, "first_name": r.first_name, "last_name": r.last_name, "role_title": r.role_title, "user_id": r.user_id, "is_active": r.is_active} for r in rows]


@mcp.tool(name="create_caregiver", description="Create a new caregiver profile. Admin / Head Nurse only.",
          annotations=mcp_types.ToolAnnotations(title="Create Caregiver", readOnlyHint=False, destructiveHint=False))
async def create_caregiver(first_name: str, last_name: str, role_title: str, user_id: int | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("caregivers.write")
    if actor.role not in {"admin", "head_nurse"}:
        raise PermissionError("Only admin or head_nurse can create caregiver profiles")
    from app.services.base import CRUDBase
    cg_service = CRUDBase[CareGiver, CareGiverCreate, CareGiverPatch](CareGiver)
    async with AsyncSessionLocal() as db:
        payload = CareGiverCreate(first_name=first_name, last_name=last_name, role_title=role_title, user_id=user_id)
        cg = await cg_service.create(db, actor.workspace_id, payload)
        return {"id": cg.id, "first_name": cg.first_name, "last_name": cg.last_name, "role_title": cg.role_title}


@mcp.tool(name="get_caregiver_details", description="Get detailed information about a caregiver including their patients and shifts.",
          annotations=mcp_types.ToolAnnotations(title="Get Caregiver Details", readOnlyHint=True))
async def get_caregiver_details(caregiver_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.read")
    async with AsyncSessionLocal() as db:
        cg = (await db.execute(select(CareGiver).where(CareGiver.id == caregiver_id, CareGiver.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not cg:
            raise ValueError(f"Caregiver {caregiver_id} not found")
        patient_ids = [r.patient_id for r in (await db.execute(select(CareGiverPatientAccess).where(CareGiverPatientAccess.caregiver_id == caregiver_id))).scalars().all()]
        return {"id": cg.id, "first_name": cg.first_name, "last_name": cg.last_name, "role_title": cg.role_title, "user_id": cg.user_id, "is_active": cg.is_active, "patient_ids": patient_ids}


@mcp.tool(name="update_caregiver", description="Update caregiver profile fields.",
          annotations=mcp_types.ToolAnnotations(title="Update Caregiver", readOnlyHint=False, destructiveHint=False))
async def update_caregiver(caregiver_id: int, first_name: str | None = None, last_name: str | None = None, role_title: str | None = None, is_active: bool | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("caregivers.write")
    from app.services.base import CRUDBase
    cg_service = CRUDBase[CareGiver, CareGiverCreate, CareGiverPatch](CareGiver)
    async with AsyncSessionLocal() as db:
        cg = await cg_service.get(db, actor.workspace_id, caregiver_id)
        if not cg:
            raise ValueError(f"Caregiver {caregiver_id} not found")
        patch = CareGiverPatch(**{k: v for k, v in {"first_name": first_name, "last_name": last_name, "role_title": role_title, "is_active": is_active}.items() if v is not None})
        cg = await cg_service.update(db, actor.workspace_id, cg, patch)
        return {"id": cg.id, "first_name": cg.first_name, "last_name": cg.last_name, "role_title": cg.role_title, "is_active": cg.is_active}


@mcp.tool(name="delete_caregiver", description="Deactivate a caregiver profile. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Delete Caregiver", readOnlyHint=False, destructiveHint=True))
async def delete_caregiver(caregiver_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("caregivers.write")
    if actor.role != "admin":
        raise PermissionError("Only admin can delete caregiver profiles")
    async with AsyncSessionLocal() as db:
        cg = (await db.execute(select(CareGiver).where(CareGiver.id == caregiver_id, CareGiver.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not cg:
            raise ValueError(f"Caregiver {caregiver_id} not found")
        cg.is_active = False
        await db.commit()
        return {"deleted": True, "caregiver_id": caregiver_id}


@mcp.tool(name="list_caregiver_patients", description="List patients accessible to a caregiver.",
          annotations=mcp_types.ToolAnnotations(title="List Caregiver Patients", readOnlyHint=True))
async def list_caregiver_patients(caregiver_id: int) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("patients.read")
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(CareGiverPatientAccess, Patient)
            .join(Patient, Patient.id == CareGiverPatientAccess.patient_id)
            .where(CareGiverPatientAccess.caregiver_id == caregiver_id, Patient.workspace_id == actor.workspace_id)
        )).all()
        return [{"patient_id": p.id, "first_name": p.first_name, "last_name": p.last_name, "access_level": acc.access_level} for acc, p in rows]


@mcp.tool(name="update_caregiver_patients", description="Replace the patient access list for a caregiver.",
          annotations=mcp_types.ToolAnnotations(title="Update Caregiver Patients", readOnlyHint=False, destructiveHint=False))
async def update_caregiver_patients(caregiver_id: int, patient_ids: list[int]) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("caregivers.write")
    async with AsyncSessionLocal() as db:
        await db.execute(
            CareGiverPatientAccess.__table__.delete().where(CareGiverPatientAccess.caregiver_id == caregiver_id)
        )
        for pid in patient_ids:
            db.add(CareGiverPatientAccess(caregiver_id=caregiver_id, patient_id=pid))
        await db.commit()
        return {"caregiver_id": caregiver_id, "patient_ids": patient_ids}


# ---------------------------------------------------------------------------
# BATCH F — Medication
# ---------------------------------------------------------------------------

@mcp.tool(name="list_prescriptions", description="List prescriptions for a patient or all visible patients.",
          annotations=mcp_types.ToolAnnotations(title="List Prescriptions", readOnlyHint=True))
async def list_prescriptions(patient_id: int | None = None, limit: int = 50) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("medication.read")
    async with AsyncSessionLocal() as db:
        stmt = select(Prescription).where(Prescription.workspace_id == actor.workspace_id)
        if patient_id:
            stmt = stmt.where(Prescription.patient_id == patient_id)
        rows = (await db.execute(stmt.limit(limit))).scalars().all()
        return [{"id": r.id, "patient_id": r.patient_id, "drug_name": r.drug_name, "dosage": r.dosage, "frequency": r.frequency, "status": r.status, "start_date": str(r.start_date) if r.start_date else None} for r in rows]


@mcp.tool(name="create_prescription", description="Create a new prescription for a patient. Head Nurse / Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Create Prescription", readOnlyHint=False, destructiveHint=False))
async def create_prescription(patient_id: int, drug_name: str, dosage: str, frequency: str, notes: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("medication.write")
    if actor.role not in {"admin", "head_nurse"}:
        raise PermissionError("Only admin or head_nurse can create prescriptions")
    async with AsyncSessionLocal() as db:
        payload = PrescriptionCreate(patient_id=patient_id, drug_name=drug_name, dosage=dosage, frequency=frequency, notes=notes)
        px = await prescription_service.create(db, actor.workspace_id, payload)
        return {"id": px.id, "drug_name": px.drug_name, "dosage": px.dosage, "frequency": px.frequency}


@mcp.tool(name="update_prescription", description="Update prescription status or instructions.",
          annotations=mcp_types.ToolAnnotations(title="Update Prescription", readOnlyHint=False, destructiveHint=False))
async def update_prescription(prescription_id: int, status: str | None = None, dosage: str | None = None, frequency: str | None = None, notes: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("medication.write")
    async with AsyncSessionLocal() as db:
        px = await prescription_service.get(db, actor.workspace_id, prescription_id)
        if not px:
            raise ValueError(f"Prescription {prescription_id} not found")
        update = PrescriptionUpdate(**{k: v for k, v in {"status": status, "dosage": dosage, "frequency": frequency, "notes": notes}.items() if v is not None})
        px = await prescription_service.update(db, actor.workspace_id, px, update)
        return {"id": px.id, "status": px.status, "dosage": px.dosage}


@mcp.tool(name="list_pharmacy_orders", description="List pharmacy orders for the workspace.",
          annotations=mcp_types.ToolAnnotations(title="List Pharmacy Orders", readOnlyHint=True))
async def list_pharmacy_orders(patient_id: int | None = None, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("medication.read")
    async with AsyncSessionLocal() as db:
        stmt = select(PharmacyOrder).where(PharmacyOrder.workspace_id == actor.workspace_id)
        if patient_id:
            stmt = stmt.where(PharmacyOrder.patient_id == patient_id)
        if status:
            stmt = stmt.where(PharmacyOrder.status == status)
        rows = (await db.execute(stmt.order_by(PharmacyOrder.created_at.desc()).limit(limit))).scalars().all()
        return [{"id": r.id, "patient_id": r.patient_id, "drug_name": r.drug_name, "quantity": r.quantity, "status": r.status, "created_at": str(r.created_at)} for r in rows]


@mcp.tool(name="request_pharmacy_order", description="Request a pharmacy/medication refill (patient self-service or staff).",
          annotations=mcp_types.ToolAnnotations(title="Request Pharmacy Order", readOnlyHint=False, destructiveHint=False))
async def request_pharmacy_order(drug_name: str, quantity: int, notes: str | None = None, patient_id: int | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("medication.read")
    effective_patient_id = patient_id or actor.patient_id
    if not effective_patient_id:
        raise ValueError("patient_id is required")
    async with AsyncSessionLocal() as db:
        order = PharmacyOrder(workspace_id=actor.workspace_id, patient_id=effective_patient_id, drug_name=drug_name, quantity=quantity, notes=notes, status="pending", requested_by_user_id=actor.user_id)
        db.add(order)
        await db.commit()
        await db.refresh(order)
        return {"id": order.id, "drug_name": order.drug_name, "quantity": order.quantity, "status": order.status}


@mcp.tool(name="update_pharmacy_order", description="Update pharmacy order status (approve/dispense/cancel).",
          annotations=mcp_types.ToolAnnotations(title="Update Pharmacy Order", readOnlyHint=False, destructiveHint=False))
async def update_pharmacy_order(order_id: int, status: str | None = None, notes: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("medication.write")
    async with AsyncSessionLocal() as db:
        order = await pharmacy_order_service.get(db, actor.workspace_id, order_id)
        if not order:
            raise ValueError(f"Pharmacy order {order_id} not found")
        update = PharmacyOrderUpdate(**{k: v for k, v in {"status": status, "notes": notes}.items() if v is not None})
        order = await pharmacy_order_service.update(db, actor.workspace_id, order, update)
        return {"id": order.id, "status": order.status}


# ---------------------------------------------------------------------------
# BATCH G — Support & Service Requests
# ---------------------------------------------------------------------------

@mcp.tool(name="list_support_tickets", description="List support tickets visible to the current user.",
          annotations=mcp_types.ToolAnnotations(title="List Support Tickets", readOnlyHint=True))
async def list_support_tickets(status: str | None = None, limit: int = 30) -> list[dict[str, Any]]:
    actor = require_actor_context()
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == actor.user_id))).scalar_one_or_none()
        if not user:
            raise ValueError("User not found")
        tickets = await SupportService.list_tickets(db, actor.workspace_id, user, status=status, limit=limit)
        return [{"id": t.id, "title": t.title, "category": t.category, "priority": t.priority, "status": t.status, "created_at": str(t.created_at)} for t in tickets]


@mcp.tool(name="create_support_ticket", description="Create a new support ticket.",
          annotations=mcp_types.ToolAnnotations(title="Create Support Ticket", readOnlyHint=False, destructiveHint=False))
async def create_support_ticket(title: str, description: str, category: str = "general", priority: str = "medium") -> dict[str, Any]:
    actor = require_actor_context()
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == actor.user_id))).scalar_one_or_none()
        if not user:
            raise ValueError("User not found")
        payload = SupportTicketCreateIn(title=title, description=description, category=category, priority=priority)
        ticket = await SupportService.create_ticket(db, actor.workspace_id, user, payload)
        return {"id": ticket.id, "title": ticket.title, "status": ticket.status}


@mcp.tool(name="update_support_ticket", description="Update a support ticket status or assign it. Admin / Head Nurse only.",
          annotations=mcp_types.ToolAnnotations(title="Update Support Ticket", readOnlyHint=False, destructiveHint=False))
async def update_support_ticket(ticket_id: int, status: str | None = None, assignee_user_id: int | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    if actor.role not in {"admin", "head_nurse"}:
        raise PermissionError("Only admin or head_nurse can update ticket workflow fields")
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == actor.user_id))).scalar_one_or_none()
        if not user:
            raise ValueError("User not found")
        patch = SupportTicketPatchIn(**{k: v for k, v in {"status": status, "assignee_user_id": assignee_user_id}.items() if v is not None})
        ticket = await SupportService.patch_ticket(db, actor.workspace_id, user, ticket_id, patch)
        return {"id": ticket.id, "status": ticket.status, "assignee_user_id": ticket.assignee_user_id}


@mcp.tool(name="add_support_comment", description="Add a comment to a support ticket.",
          annotations=mcp_types.ToolAnnotations(title="Add Support Comment", readOnlyHint=False, destructiveHint=False))
async def add_support_comment(ticket_id: int, body: str) -> dict[str, Any]:
    actor = require_actor_context()
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == actor.user_id))).scalar_one_or_none()
        if not user:
            raise ValueError("User not found")
        payload = SupportTicketCommentCreateIn(body=body)
        comment = await SupportService.add_comment(db, actor.workspace_id, user, ticket_id, payload)
        return {"id": comment.id, "body": comment.body, "created_at": str(comment.created_at)}


@mcp.tool(name="list_service_requests", description="List service requests (patient requests for food, transport, etc.).",
          annotations=mcp_types.ToolAnnotations(title="List Service Requests", readOnlyHint=True))
async def list_service_requests(status: str | None = None, service_type: str | None = None, limit: int = 30) -> list[dict[str, Any]]:
    actor = require_actor_context()
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == actor.user_id))).scalar_one_or_none()
        if not user:
            raise ValueError("User not found")
        reqs = await service_request_service.list_requests(db, actor.workspace_id, user, status=status, service_type=service_type, limit=limit)
        return [{"id": r.id, "service_type": r.service_type, "note": r.note, "status": r.status, "created_at": str(r.created_at)} for r in reqs]


@mcp.tool(name="create_service_request", description="Create a service request (patient self-service for food, transport, etc.).",
          annotations=mcp_types.ToolAnnotations(title="Create Service Request", readOnlyHint=False, destructiveHint=False))
async def create_service_request(service_type: str, note: str, title: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == actor.user_id))).scalar_one_or_none()
        if not user:
            raise ValueError("User not found")
        payload = ServiceRequestCreateIn(service_type=service_type, note=note, title=title)
        req = await service_request_service.create_request(db, actor.workspace_id, user, payload)
        return {"id": req.id, "service_type": req.service_type, "status": req.status}


@mcp.tool(name="update_service_request", description="Update a service request status (admin/head_nurse).",
          annotations=mcp_types.ToolAnnotations(title="Update Service Request", readOnlyHint=False, destructiveHint=False))
async def update_service_request(request_id: int, status: str, resolution_note: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == actor.user_id))).scalar_one_or_none()
        if not user:
            raise ValueError("User not found")
        payload = ServiceRequestPatchIn(status=status, resolution_note=resolution_note)
        req = await service_request_service.patch_request(db, actor.workspace_id, user, request_id, payload)
        return {"id": req.id, "status": req.status}


# ---------------------------------------------------------------------------
# BATCH H — Shift Checklist & Calendar
# ---------------------------------------------------------------------------

@mcp.tool(name="get_my_shift_checklist", description="Get the shift checklist for the current user for today.",
          annotations=mcp_types.ToolAnnotations(title="Get My Shift Checklist", readOnlyHint=True))
async def get_my_shift_checklist(shift_date: str | None = None) -> dict[str, Any]:
    from datetime import date
    actor = require_actor_context()
    today = date.fromisoformat(shift_date) if shift_date else date.today()
    async with AsyncSessionLocal() as db:
        template = await shift_checklist_service.get_template_for_user(
            db, actor.workspace_id, actor.user_id
        )
        state = await shift_checklist_service.get_me(db, actor.workspace_id, actor.user_id, today)
        raw = state.items if state else []
        merged = shift_checklist_service.merge_template_with_state(template, raw)
        items_out = [m.model_dump() for m in merged]
        pct = (
            int(round(100 * sum(1 for i in merged if i.checked) / len(merged)))
            if merged
            else 0
        )
        return {"shift_date": str(today), "items": items_out, "percent_complete": pct}


@mcp.tool(name="update_my_shift_checklist", description="Update shift checklist items for the current user.",
          annotations=mcp_types.ToolAnnotations(title="Update Shift Checklist", readOnlyHint=False, destructiveHint=False, idempotentHint=True))
async def update_my_shift_checklist(items: list[dict[str, Any]], shift_date: str | None = None) -> dict[str, Any]:
    from datetime import date
    from app.schemas.shift_checklist import ShiftChecklistItem
    actor = require_actor_context()
    today = date.fromisoformat(shift_date) if shift_date else date.today()
    parsed = [ShiftChecklistItem(**i) for i in items]
    async with AsyncSessionLocal() as db:
        template = await shift_checklist_service.get_template_for_user(
            db, actor.workspace_id, actor.user_id
        )
        try:
            validated = shift_checklist_service.validate_put_against_template(template, parsed)
        except ValueError as exc:
            raise PermissionError(str(exc)) from exc
        state = await shift_checklist_service.upsert_me(
            db, actor.workspace_id, actor.user_id, today, validated
        )
        await db.commit()
        return {"shift_date": str(today), "items": state.items, "updated": True}


@mcp.tool(name="list_workspace_shift_checklists", description="List shift checklists for all staff in the workspace. Admin / Head Nurse only.",
          annotations=mcp_types.ToolAnnotations(title="List Workspace Shift Checklists", readOnlyHint=True))
async def list_workspace_shift_checklists(shift_date: str | None = None) -> list[dict[str, Any]]:
    from datetime import date
    actor = require_actor_context()
    if actor.role not in {"admin", "head_nurse"}:
        raise PermissionError("Only admin or head_nurse can view workspace shift checklists")
    today = date.fromisoformat(shift_date) if shift_date else date.today()
    async with AsyncSessionLocal() as db:
        rows = await shift_checklist_service.list_workspace_floor_staff(db, actor.workspace_id, today)
        return [r.model_dump(mode="json") for r in rows]


@mcp.tool(name="list_calendar_events", description="List calendar events for the current user or workspace.",
          annotations=mcp_types.ToolAnnotations(title="List Calendar Events", readOnlyHint=True))
async def list_calendar_events(start: str | None = None, end: str | None = None, patient_id: int | None = None) -> list[dict[str, Any]]:
    from datetime import datetime, timezone
    actor = require_actor_context()
    _require_scope("workflow.read")
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == actor.user_id))).scalar_one_or_none()
        visible_patient_ids = await get_visible_patient_ids(db, actor.workspace_id, user) if user else None
        events = await calendar_list_events(
            db=db,
            ws_id=actor.workspace_id,
            user=user,
            visible_patient_ids=visible_patient_ids,
            start=datetime.fromisoformat(start) if start else None,
            end=datetime.fromisoformat(end) if end else None,
            patient_id=patient_id,
        )
        return [{"id": e.id, "title": e.title, "start_at": str(e.start_at), "end_at": str(e.end_at) if e.end_at else None, "event_type": e.event_type, "patient_id": e.patient_id} for e in events]


# ---------------------------------------------------------------------------
# BATCH I — AI Settings
# ---------------------------------------------------------------------------

@mcp.tool(name="get_ai_settings", description="Get the current AI provider and model settings for this workspace. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Get AI Settings", readOnlyHint=True))
async def get_ai_settings() -> dict[str, Any]:
    actor = require_actor_context()
    if actor.role != "admin":
        raise PermissionError("Only admin can view AI settings")
    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(WorkspaceAISettings).where(WorkspaceAISettings.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not row:
            return {"provider": "ollama", "model": None, "workspace_id": actor.workspace_id}
        return {"provider": row.provider, "model": row.model, "copilot_enabled": row.copilot_enabled, "workspace_id": actor.workspace_id}


@mcp.tool(name="update_ai_settings", description="Update AI provider and model configuration. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Update AI Settings", readOnlyHint=False, destructiveHint=False))
async def update_ai_settings(provider: str | None = None, model: str | None = None, copilot_enabled: bool | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    if actor.role != "admin":
        raise PermissionError("Only admin can update AI settings")
    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(WorkspaceAISettings).where(WorkspaceAISettings.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not row:
            row = WorkspaceAISettings(workspace_id=actor.workspace_id)
            db.add(row)
        if provider is not None:
            row.provider = provider
        if model is not None:
            row.model = model
        if copilot_enabled is not None:
            row.copilot_enabled = copilot_enabled
        await db.commit()
        await db.refresh(row)
        return {"provider": row.provider, "model": row.model, "copilot_enabled": row.copilot_enabled}


# ---------------------------------------------------------------------------
# BATCH J — Facility Management
# ---------------------------------------------------------------------------

@mcp.tool(name="create_facility", description="Create a new facility. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Create Facility", readOnlyHint=False, destructiveHint=False))
async def create_facility(name: str, address: str | None = None, description: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    if actor.role != "admin":
        raise PermissionError("Only admin can create facilities")
    async with AsyncSessionLocal() as db:
        f = Facility(workspace_id=actor.workspace_id, name=name, address=address, description=description)
        db.add(f)
        await db.commit()
        await db.refresh(f)
        return {"id": f.id, "name": f.name, "address": f.address}


@mcp.tool(name="update_facility", description="Update facility details. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Update Facility", readOnlyHint=False, destructiveHint=False))
async def update_facility(facility_id: int, name: str | None = None, address: str | None = None, description: str | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    if actor.role != "admin":
        raise PermissionError("Only admin can update facilities")
    async with AsyncSessionLocal() as db:
        f = (await db.execute(select(Facility).where(Facility.id == facility_id, Facility.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not f:
            raise ValueError(f"Facility {facility_id} not found")
        if name is not None:
            f.name = name
        if address is not None:
            f.address = address
        if description is not None:
            f.description = description
        await db.commit()
        await db.refresh(f)
        return {"id": f.id, "name": f.name, "address": f.address}


@mcp.tool(name="delete_facility", description="Delete a facility. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Delete Facility", readOnlyHint=False, destructiveHint=True))
async def delete_facility(facility_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    if actor.role != "admin":
        raise PermissionError("Only admin can delete facilities")
    async with AsyncSessionLocal() as db:
        f = (await db.execute(select(Facility).where(Facility.id == facility_id, Facility.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not f:
            raise ValueError(f"Facility {facility_id} not found")
        await db.delete(f)
        await db.commit()
        return {"deleted": True, "facility_id": facility_id}


@mcp.tool(name="list_facility_floors", description="List floors within a facility.",
          annotations=mcp_types.ToolAnnotations(title="List Facility Floors", readOnlyHint=True))
async def list_facility_floors(facility_id: int) -> list[dict[str, Any]]:
    actor = require_actor_context()
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(Floor).where(Floor.facility_id == facility_id).order_by(Floor.floor_number))).scalars().all()
        return [{"id": r.id, "name": r.name, "floor_number": r.floor_number, "facility_id": r.facility_id} for r in rows]


@mcp.tool(name="create_facility_floor", description="Add a floor to a facility. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Create Facility Floor", readOnlyHint=False, destructiveHint=False))
async def create_facility_floor(facility_id: int, name: str, floor_number: int) -> dict[str, Any]:
    actor = require_actor_context()
    if actor.role != "admin":
        raise PermissionError("Only admin can create floors")
    async with AsyncSessionLocal() as db:
        floor = Floor(facility_id=facility_id, name=name, floor_number=floor_number)
        db.add(floor)
        await db.commit()
        await db.refresh(floor)
        return {"id": floor.id, "name": floor.name, "floor_number": floor.floor_number}


@mcp.tool(name="update_facility_floor", description="Update a floor within a facility. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Update Facility Floor", readOnlyHint=False, destructiveHint=False))
async def update_facility_floor(facility_id: int, floor_id: int, name: str | None = None, floor_number: int | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    if actor.role != "admin":
        raise PermissionError("Only admin can update floors")
    async with AsyncSessionLocal() as db:
        floor = (await db.execute(select(Floor).where(Floor.id == floor_id, Floor.facility_id == facility_id))).scalar_one_or_none()
        if not floor:
            raise ValueError(f"Floor {floor_id} not found")
        if name is not None:
            floor.name = name
        if floor_number is not None:
            floor.floor_number = floor_number
        await db.commit()
        await db.refresh(floor)
        return {"id": floor.id, "name": floor.name, "floor_number": floor.floor_number}


# ---------------------------------------------------------------------------
# BATCH K — User Management
# ---------------------------------------------------------------------------

@mcp.tool(name="list_users", description="List all users in the workspace. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="List Users", readOnlyHint=True))
async def list_users(limit: int = 100) -> list[dict[str, Any]]:
    actor = require_actor_context()
    if actor.role != "admin":
        raise PermissionError("Only admin can list users")
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(User).where(User.workspace_id == actor.workspace_id).limit(limit))).scalars().all()
        return [{"id": r.id, "username": r.username, "email": r.email, "role": r.role, "is_active": r.is_active} for r in rows]


@mcp.tool(name="create_user", description="Create a new user account in the workspace. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Create User", readOnlyHint=False, destructiveHint=False))
async def create_user(username: str, email: str, role: str, password: str) -> dict[str, Any]:
    actor = require_actor_context()
    if actor.role != "admin":
        raise PermissionError("Only admin can create users")
    async with AsyncSessionLocal() as db:
        payload = UserCreate(username=username, email=email, role=role, password=password, workspace_id=actor.workspace_id)
        user = await UserService.create_user(db, payload)
        return {"id": user.id, "username": user.username, "email": user.email, "role": user.role}


@mcp.tool(name="update_user", description="Update a user account (email, role, active status). Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Update User", readOnlyHint=False, destructiveHint=False))
async def update_user(user_id: int, email: str | None = None, role: str | None = None, is_active: bool | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    if actor.role != "admin":
        raise PermissionError("Only admin can update users")
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == user_id, User.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not user:
            raise ValueError(f"User {user_id} not found")
        if email is not None:
            user.email = email
        if role is not None:
            user.role = role
        if is_active is not None:
            user.is_active = is_active
        await db.commit()
        await db.refresh(user)
        return {"id": user.id, "username": user.username, "email": user.email, "role": user.role, "is_active": user.is_active}


@mcp.tool(name="delete_user", description="Deactivate a user account. Admin only.",
          annotations=mcp_types.ToolAnnotations(title="Delete User", readOnlyHint=False, destructiveHint=True))
async def delete_user(user_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    if actor.role != "admin":
        raise PermissionError("Only admin can delete users")
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == user_id, User.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not user:
            raise ValueError(f"User {user_id} not found")
        user.is_active = False
        await db.commit()
        return {"deleted": True, "user_id": user_id}


# ---------------------------------------------------------------------------
# BATCH L — Vitals Writes & Alert Management
# ---------------------------------------------------------------------------

@mcp.tool(name="add_vital_reading", description="Record a new vital reading for a patient (blood pressure, temperature, etc.).",
          annotations=mcp_types.ToolAnnotations(title="Add Vital Reading", readOnlyHint=False, destructiveHint=False))
async def add_vital_reading(patient_id: int, vital_type: str, value: float, unit: str, notes: str | None = None) -> dict[str, Any]:
    from app.schemas.vitals import VitalReadingCreate
    actor = require_actor_context()
    _require_scope("vitals.write")
    async with AsyncSessionLocal() as db:
        payload = VitalReadingCreate(patient_id=patient_id, vital_type=vital_type, value=value, unit=unit, notes=notes)
        reading = await vital_reading_service.create(db, actor.workspace_id, payload)
        return {"id": reading.id, "vital_type": reading.vital_type, "value": reading.value, "unit": reading.unit}


@mcp.tool(name="add_health_observation", description="Add a health observation note for a patient.",
          annotations=mcp_types.ToolAnnotations(title="Add Health Observation", readOnlyHint=False, destructiveHint=False))
async def add_health_observation(patient_id: int, observation_type: str, description: str, severity: str = "normal") -> dict[str, Any]:
    from app.schemas.vitals import HealthObservationCreate
    actor = require_actor_context()
    _require_scope("vitals.write")
    async with AsyncSessionLocal() as db:
        payload = HealthObservationCreate(patient_id=patient_id, observation_type=observation_type, description=description, severity=severity)
        obs = await health_observation_service.create(db, actor.workspace_id, payload)
        return {"id": obs.id, "observation_type": obs.observation_type, "severity": obs.severity}


@mcp.tool(name="add_timeline_event", description="Add a manual timeline event for a patient (intervention, observation, etc.).",
          annotations=mcp_types.ToolAnnotations(title="Add Timeline Event", readOnlyHint=False, destructiveHint=False))
async def add_timeline_event(patient_id: int, event_type: str, description: str, severity: str = "info") -> dict[str, Any]:
    from app.schemas.activity import TimelineEventCreate
    actor = require_actor_context()
    _require_scope("vitals.write")
    async with AsyncSessionLocal() as db:
        payload = TimelineEventCreate(patient_id=patient_id, event_type=event_type, description=description, severity=severity)
        event = await activity_service.create_timeline_event(db, actor.workspace_id, payload)
        return {"id": event.id, "event_type": event.event_type, "created_at": str(event.created_at)}


@mcp.tool(name="create_alert", description="Manually create a clinical alert for a patient or device.",
          annotations=mcp_types.ToolAnnotations(title="Create Alert", readOnlyHint=False, destructiveHint=False))
async def create_alert(alert_type: str, description: str, severity: str = "medium", patient_id: int | None = None, device_id: int | None = None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("alerts.write")
    if actor.role not in {"admin", "head_nurse"}:
        raise PermissionError("Only admin or head_nurse can create alerts")
    async with AsyncSessionLocal() as db:
        payload = AlertCreate(alert_type=alert_type, description=description, severity=severity, patient_id=patient_id, device_id=device_id)
        alert = await alert_service.create(db, actor.workspace_id, payload)
        return {"id": alert.id, "alert_type": alert.alert_type, "severity": alert.severity, "status": alert.status}


@mcp.tool(name="get_alert_details", description="Get details of a specific alert by ID.",
          annotations=mcp_types.ToolAnnotations(title="Get Alert Details", readOnlyHint=True))
async def get_alert_details(alert_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("alerts.read")
    async with AsyncSessionLocal() as db:
        alert = (await db.execute(select(Alert).where(Alert.id == alert_id, Alert.workspace_id == actor.workspace_id))).scalar_one_or_none()
        if not alert:
            raise ValueError(f"Alert {alert_id} not found")
        return {"id": alert.id, "alert_type": alert.alert_type, "description": alert.description, "severity": alert.severity, "status": alert.status, "patient_id": alert.patient_id, "device_id": alert.device_id, "created_at": str(alert.created_at), "acknowledged_at": str(alert.acknowledged_at) if alert.acknowledged_at else None, "resolved_at": str(alert.resolved_at) if alert.resolved_at else None}


@mcp.tool(name="list_all_alerts", description="List all alerts (active and resolved) for admin/head_nurse review.",
          annotations=mcp_types.ToolAnnotations(title="List All Alerts", readOnlyHint=True))
async def list_all_alerts(status: str | None = None, severity: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("alerts.read")
    async with AsyncSessionLocal() as db:
        stmt = select(Alert).where(Alert.workspace_id == actor.workspace_id)
        if status:
            stmt = stmt.where(Alert.status == status)
        if severity:
            stmt = stmt.where(Alert.severity == severity)
        rows = (await db.execute(stmt.order_by(Alert.created_at.desc()).limit(limit))).scalars().all()
        return [{"id": r.id, "alert_type": r.alert_type, "severity": r.severity, "status": r.status, "patient_id": r.patient_id, "created_at": str(r.created_at)} for r in rows]


_WORKSPACE_TOOL_REGISTRY: dict[str, Callable[..., Awaitable[Any]]] = {
    "get_current_user_context": get_current_user_context,
    "get_system_health": get_system_health,
    "list_workspaces": list_workspaces,
    "list_visible_patients": list_visible_patients,
    "get_patient_details": get_patient_details,
    "update_patient_room": update_patient_room,
    "create_patient_record": create_patient_record,
    "list_devices": list_devices,
    "list_active_alerts": list_active_alerts,
    "acknowledge_alert": acknowledge_alert,
    "resolve_alert": resolve_alert,
    "list_rooms": list_rooms,
    "trigger_camera_photo": trigger_camera_photo,
    "control_room_smart_device": control_room_smart_device,
    "list_workflow_tasks": list_workflow_tasks,
    "list_workflow_schedules": list_workflow_schedules,
    "list_facilities": list_facilities,
    "get_ai_runtime_summary": get_ai_runtime_summary,
    "get_patient_vitals": get_patient_vitals,
    "get_patient_timeline": get_patient_timeline,
    "create_workflow_task": create_workflow_task,
    "update_workflow_task_status": update_workflow_task_status,
    "send_message": send_message,
    "get_message_recipients": get_message_recipients,
    "get_workspace_analytics": get_workspace_analytics,
    "send_device_command": send_device_command,
    "get_facility_details": get_facility_details,
    "get_floorplan_layout": get_floorplan_layout,
    "execute_python_code": execute_python_code,
    # --- BATCH A: Patient Management ---
    "update_patient": update_patient,
    "delete_patient": delete_patient,
    "set_patient_mode": set_patient_mode,
    "list_patient_devices": list_patient_devices,
    "assign_patient_device": assign_patient_device,
    "unassign_patient_device": unassign_patient_device,
    "list_patient_caregivers": list_patient_caregivers,
    "update_patient_caregivers": update_patient_caregivers,
    "list_patient_contacts": list_patient_contacts,
    "create_patient_contact": create_patient_contact,
    "update_patient_contact": update_patient_contact,
    "delete_patient_contact": delete_patient_contact,
    # --- BATCH B: Workflow Messaging & Coordination ---
    "list_messages": list_messages,
    "mark_message_read": mark_message_read,
    "create_workflow_schedule": create_workflow_schedule,
    "update_workflow_schedule": update_workflow_schedule,
    "list_handover_notes": list_handover_notes,
    "create_handover_note": create_handover_note,
    "list_care_directives": list_care_directives,
    "create_care_directive": create_care_directive,
    "update_care_directive": update_care_directive,
    "acknowledge_care_directive": acknowledge_care_directive,
    "get_audit_trail": get_audit_trail,
    "claim_workflow_item": claim_workflow_item,
    "handoff_workflow_item": handoff_workflow_item,
    # --- BATCH C: Rooms & Facilities ---
    "get_room_details": get_room_details,
    "create_room": create_room,
    "update_room": update_room,
    "delete_room": delete_room,
    "create_facility": create_facility,
    "update_facility": update_facility,
    "delete_facility": delete_facility,
    "list_facility_floors": list_facility_floors,
    "create_facility_floor": create_facility_floor,
    "update_facility_floor": update_facility_floor,
    # --- BATCH D: Devices ---
    "get_device_details": get_device_details,
    "list_device_activity": list_device_activity,
    "register_device": register_device,
    "update_device": update_device,
    "assign_device_patient": assign_device_patient,
    # --- BATCH E: Caregivers ---
    "list_caregivers": list_caregivers,
    "create_caregiver": create_caregiver,
    "get_caregiver_details": get_caregiver_details,
    "update_caregiver": update_caregiver,
    "delete_caregiver": delete_caregiver,
    "list_caregiver_patients": list_caregiver_patients,
    "update_caregiver_patients": update_caregiver_patients,
    # --- BATCH F: Medications ---
    "list_prescriptions": list_prescriptions,
    "create_prescription": create_prescription,
    "update_prescription": update_prescription,
    "list_pharmacy_orders": list_pharmacy_orders,
    "request_pharmacy_order": request_pharmacy_order,
    "update_pharmacy_order": update_pharmacy_order,
    # --- BATCH G: Support & Service Requests ---
    "list_support_tickets": list_support_tickets,
    "create_support_ticket": create_support_ticket,
    "update_support_ticket": update_support_ticket,
    "add_support_comment": add_support_comment,
    "list_service_requests": list_service_requests,
    "create_service_request": create_service_request,
    "update_service_request": update_service_request,
    # --- BATCH H: Shift Checklist & Calendar ---
    "get_my_shift_checklist": get_my_shift_checklist,
    "update_my_shift_checklist": update_my_shift_checklist,
    "list_workspace_shift_checklists": list_workspace_shift_checklists,
    "list_calendar_events": list_calendar_events,
    # --- BATCH I: AI Settings ---
    "get_ai_settings": get_ai_settings,
    "update_ai_settings": update_ai_settings,
    # --- BATCH J: User Management ---
    "list_users": list_users,
    "create_user": create_user,
    "update_user": update_user,
    "delete_user": delete_user,
    # --- BATCH K: Vitals & Alerts ---
    "add_vital_reading": add_vital_reading,
    "add_health_observation": add_health_observation,
    "add_timeline_event": add_timeline_event,
    "create_alert": create_alert,
    "get_alert_details": get_alert_details,
    "list_all_alerts": list_all_alerts,
}


async def execute_workspace_tool(
    *,
    tool_name: str,
    workspace_id: int,
    arguments: dict[str, Any] | None = None,
    actor_context: dict[str, Any] | None = None,
) -> Any:
    tool = _WORKSPACE_TOOL_REGISTRY.get(tool_name)
    if tool is None:
        raise ValueError(f"Unsupported MCP tool: {tool_name}")
    actor_context = dict(actor_context or {})
    scopes = resolve_effective_token_scopes(
        actor_context.get("role", ""),
        list(actor_context.get("scopes") or []),
    )
    with wrap_actor_context(
        workspace_id=workspace_id,
        actor_context=actor_context,
        scopes=scopes,
    ):
        return await tool(**dict(arguments or {}))


class wrap_actor_context:
    def __init__(self, *, workspace_id: int, actor_context: dict[str, Any], scopes: set[str]):
        self.workspace_id = workspace_id
        self.actor_context = actor_context
        self.scopes = scopes
        self._cm = None

    def __enter__(self):
        from app.mcp.context import McpActorContext, actor_scope

        self._cm = actor_scope(
            McpActorContext(
                user_id=int(self.actor_context.get("user_id", 0)),
                workspace_id=self.workspace_id,
                role=str(self.actor_context.get("role", "")),
                patient_id=self.actor_context.get("patient_id"),
                caregiver_id=self.actor_context.get("caregiver_id"),
                scopes=self.scopes,
            )
        )
        return self._cm.__enter__()

    def __exit__(self, exc_type, exc, tb):
        assert self._cm is not None
        return self._cm.__exit__(exc_type, exc, tb)


def create_remote_mcp_app() -> Starlette:
    sse_app = wrap_mcp_app(
        mcp.sse_app(),
        allowed_origins=settings.normalized_mcp_allowed_origins,
        require_origin=settings.mcp_require_origin,
        resource_metadata_url="/.well-known/oauth-protected-resource/mcp",
    )
    streamable_app = wrap_mcp_app(
        mcp.streamable_http_app(),
        allowed_origins=settings.normalized_mcp_allowed_origins,
        require_origin=settings.mcp_require_origin,
        resource_metadata_url="/.well-known/oauth-protected-resource/mcp",
    )
    return Starlette(
        routes=[
            Mount("/sse", app=sse_app),
            Mount("/", app=streamable_app),
        ]
    )
