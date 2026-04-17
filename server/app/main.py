from __future__ import annotations

"""WheelSense Server — FastAPI application entry point."""

import asyncio
import logging
import os
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI

from .config import settings
from .schemas.mcp_auth import ALL_MCP_SCOPES
from app.api.errors import register_error_handlers
from app.core.security import validate_runtime_settings
from .mqtt_handler import mqtt_listener
from app.api.router import api_router as router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("wheelsense")
MCP_ENABLED = os.getenv("WHEELSENSE_ENABLE_MCP", "1") == "1"

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables & launch MQTT listener. Shutdown: cancel tasks."""
    logger.info("Starting %s", settings.app_name)
    validate_runtime_settings()

    async with AsyncExitStack() as stack:
        # Streamable HTTP MCP requires StreamableHTTPSessionManager.run(); mounted
        # Starlette apps do not receive ASGI lifespan from FastAPI.
        if MCP_ENABLED:
            from app.mcp.server import mcp_streamable_http_session_lifespan

            await stack.enter_async_context(mcp_streamable_http_session_lifespan())

        from app.db.session import init_db

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

        async def _portal_push() -> None:
            await asyncio.sleep(3)
            try:
                from app.services.mqtt_publish import (
                    publish_portal_config_all,
                    refresh_all_mobile_devices_mqtt_config,
                )

                await publish_portal_config_all()
                await refresh_all_mobile_devices_mqtt_config()
            except Exception:
                logger.exception("Portal MQTT bootstrap failed")

        asyncio.create_task(_portal_push())

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

register_error_handlers(app)
app.include_router(router)

@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": "3.2.0",
        "docs": "/docs",
        "health": "/api/health",
        "mcp": "/mcp" if MCP_ENABLED else None,
    }


@app.get("/.well-known/oauth-protected-resource/mcp")
async def mcp_oauth_protected_resource():
    return {
        "resource": f"{settings.server_base_url.rstrip('/')}/mcp",
        "authorization_servers": [f"{settings.server_base_url.rstrip('/')}/api/auth/login"],
        "bearer_methods_supported": ["header"],
        "scopes_supported": list(ALL_MCP_SCOPES),
    }

# Mount MCP only when enabled so tests and local tooling can run without MCP side-effects.
if MCP_ENABLED:
    from app.mcp_server import create_remote_mcp_app

    app.mount("/mcp", create_remote_mcp_app())
else:
    logger.info("MCP server mount disabled via WHEELSENSE_ENABLE_MCP=0")
