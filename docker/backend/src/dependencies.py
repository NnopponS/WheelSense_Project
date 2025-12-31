"""
Dependency injection for FastAPI routes.
Provides access to app state services.
"""

from fastapi import Request, HTTPException


def get_db(request: Request):
    """Get database instance from app state."""
    db = getattr(request.app.state, 'db', None)
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    return db


def get_mqtt_handler(request: Request):
    """Get MQTT handler from app state."""
    mqtt_handler = getattr(request.app.state, 'mqtt_handler', None)
    if not mqtt_handler:
        raise HTTPException(status_code=503, detail="MQTT not available")
    return mqtt_handler


def get_ai_service(request: Request):
    """Get AI service from app state."""
    return getattr(request.app.state, 'ai_service', None)


def get_emergency_service(request: Request):
    """Get emergency service from app state."""
    return getattr(request.app.state, 'emergency_service', None)


def get_stream_handler(request: Request):
    """Get stream handler from app state."""
    return getattr(request.app.state, 'stream_handler', None)

