from __future__ import annotations

import asyncio
import uuid

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import text

from app.config import settings
from app.api.dependencies import get_current_active_user
from app.db.session import AsyncSessionLocal
from app.mqtt_handler import mqtt_is_connected
from .endpoints import (
    admin_database,
    workspaces, devices, rooms, telemetry, localization, motion,
    patients, caregivers, facilities, vitals, timeline, alerts,
    auth, users, homeassistant, retention, cameras, analytics,
    chat, ai_settings, workflow, floorplans, care, medication, service_requests, profile_images, demo_control,
    support, calendar, chat_actions, shift_checklist, mcp_auth, task_management, tasks,
)
from app.localization import is_model_ready

api_router = APIRouter(prefix="/api")
_api_instance_id = uuid.uuid4().hex

# Public static assets (no JWT — filename is unguessable)
api_router.include_router(
    profile_images.router,
    prefix="/public/profile-images",
    tags=["public"],
)

# ── Existing ─────────────────────────────────────────────────────────────────
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"], dependencies=[Depends(get_current_active_user)])
api_router.include_router(devices.router, prefix="/devices", tags=["devices"], dependencies=[Depends(get_current_active_user)])
api_router.include_router(rooms.router, prefix="/rooms", tags=["rooms"], dependencies=[Depends(get_current_active_user)])
api_router.include_router(telemetry.router, prefix="/telemetry", tags=["telemetry"], dependencies=[Depends(get_current_active_user)])
api_router.include_router(localization.router, prefix="/localization", tags=["localization"], dependencies=[Depends(get_current_active_user)])
api_router.include_router(motion.router, prefix="/motion", tags=["motion"], dependencies=[Depends(get_current_active_user)])

# ── Phase 3: New Domain Endpoints ────────────────────────────────────────────
api_router.include_router(patients.router, prefix="/patients", tags=["patients"], dependencies=[Depends(get_current_active_user)])
api_router.include_router(caregivers.router, prefix="/caregivers", tags=["caregivers"], dependencies=[Depends(get_current_active_user)])
api_router.include_router(facilities.router, prefix="/facilities", tags=["facilities"], dependencies=[Depends(get_current_active_user)])
api_router.include_router(vitals.router, prefix="/vitals", tags=["vitals"], dependencies=[Depends(get_current_active_user)])
api_router.include_router(timeline.router, prefix="/timeline", tags=["timeline"], dependencies=[Depends(get_current_active_user)])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"], dependencies=[Depends(get_current_active_user)])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"], dependencies=[Depends(get_current_active_user)])

# ── Phase 5: Auth & Users ────────────────────────────────────────────────────
api_router.include_router(auth.router, prefix="/auth")
api_router.include_router(users.router, prefix="/users")

# ── Phase 9: HomeAssistant ───────────────────────────────────────────────────
api_router.include_router(homeassistant.router, prefix="/ha", tags=["homeassistant"], dependencies=[Depends(get_current_active_user)])

# ── Phase 6: Data Retention ──────────────────────────────────────────────────
api_router.include_router(retention.router, prefix="/retention", tags=["retention"], dependencies=[Depends(get_current_active_user)])

# ── Phase 8: Camera ──────────────────────────────────────────────────────────
api_router.include_router(cameras.router, prefix="/cameras", tags=["cameras"], dependencies=[Depends(get_current_active_user)])

api_router.include_router(
    chat.router,
    prefix="/chat",
    tags=["chat"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    ai_settings.router,
    prefix="/settings/ai",
    tags=["ai-settings"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    workflow.router,
    prefix="/workflow",
    tags=["workflow"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    floorplans.router,
    prefix="/floorplans",
    tags=["floorplans"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    care.router,
    prefix="/care",
    tags=["care"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    medication.router,
    prefix="/medication",
    tags=["medication"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    service_requests.router,
    prefix="/services",
    tags=["service-requests"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    calendar.router,
    prefix="/calendar",
    tags=["calendar"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    support.router,
    prefix="/support",
    tags=["support"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    chat_actions.router,
    prefix="/chat",
    tags=["chat-actions"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    demo_control.router,
    prefix="/demo",
    tags=["demo-control"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    admin_database.router,
    prefix="/admin/database",
    tags=["admin-database"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    shift_checklist.router,
    prefix="/shift-checklist",
    tags=["shift-checklist"],
    dependencies=[Depends(get_current_active_user)],
)

# MCP OAuth endpoints for external MCP clients
api_router.include_router(
    mcp_auth.router,
    prefix="/mcp",
    tags=["mcp-auth"],
    dependencies=[Depends(get_current_active_user)],
)
api_router.include_router(
    task_management.router,
    prefix="/task-management",
    tags=["task-management"],
    dependencies=[Depends(get_current_active_user)],
)

# Unified Task Management (new system)
api_router.include_router(
    tasks.router,
    prefix="/tasks",
    tags=["tasks"],
    dependencies=[Depends(get_current_active_user)],
)

@api_router.get("/health", tags=["health"])
async def health():
    async def database_status() -> str:
        try:
            async with asyncio.timeout(3):
                async with AsyncSessionLocal() as session:
                    await session.execute(text("SELECT 1"))
            return "online"
        except Exception:
            return "offline"

    async def automation_status() -> str:
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                response = await client.get(f"{settings.agent_runtime_url.rstrip('/')}/health")
            return "online" if response.is_success else "offline"
        except Exception:
            return "offline"

    database, automation = await asyncio.gather(
        database_status(), automation_status()
    )
    return {
        "status": "ok",
        "model_ready": is_model_ready(),
        "instance_id": _api_instance_id,
        "services": {
            "api": "online",
            "database": database,
            "mqtt": "online" if mqtt_is_connected() else "offline",
            "automation": automation,
        },
    }
