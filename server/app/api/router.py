from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import get_current_active_user
from .endpoints import (
    admin_database,
    workspaces, devices, rooms, telemetry, localization, motion,
    patients, caregivers, facilities, vitals, timeline, alerts,
    auth, users, homeassistant, retention, cameras, analytics,
    chat, ai_settings, workflow, floorplans, care, medication, service_requests, profile_images,
    support, calendar, chat_actions, shift_checklist, mcp_auth, task_management, tasks,
)
from app.config import settings
from app.localization import is_model_ready

api_router = APIRouter(prefix="/api")

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
# ── Simulator-only routers ───────────────────────────────────────────────────
# Mounted only when ENV_MODE=simulator so production builds don't even expose
# the OpenAPI schema for these routes. See app/sim/__init__.py for contract.
if settings.is_simulator_mode:
    from app.sim.endpoints import demo_control as _sim_demo_control
    from app.sim.endpoints import game as _sim_game
    from app.sim.endpoints import sim_clock as _sim_clock
    from app.sim.services import demo_sensor_hub as _demo_sensor_hub

    api_router.include_router(
        _sim_demo_control.router,
        prefix="/demo",
        tags=["demo-control"],
        dependencies=[Depends(get_current_active_user)],
    )
    # Game bridge: REST requires JWT via standard header; WebSocket uses
    # its own query-param token check so it cannot share the HTTP guard.
    api_router.include_router(
        _sim_game.router,
        prefix="/sim/game",
        tags=["sim-game"],
    )
    # Demo sensor hub: Mobile/M5 sensor ingest and live feed (display-only, no vitals write)
    api_router.include_router(
        _demo_sensor_hub.router,
        prefix="/demo/sensor",
        tags=["demo-sensor"],
    )
    # Sim clock: advance / rewind time for EaseAI "past hour" + task reminder demos.
    api_router.include_router(
        _sim_clock.router,
        prefix="/sim/clock",
        tags=["sim-clock"],
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
    return {"status": "ok", "model_ready": is_model_ready()}
