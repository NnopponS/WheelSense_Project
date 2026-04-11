from __future__ import annotations

"""Full application data wipe (all workspaces) with optional preserved admin user.

Used by `scripts/clear_database.py` and the authenticated admin API. Deletion order
follows foreign-key dependencies across `app.models`.
"""

import logging
from typing import Any

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models import (
    ActivityTimeline,
    Alert,
    AuditTrailEvent,
    CareDirective,
    CareGiver,
    CareGiverDeviceAssignment,
    CareGiverPatientAccess,
    CareGiverShift,
    CareGiverZone,
    CareSchedule,
    CareTask,
    ChatAction,
    ChatConversation,
    ChatMessage,
    DemoActorPosition,
    Device,
    DeviceActivityEvent,
    DeviceCommandDispatch,
    Facility,
    Floor,
    FloorplanAsset,
    FloorplanLayout,
    HandoverNote,
    HealthObservation,
    IMUTelemetry,
    LocalizationCalibrationSample,
    LocalizationCalibrationSession,
    LocalizationConfig,
    MobileDeviceTelemetry,
    MotionTrainingData,
    NodeStatusTelemetry,
    Patient,
    PatientContact,
    PatientDeviceAssignment,
    PharmacyOrder,
    PhotoRecord,
    Prescription,
    ServiceRequest,
    Room,
    RoomPrediction,
    RSSIReading,
    RSSITrainingData,
    RoleMessage,
    ShiftChecklistState,
    SmartDevice,
    Specialist,
    SupportTicket,
    SupportTicketAttachment,
    SupportTicketComment,
    User,
    VitalReading,
    Workspace,
    WorkspaceAISettings,
)

logger = logging.getLogger("wheelsense")

# Child / dependent tables first (workspace-scoped and cross-FK safe order).
_CLEAR_MODELS_ORDER: list[type[Any]] = [
    ShiftChecklistState,
    SupportTicketAttachment,
    SupportTicketComment,
    SupportTicket,
    ChatAction,
    ChatMessage,
    ChatConversation,
    WorkspaceAISettings,
    AuditTrailEvent,
    HandoverNote,
    RoleMessage,
    CareDirective,
    CareTask,
    CareSchedule,
    PharmacyOrder,
    ServiceRequest,
    Prescription,
    Specialist,
    PhotoRecord,
    DemoActorPosition,
    Alert,
    ActivityTimeline,
    VitalReading,
    HealthObservation,
    DeviceCommandDispatch,
    DeviceActivityEvent,
    PatientDeviceAssignment,
    CareGiverDeviceAssignment,
    LocalizationCalibrationSample,
    LocalizationCalibrationSession,
    LocalizationConfig,
    NodeStatusTelemetry,
    MobileDeviceTelemetry,
    MotionTrainingData,
    RSSITrainingData,
    RSSIReading,
    RoomPrediction,
    IMUTelemetry,
    SmartDevice,
    PatientContact,
    Patient,
    CareGiverShift,
    CareGiverZone,
    CareGiverPatientAccess,
    CareGiver,
    Device,
    Room,
    FloorplanLayout,
    FloorplanAsset,
    Floor,
    Facility,
]


async def clear_application_data(
    session: AsyncSession,
    *,
    preserve_user_id: int | None,
    new_workspace_name: str | None = None,
    new_workspace_mode: str = "real",
    reset_preserved_password_to: str | None = None,
) -> dict[str, Any]:
    """Delete all application rows. Optionally keep one user and attach a fresh workspace.

    When ``preserve_user_id`` is set, that user must exist and is kept; password is only
    changed if ``reset_preserved_password_to`` is provided. A new empty workspace is
    created and old workspaces (and other users) are removed.

    When ``preserve_user_id`` is None, all users and workspaces are deleted; the caller
    must create a new workspace + user if the app should remain usable.
    """
    stats: dict[str, Any] = {"tables": {}, "preserve_user_id": preserve_user_id}

    for model in _CLEAR_MODELS_ORDER:
        label = model.__tablename__
        try:
            res = await session.execute(delete(model))
            stats["tables"][label] = getattr(res, "rowcount", None)
        except Exception:
            logger.exception("clear_application_data: failed deleting %s", label)
            raise

    if preserve_user_id is not None:
        await session.execute(delete(User).where(User.id != preserve_user_id))
        preserved = await session.get(User, preserve_user_id)
        if not preserved:
            raise ValueError(f"preserve_user_id={preserve_user_id} not found after data wipe")

        ws_name = (new_workspace_name or "System Workspace").strip() or "System Workspace"
        new_ws = Workspace(name=ws_name[:64], mode=new_workspace_mode, is_active=True)
        session.add(new_ws)
        await session.flush()

        preserved.workspace_id = new_ws.id
        preserved.caregiver_id = None
        preserved.patient_id = None
        if reset_preserved_password_to:
            preserved.hashed_password = get_password_hash(reset_preserved_password_to)

        await session.execute(delete(Workspace).where(Workspace.id != new_ws.id))

        await session.commit()
        await session.refresh(preserved)
        stats["new_workspace_id"] = new_ws.id
        stats["preserved_username"] = preserved.username
        return stats

    # Full wipe: no preserved user
    await session.execute(delete(User))
    await session.execute(delete(Workspace))
    await session.commit()
    stats["new_workspace_id"] = None
    return stats
