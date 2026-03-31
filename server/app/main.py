"""WheelSense Server — FastAPI application entry point."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import settings
from app.db.session import init_db
from .mqtt_handler import mqtt_listener
from app.api.router import api_router as router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("wheelsense")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables & launch MQTT listener. Shutdown: cancel tasks."""
    logger.info("Starting %s", settings.app_name)

    # Create database tables
    await init_db()
    logger.info("Database initialized")

    # Start MQTT listener as background task
    mqtt_task = asyncio.create_task(mqtt_listener())
    logger.info("MQTT listener started")

    yield

    # Shutdown
    mqtt_task.cancel()
    try:
        await mqtt_task
    except asyncio.CancelledError:
        pass
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version="3.0.0",
    description="WheelSense IoT Platform — IMU telemetry, RSSI localization, camera control",
    lifespan=lifespan,
)

app.include_router(router)


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": "3.0.0",
        "docs": "/docs",
        "health": "/api/health",
    }
