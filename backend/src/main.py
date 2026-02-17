"""
WheelSense v2.0 FastAPI Backend
Main application entry point.
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .core.camera_stream import camera_stream_hub
from .core.config import settings
from .core.database import db
from .core.homeassistant import ha_client
from .core.mqtt import mqtt_collector
from .core.safety_monitor import safety_monitor_task, periodic_health_score_task
from .routes import wheelchairs, devices, map as map_routes, chat
from .routes import patients, appliances, timeline, nodes, routines
from .routes import notifications, alerts, analytics, health_scores, cameras, diagnostics, maintenance
from .routes.chat import initialize_ai
from .routes.maintenance import run_history_retention


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    print("[SYSTEM] Starting WheelSense backend")

    await db.connect()
    await db.init_schema()

    await ha_client.connect()

    await mqtt_collector.connect()
    await mqtt_collector.start_listening()

    initialize_ai()
    from .routes.chat import llm_client as _llm
    ai_status = "not initialized"
    if _llm:
        validation = await _llm.validate_connection()
        ai_status = "connected" if validation.get("valid") else validation.get("message", "not available")
        if validation.get("valid") and settings.LLM_WARMUP_ON_STARTUP:
            warmup = await _llm.warmup()
            if warmup.get("success"):
                print("[AI] Warmup completed")
            else:
                print(f"[AI] Warmup skipped: {warmup.get('error', 'unknown')}")

    stale_task = asyncio.create_task(mark_stale_data_task())
    routine_task = asyncio.create_task(routine_scheduler_task())
    safety_task = asyncio.create_task(safety_monitor_task())
    health_task = asyncio.create_task(periodic_health_score_task())
    retention_task = None
    if settings.HISTORY_RETENTION_AUTO_ENABLED:
        retention_task = asyncio.create_task(history_retention_task())

    print("[SYSTEM] Ready")
    print(f"[SYSTEM] MQTT: {'connected' if mqtt_collector.connected else 'not connected'}")
    print(f"[SYSTEM] Home Assistant: {'connected' if ha_client.connected else 'not connected'}")
    print(f"[SYSTEM] AI: {ai_status}")

    try:
        yield
    finally:
        print("[SYSTEM] Shutting down")
        stale_task.cancel()
        routine_task.cancel()
        safety_task.cancel()
        health_task.cancel()
        if retention_task:
            retention_task.cancel()

        await mqtt_collector.stop_listening()
        await mqtt_collector.disconnect()
        await ha_client.disconnect()
        await db.disconnect()


app = FastAPI(
    title="WheelSense v2.0 API",
    description="Smart Indoor Positioning System for Wheelchair Users using RSSI Fingerprinting",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(wheelchairs.router, prefix="/api/wheelchairs", tags=["Wheelchairs"])
app.include_router(devices.router, prefix="/api/devices", tags=["Devices"])
app.include_router(cameras.router, prefix="/api/cameras", tags=["Cameras"])
app.include_router(nodes.router, prefix="/api/nodes", tags=["Nodes"])
app.include_router(map_routes.router, prefix="/api", tags=["Map"])
app.include_router(chat.router, prefix="/api/chat", tags=["AI Chat"])
app.include_router(patients.router, prefix="/api/patients", tags=["Patients"])
app.include_router(appliances.router, prefix="/api/appliances", tags=["Appliances"])
app.include_router(timeline.router, prefix="/api/timeline", tags=["Timeline"])
app.include_router(routines.router, prefix="/api/routines", tags=["Routines"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(health_scores.router, prefix="/api/health-scores", tags=["Health Scores"])
app.include_router(diagnostics.router, prefix="/api", tags=["Diagnostics"])
app.include_router(maintenance.router, prefix="/api/maintenance", tags=["Maintenance"])


@app.websocket("/api/ws/camera")
async def camera_ingest_socket(websocket: WebSocket):
    """Ingest camera frames/status from Node_Tsimcam firmware."""
    await camera_stream_hub.handle_camera_socket(websocket)


@app.websocket("/api/ws/stream/{room_id}")
async def dashboard_stream_socket(websocket: WebSocket, room_id: str):
    """Dashboard room stream endpoint."""
    await camera_stream_hub.handle_dashboard_socket(websocket, room_id)


async def mark_stale_data_task():
    """Background task to mark stale/offline device data."""
    while True:
        try:
            await asyncio.sleep(10)

            await db.execute(
                """
                UPDATE wheelchairs
                SET stale = 1, status = 'idle'
                WHERE updated_at < NOW() - make_interval(secs => $1)
                  AND stale = 0
                """,
                (settings.STALE_DATA_SECONDS,),
            )

            await db.execute(
                """
                UPDATE wheelchairs
                SET status = 'offline'
                WHERE updated_at < NOW() - make_interval(secs => $1)
                  AND status != 'offline'
                """,
                (settings.WHEELCHAIR_OFFLINE_SECONDS,),
            )

            await db.execute(
                """
                UPDATE nodes
                SET status = 'offline'
                WHERE updated_at < NOW() - make_interval(secs => $1)
                  AND status = 'online'
                """,
                (settings.NODE_TIMEOUT_SECONDS,),
            )

            await db.execute(
                """
                UPDATE camera_nodes
                SET status = 'offline',
                    ws_connected = FALSE,
                    config_mode = FALSE,
                    updated_at = NOW()
                WHERE (last_seen IS NULL OR last_seen < NOW() - make_interval(secs => $1))
                  AND status != 'offline'
                """,
                (settings.CAMERA_OFFLINE_SECONDS,),
            )

        except asyncio.CancelledError:
            break
        except Exception as exc:
            print(f"[WATCHDOG] stale task error: {exc}")


async def history_retention_task():
    """Periodic retention/compaction task for telemetry history."""
    interval_seconds = max(60, settings.HISTORY_RETENTION_AUTO_INTERVAL_MINUTES * 60)
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            result = await run_history_retention(
                retention_days=settings.HISTORY_RETENTION_DAYS,
                dry_run=False,
                aggregate_hourly=True,
                aggregate_daily=True,
            )
            deleted = result.get("raw", {}).get("deleted_rows", 0)
            print(f"[MAINT] auto retention complete: deleted={deleted}")
        except asyncio.CancelledError:
            break
        except Exception as exc:
            print(f"[MAINT] auto retention error: {exc}")


async def routine_scheduler_task():
    """Background task to trigger routines at scheduled times."""
    import json

    bangkok_tz = timezone(timedelta(hours=7))
    triggered_this_minute: set = set()
    last_minute = ""

    while True:
        try:
            await asyncio.sleep(30)

            now = datetime.now(bangkok_tz)
            current_time = now.strftime("%H:%M")
            current_day = now.strftime("%a")

            if current_time != last_minute:
                triggered_this_minute.clear()
                last_minute = current_time

            matching = await db.fetch_all(
                """
                SELECT r.*, rm.name as room_name
                FROM routines r
                LEFT JOIN rooms rm ON r.room_id = rm.id
                WHERE r.time = $1 AND r.enabled = 1
                """,
                (current_time,),
            )

            for routine in matching:
                routine_id = routine["id"]
                if routine_id in triggered_this_minute:
                    continue

                days = routine.get("days", [])
                if isinstance(days, str):
                    try:
                        days = json.loads(days)
                    except (json.JSONDecodeError, TypeError):
                        days = []

                if days and current_day not in days:
                    continue

                actions = routine.get("actions", [])
                if isinstance(actions, str):
                    try:
                        actions = json.loads(actions)
                    except (json.JSONDecodeError, TypeError):
                        actions = []

                for action in actions:
                    device_name = action.get("device", "")
                    state = action.get("state", "").lower()
                    if not device_name or not state:
                        continue

                    appliance = await db.fetch_one(
                        """
                        SELECT a.*, r.name as room_name
                        FROM appliances a
                        LEFT JOIN rooms r ON a.room_id = r.id
                        WHERE LOWER(a.name) LIKE $1 AND a.room_id = $2
                        """,
                        (f"%{device_name.lower()}%", routine.get("room_id")),
                    )

                    if not appliance:
                        appliance = await db.fetch_one(
                            """
                            SELECT a.*, r.name as room_name
                            FROM appliances a
                            LEFT JOIN rooms r ON a.room_id = r.id
                            WHERE LOWER(a.name) LIKE $1
                            """,
                            (f"%{device_name.lower()}%",),
                        )

                    if appliance:
                        new_state = state == "on"
                        ha_entity_id = appliance.get("ha_entity_id")
                        if ha_entity_id and ha_client and ha_client.connected:
                            if new_state:
                                await ha_client.turn_on(ha_entity_id)
                            else:
                                await ha_client.turn_off(ha_entity_id)

                        await db.execute(
                            "UPDATE appliances SET state = $1, updated_at = NOW() WHERE id = $2",
                            (1 if new_state else 0, appliance["id"]),
                        )

                action_text = ", ".join(f"{a.get('device')} {a.get('state')}" for a in actions) if actions else "No device actions"
                await db.execute(
                    """
                    INSERT INTO timeline_events (event_type, to_room_id, description)
                    VALUES ('routine', $1, $2)
                    """,
                    (routine.get("room_id"), f"Routine '{routine['title']}' triggered: {action_text}"),
                )

                await db.execute("UPDATE routines SET last_triggered = NOW() WHERE id = $1", (routine_id,))
                triggered_this_minute.add(routine_id)
                print(f"[ROUTINE] Triggered: {routine['title']} at {current_time}")

        except asyncio.CancelledError:
            break
        except Exception as exc:
            print(f"[ROUTINE] Scheduler error: {exc}")


@app.get("/api/health")
async def health_check():
    """Health check endpoint with runtime diagnostics."""
    wheelchair_count = await db.fetch_one("SELECT COUNT(*) as count FROM wheelchairs")
    online_nodes = await db.fetch_one("SELECT COUNT(*) as count FROM nodes WHERE status = 'online'")
    offline_nodes = await db.fetch_one("SELECT COUNT(*) as count FROM nodes WHERE status = 'offline'")
    offline_wheelchairs = await db.fetch_one("SELECT COUNT(*) as count FROM wheelchairs WHERE status = 'offline'")
    stale_wheelchairs = await db.fetch_one("SELECT COUNT(*) as count FROM wheelchairs WHERE stale = 1")

    camera_total = await db.fetch_one("SELECT COUNT(*) as count FROM camera_nodes")
    camera_online = await db.fetch_one("SELECT COUNT(*) as count FROM camera_nodes WHERE status = 'online'")
    camera_offline = await db.fetch_one("SELECT COUNT(*) as count FROM camera_nodes WHERE status = 'offline'")
    camera_config = await db.fetch_one("SELECT COUNT(*) as count FROM camera_nodes WHERE config_mode = TRUE")

    return {
        "status": "healthy" if mqtt_collector.connected else "degraded",
        "mqtt_connected": mqtt_collector.connected,
        "ha_connected": ha_client.connected,
        "database": "connected",
        "wheelchairs": wheelchair_count["count"] if wheelchair_count else 0,
        "online_nodes": online_nodes["count"] if online_nodes else 0,
        "camera_nodes": {
            "total": camera_total["count"] if camera_total else 0,
            "online": camera_online["count"] if camera_online else 0,
            "offline": camera_offline["count"] if camera_offline else 0,
            "config_mode": camera_config["count"] if camera_config else 0,
        },
        "watchdog": {
            "stale_wheelchairs": stale_wheelchairs["count"] if stale_wheelchairs else 0,
            "offline_wheelchairs": offline_wheelchairs["count"] if offline_wheelchairs else 0,
            "offline_nodes": offline_nodes["count"] if offline_nodes else 0,
            "offline_cameras": camera_offline["count"] if camera_offline else 0,
            "thresholds_seconds": {
                "wheelchair_stale": settings.STALE_DATA_SECONDS,
                "wheelchair_offline": settings.WHEELCHAIR_OFFLINE_SECONDS,
                "node_offline": settings.NODE_TIMEOUT_SECONDS,
                "camera_offline": settings.CAMERA_OFFLINE_SECONDS,
            },
        },
        "mqtt_metrics": mqtt_collector.metrics_snapshot(),
        "ha_diagnostics": ha_client.diagnostics(),
        "history_policy": {
            "sample_interval_seconds": settings.HISTORY_SAMPLE_INTERVAL_SECONDS,
            "retention_days": settings.HISTORY_RETENTION_DAYS,
            "auto_retention_enabled": settings.HISTORY_RETENTION_AUTO_ENABLED,
            "auto_retention_interval_minutes": settings.HISTORY_RETENTION_AUTO_INTERVAL_MINUTES,
        },
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "WheelSense v2.0 API",
        "version": "2.0.0",
        "description": "Smart Indoor Positioning System for Wheelchair Users",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.API_HOST, port=settings.API_PORT)
