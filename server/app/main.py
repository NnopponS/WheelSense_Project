"""WheelSense Server — FastAPI application entry point."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import settings
from app.core.security import validate_runtime_settings
from app.db.session import init_db
from .mqtt_handler import mqtt_listener
from app.api.router import api_router as router
from app.mcp_server import mcp

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
    validate_runtime_settings()

    from app.db.init_db import (
        init_admin_user,
        try_attach_bootstrap_admin_to_demo_workspace,
    )

    await init_db()
    logger.info("Database initialized")
    await init_admin_user()
    await try_attach_bootstrap_admin_to_demo_workspace()

    # Start MQTT listener as background task
    mqtt_task = asyncio.create_task(mqtt_listener())
    logger.info("MQTT listener started")

    # Start retention scheduler (Phase 6)
    from app.workers.retention_worker import (
        start_retention_scheduler,
        stop_retention_scheduler,
    )
    if settings.retention_enabled:
        start_retention_scheduler()
    else:
        logger.info("Retention scheduler disabled via config")

    yield

    # Shutdown
    stop_retention_scheduler()
    mqtt_task.cancel()
    try:
        await mqtt_task
    except asyncio.CancelledError:
        pass
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version="3.2.0",
    description="WheelSense IoT Platform — IMU telemetry, RSSI localization, camera control",
    lifespan=lifespan,
)

app.include_router(router)


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": "3.2.0",
        "docs": "/docs",
        "health": "/api/health",
        "mcp": "/mcp",
    }

# Mount the MCP server's SSE ASGI app under /mcp
# This enables agents like Claude Desktop or GitHub Copilot (via MCP adapters)
# to discover and connect to the WheelSense MCP AI tools.
app.mount("/mcp", mcp.sse_app())
