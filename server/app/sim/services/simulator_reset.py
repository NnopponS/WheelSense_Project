"""Simulator reset service for WheelSense dual-environment setup.

This service provides safe reset functionality for the simulator environment,
clearing dynamic data and re-seeding baseline demo data.
"""

from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models import (
    ActivityTimeline,
    Alert,
    AuditTrailEvent,
    CareDirective,
    CareGiver,
    CareGiverPatientAccess,
    CareSchedule,
    CareWorkflowJob,
    CareTask,
    DemoActorPosition,
    Device,
    Facility,
    Floor,
    FloorplanLayout,
    HandoverNote,
    Patient,
    PatientContact,
    PatientDeviceAssignment,
    PharmacyOrder,
    PhotoRecord,
    Prescription,
    RoleMessage,
    Room,
    ShiftChecklistState,
    SimGameActorMap,
    SimGameRoomMap,
    SmartDevice,
    Specialist,
    User,
    VitalReading,
    Workspace,
)


async def clear_workspace_dynamic_data(session: AsyncSession, workspace_id: int) -> dict[str, int]:
    """Clear all dynamic/event data for a workspace while preserving structure.
    
    Preserves: Workspace, Facility, Floors, Rooms, CareGivers, Patients, Devices (structure only)
    Clears: All event data, assignments, readings, alerts, workflow items, etc.
    
    Returns:
        Dict with counts of cleared records per table.
    """
    cleared_counts: dict[str, int] = {}
    
    # Clear in reverse dependency order
    tables_to_clear = [
        ("pharmacy_orders", PharmacyOrder),
        ("prescriptions", Prescription),
        ("specialists", Specialist),
        ("photo_records", PhotoRecord),
        ("role_messages", RoleMessage),
        ("handover_notes", HandoverNote),
        ("audit_trail_events", AuditTrailEvent),
        ("shift_checklist_states", ShiftChecklistState),
        ("care_workflow_jobs", CareWorkflowJob),
        ("care_tasks", CareTask),
        ("care_schedules", CareSchedule),
        ("care_directives", CareDirective),
        ("demo_actor_positions", DemoActorPosition),
        ("alerts", Alert),
        ("activity_timeline", ActivityTimeline),
        ("vital_readings", VitalReading),
        ("smart_devices", SmartDevice),
        ("patient_device_assignments", PatientDeviceAssignment),
    ]
    
    for table_name, model in tables_to_clear:
        result = await session.execute(
            delete(model).where(model.workspace_id == workspace_id)
        )
        cleared_counts[table_name] = result.rowcount or 0
    
    await session.commit()
    return cleared_counts


async def clear_workspace_full(session: AsyncSession, workspace_id: int) -> dict[str, int]:
    """Delete every workspace-scoped row so the seeder can start from zero.

    This extends ``clear_workspace_dynamic_data`` with structural tables
    (patients, caregivers, devices, rooms, floors, facility, sim-game maps)
    plus patient emergency contacts. The bootstrap admin user is preserved by
    username so the operator can still log in immediately after reset.

    Delete order respects FK dependencies (child rows before parents) because
    SQLite in tests does not enforce ``ON DELETE CASCADE`` and we want the
    same behaviour in Postgres and SQLite.
    """
    cleared = await clear_workspace_dynamic_data(session, workspace_id)

    # Patient contacts are scoped by patient_id, not workspace_id.
    contact_result = await session.execute(
        delete(PatientContact).where(
            PatientContact.patient_id.in_(
                select(Patient.id).where(Patient.workspace_id == workspace_id)
            )
        )
    )
    cleared["patient_contacts"] = contact_result.rowcount or 0

    structural_tables: list[tuple[str, Any]] = [
        ("sim_game_actor_map", SimGameActorMap),
        ("sim_game_room_map", SimGameRoomMap),
        ("floorplan_layouts", FloorplanLayout),
        ("patients", Patient),
        ("caregivers", CareGiver),
        ("devices", Device),
        ("rooms", Room),
        ("floors", Floor),
        ("facilities", Facility),
    ]
    for table_name, model in structural_tables:
        result = await session.execute(
            delete(model).where(model.workspace_id == workspace_id)
        )
        cleared[table_name] = result.rowcount or 0

    # Drop every workspace-scoped user except the bootstrap admin so the
    # operator's current session still resolves after reset. The seeder then
    # re-upserts all dashboard/patient accounts.
    user_result = await session.execute(
        delete(User).where(
            User.workspace_id == workspace_id,
            User.username != settings.bootstrap_admin_username,
        )
    )
    cleared["users"] = user_result.rowcount or 0

    await session.commit()
    return cleared


