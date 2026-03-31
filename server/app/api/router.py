from fastapi import APIRouter

from .endpoints import workspaces, devices, rooms, telemetry, localization, motion
from app.localization import is_model_ready

api_router = APIRouter(prefix="/api")

api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(rooms.router, prefix="/rooms", tags=["rooms"])
api_router.include_router(telemetry.router, prefix="/telemetry", tags=["telemetry"])
api_router.include_router(localization.router, prefix="/localization", tags=["localization"])
api_router.include_router(motion.router, prefix="/motion", tags=["motion"])

@api_router.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "model_ready": is_model_ready()}
