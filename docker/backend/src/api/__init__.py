"""
WheelSense MCP Server - Routes Package
Modular route handlers for the FastAPI application
"""

from fastapi import APIRouter

# Import all route modules
from .rooms import router as rooms_router
from .appliances import router as appliances_router
from .timeline import router as timeline_router
from .users import router as users_router
from .map import router as map_router
from .patients import router as patients_router
from .routines import router as routines_router
from .wheelchairs import router as wheelchairs_router
from .emergency import router as emergency_router
from .doctor_notes import router as doctor_notes_router
from .devices import router as devices_router
from .video import router as video_router

# List of all routers for easy registration
all_routers = [
    rooms_router,
    appliances_router,
    timeline_router,
    users_router,
    map_router,
    patients_router,
    routines_router,
    wheelchairs_router,
    emergency_router,
    doctor_notes_router,
    devices_router,
    video_router,
]

def register_routes(app):
    """Register all routes with the FastAPI app."""
    for router in all_routers:
        app.include_router(router)


