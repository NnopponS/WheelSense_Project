"""
WheelSense v2.0 FastAPI Backend
Main application entry point
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio

from .core.config import settings
from .core.database import db
from .core.mqtt import mqtt_collector
from .core.homeassistant import ha_client

# Import routers
from .routes import wheelchairs, devices, map as map_routes, chat
from .routes import patients, appliances, timeline, nodes, routines
from .routes import notifications, alerts, analytics, health_scores
from .routes.chat import initialize_ai, llm_client
from .core.safety_monitor import safety_monitor_task, periodic_health_score_task


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    print("🚀 Starting WheelSense v2.0 Backend...")
    
    # Initialize database
    await db.connect()
    await db.init_schema()
    
    # Connect to Home Assistant
    await ha_client.connect()
    
    # Connect to MQTT and start listening
    await mqtt_collector.connect()
    await mqtt_collector.start_listening()
    
    # Initialize AI (Ollama + MCP)
    initialize_ai()
    from .routes.chat import llm_client as _llm
    if _llm:
        validation = await _llm.validate_connection()
        ai_status = '✅ Connected' if validation.get('valid') else f"⚠️ {validation.get('message', 'Not available')}"
        if validation.get('valid') and settings.LLM_WARMUP_ON_STARTUP:
            warmup = await _llm.warmup()
            if warmup.get('success'):
                print("🔥 AI warmup completed")
            else:
                print(f"⚠️ AI warmup skipped: {warmup.get('error', 'unknown error')}")
    else:
        ai_status = '❌ Not initialized'
    
    # Start background tasks
    stale_task = asyncio.create_task(mark_stale_data_task())
    routine_task = asyncio.create_task(routine_scheduler_task())
    safety_task = asyncio.create_task(safety_monitor_task())
    health_task = asyncio.create_task(periodic_health_score_task())
    
    print("✅ WheelSense v2.0 Backend is ready!")
    print(f"📡 MQTT: {'Connected' if mqtt_collector.connected else 'Not connected'}")
    print(f"🏠 Home Assistant: {'Connected' if ha_client.connected else 'Not connected'}")
    print(f"🤖 AI (Ollama): {ai_status}")
    print(f"🛡️ Safety monitor: Active")
    print(f"📊 Health scoring: Every 1h")
    
    yield
    
    # Shutdown
    print("⏹️ Shutting down WheelSense v2.0 Backend...")
    stale_task.cancel()
    routine_task.cancel()
    safety_task.cancel()
    health_task.cancel()
    await mqtt_collector.stop_listening()
    await mqtt_collector.disconnect()
    await ha_client.disconnect()
    await db.disconnect()


# Create FastAPI app
app = FastAPI(
    title="WheelSense v2.0 API",
    description="Smart Indoor Positioning System for Wheelchair Users using RSSI Fingerprinting",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(wheelchairs.router, prefix="/api/wheelchairs", tags=["Wheelchairs"])
app.include_router(devices.router, prefix="/api/devices", tags=["Devices"])
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


async def mark_stale_data_task():
    """Background task to mark stale wheelchair data"""
    while True:
        try:
            await asyncio.sleep(10)  # Run every 10 seconds
            
            # Mark wheelchairs as stale if not updated in 30 seconds
            await db.execute("""
                UPDATE wheelchairs 
                SET stale = 1, status = 'idle'
                WHERE updated_at < NOW() - INTERVAL '30 seconds'
                AND stale = 0
            """)
            
            # Mark wheelchairs as offline if not updated in 60 seconds
            await db.execute("""
                UPDATE wheelchairs 
                SET status = 'offline'
                WHERE updated_at < NOW() - INTERVAL '60 seconds'
                AND status != 'offline'
            """)
            
            # Mark nodes as offline if not updated in 30 seconds
            await db.execute("""
                UPDATE nodes 
                SET status = 'offline' 
                WHERE updated_at < NOW() - INTERVAL '30 seconds'
                AND status = 'online'
            """)
            
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"❌ Error in stale data task: {e}")


async def routine_scheduler_task():
    """Background task to trigger routines at scheduled times."""
    import json
    from datetime import datetime, timezone, timedelta
    
    bangkok_tz = timezone(timedelta(hours=7))
    triggered_this_minute: set = set()
    last_minute = ""
    
    while True:
        try:
            await asyncio.sleep(30)  # Check every 30 seconds
            
            now = datetime.now(bangkok_tz)
            current_time = now.strftime("%H:%M")
            current_day = now.strftime("%a")  # Mon, Tue, etc.
            
            # Reset triggered set when minute changes
            if current_time != last_minute:
                triggered_this_minute.clear()
                last_minute = current_time
            
            # Find routines matching current time
            matching = await db.fetch_all(
                """SELECT r.*, rm.name as room_name
                   FROM routines r
                   LEFT JOIN rooms rm ON r.room_id = rm.id
                   WHERE r.time = $1 AND r.enabled = 1""",
                (current_time,)
            )
            
            for routine in matching:
                routine_id = routine["id"]
                
                # Skip if already triggered this minute
                if routine_id in triggered_this_minute:
                    continue
                
                # Check if today is in the routine's days
                days = routine.get("days", [])
                if isinstance(days, str):
                    try:
                        days = json.loads(days)
                    except (json.JSONDecodeError, TypeError):
                        days = []
                
                if days and current_day not in days:
                    continue
                
                # Parse and execute actions
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
                    
                    # Find appliance in database
                    appliance = await db.fetch_one(
                        """SELECT a.*, r.name as room_name
                           FROM appliances a
                           LEFT JOIN rooms r ON a.room_id = r.id
                           WHERE LOWER(a.name) LIKE $1 AND a.room_id = $2""",
                        (f"%{device_name.lower()}%", routine.get("room_id"))
                    )
                    
                    if not appliance:
                        # Try broader search
                        appliance = await db.fetch_one(
                            """SELECT a.*, r.name as room_name
                               FROM appliances a
                               LEFT JOIN rooms r ON a.room_id = r.id
                               WHERE LOWER(a.name) LIKE $1""",
                            (f"%{device_name.lower()}%",)
                        )
                    
                    if appliance:
                        new_state = state == "on"
                        ha_entity_id = appliance.get("ha_entity_id")
                        
                        # Control via Home Assistant
                        if ha_entity_id and ha_client and ha_client.connected:
                            if new_state:
                                await ha_client.turn_on(ha_entity_id)
                            else:
                                await ha_client.turn_off(ha_entity_id)
                        
                        # Update local state
                        await db.execute(
                            "UPDATE appliances SET state = $1, updated_at = NOW() WHERE id = $2",
                            (1 if new_state else 0, appliance["id"])
                        )
                
                # Log timeline event
                action_text = ", ".join(
                    f"{a.get('device')} {a.get('state')}"
                    for a in actions
                ) if actions else "No device actions"
                
                await db.execute(
                    """INSERT INTO timeline_events (event_type, to_room_id, description)
                       VALUES ('routine', $1, $2)""",
                    (routine.get("room_id"),
                     f"Routine '{routine['title']}' triggered: {action_text}")
                )
                
                # Mark as triggered
                await db.execute(
                    "UPDATE routines SET last_triggered = NOW() WHERE id = $1",
                    (routine_id,)
                )
                triggered_this_minute.add(routine_id)
                
                print(f"⏰ Routine triggered: {routine['title']} at {current_time}")
        
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"❌ Error in routine scheduler: {e}")


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    wheelchair_count = await db.fetch_one("SELECT COUNT(*) as count FROM wheelchairs")
    online_nodes = await db.fetch_one("SELECT COUNT(*) as count FROM nodes WHERE status = 'online'")
    
    return {
        "status": "healthy" if mqtt_collector.connected else "degraded",
        "mqtt_connected": mqtt_collector.connected,
        "ha_connected": ha_client.connected,
        "database": "connected",
        "wheelchairs": wheelchair_count["count"] if wheelchair_count else 0,
        "online_nodes": online_nodes["count"] if online_nodes else 0,
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "WheelSense v2.0 API",
        "version": "2.0.0",
        "description": "Smart Indoor Positioning System for Wheelchair Users",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.API_HOST, port=settings.API_PORT)
