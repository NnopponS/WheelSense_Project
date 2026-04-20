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
    PatientDeviceAssignment,
    PharmacyOrder,
    PhotoRecord,
    Prescription,
    RoleMessage,
    Room,
    ShiftChecklistState,
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

        # Clear dynamic event streams; structural rows are kept and upserted
        # by the seeder to preserve FK references (patient_id, room_id, etc.).
        cleared = await clear_workspace_dynamic_data(session, workspace.id)
        await session.commit()

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