async def reset_simulator_workspace(workspace_name: str | None = None) -> dict[str, Any]:
    """Reset the simulator workspace to baseline state.
    
    This function:
    1. Clears all dynamic data (alerts, vitals, tasks, etc.)
    2. Re-seeds baseline data using the sim team seeder
    3. Returns summary of actions taken
    
    Args:
        workspace_name: Optional workspace name override. Defaults to BOOTSTRAP_DEMO_WORKSPACE_NAME.
        
    Returns:
        Dict with reset summary including cleared counts and new seeded data.
    """
    # Game-aligned seed is the single source of truth for simulator baseline
    # state. See app/sim/runtime/sim_game_seed.py.
    from app.sim.runtime.sim_game_seed import seed_sim_game_workspace

    target_workspace = (
        workspace_name
        or settings.bootstrap_demo_workspace_name
        or "WheelSense Simulation"
    )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Workspace).where(Workspace.name == target_workspace)
        )
        workspace = result.scalar_one_or_none()

        if workspace is None:
            workspace_id = await seed_sim_game_workspace(target_workspace, reset=False)
            return {
                "action": "created",
                "workspace_id": workspace_id,
                "workspace_name": target_workspace,
                "message": "Created new simulator workspace with game-aligned baseline",
            }

        # Clean-slate: wipe every workspace-scoped row (events AND structural
        # rows such as patients/caregivers/rooms) so prior seeds (e.g. legacy
        # seed_demo.py Thai cohort) cannot leak into the fresh game-aligned
        # baseline. The bootstrap admin row is preserved by username.
        cleared = await clear_workspace_full(session, workspace.id)

    workspace_id = await seed_sim_game_workspace(target_workspace, reset=False)

    return {
        "action": "reset",
        "workspace_id": workspace_id,
        "workspace_name": target_workspace,
        "cleared_counts": cleared,
        "message": "Simulator workspace reset to game-aligned baseline",
    }


async def get_simulator_status(session: AsyncSession) -> dict[str, Any]:
    """Get current simulator environment status.

    Uses the caller's DB session (request-scoped ``get_db``) so tests and
    multi-DB deployments stay consistent.

    Returns:
        Dict with environment info and workspace statistics.
    """
    is_sim = settings.is_simulator_mode

    workspace_name = settings.bootstrap_demo_workspace_name or "WheelSense Demo Workspace"
    result = await session.execute(select(Workspace).where(Workspace.name == workspace_name))
    workspace = result.scalar_one_or_none()

    if workspace is None:
        return {
            "env_mode": settings.env_mode,
            "is_simulator": is_sim,
            "workspace_exists": False,
            "workspace_name": workspace_name,
        }

    wid = workspace.id

    async def _safe_workspace_count(model: Any) -> int:
        try:
            value = await session.scalar(
                select(func.count()).select_from(model).where(model.workspace_id == wid)
            )
            return int(value or 0)
        except (ProgrammingError, OperationalError) as exc:
            detail = str(getattr(exc, "orig", exc)).lower()
            if "does not exist" in detail or "no such table" in detail:
                return 0
            raise

    patient_count = await _safe_workspace_count(Patient)
    caregiver_count = await _safe_workspace_count(CareGiver)
    device_count = await _safe_workspace_count(Device)
    alert_count = await _safe_workspace_count(Alert)
    task_count = await _safe_workspace_count(CareTask)
    vital_count = await _safe_workspace_count(VitalReading)

    return {
        "env_mode": settings.env_mode,
        "is_simulator": is_sim,
        "workspace_exists": True,
        "workspace_id": workspace.id,
        "workspace_name": workspace.name,
        "statistics": {
            "patients": patient_count,
            "caregivers": caregiver_count,
            "devices": device_count,
            "alerts": alert_count,
            "tasks": task_count,
            "vitals": vital_count,
        },
    }


def run_reset_sync(workspace_name: str | None = None) -> dict[str, Any]:
    """Synchronous wrapper for reset_simulator_workspace.
    
    Use this for CLI entry points or when async context is not available.
    """
    return asyncio.run(reset_simulator_workspace(workspace_name))


def get_status_sync() -> dict[str, Any]:
    """Synchronous wrapper for get_simulator_status."""

    async def _run() -> dict[str, Any]:
        async with AsyncSessionLocal() as session:
            return await get_simulator_status(session)

    return asyncio.run(_run())
