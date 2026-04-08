from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import get_current_active_user
from .endpoints import (
    workspaces, devices, rooms, telemetry, localization, motion,
    patients, caregivers, facilities, vitals, timeline, alerts,
    auth, users, homeassistant, retention, cameras, analytics,
    chat, ai_settings, workflow, future_domains, profile_images,
)
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
    future_domains.router,
    prefix="/future",
    tags=["future-domains"],
    dependencies=[Depends(get_current_active_user)],
)

@api_router.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "model_ready": is_model_ready()}
