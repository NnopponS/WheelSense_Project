"""
WheelSense Backend API - Main Application
Smart Home System for Wheelchair Users
"""

import asyncio
import json
import logging
import threading
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import websockets

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

from .config import settings
from .database import Database
from .mqtt_handler import MQTTHandler
from .ai_service import AIService
from .emergency_service import EmergencyService
from .websocket_handler import stream_handler

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
db: Optional[Database] = None
mqtt_handler: Optional[MQTTHandler] = None
ai_service: Optional[AIService] = None
emergency_service: Optional[EmergencyService] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""
    global db, mqtt_handler, ai_service, emergency_service
    
    logger.info("🚀 Starting WheelSense Backend...")
    
    # Initialize database
    db = Database(settings.MONGO_URI)
    await db.connect()
    logger.info("✅ Database connected")
    
    # Initialize MQTT handler
    mqtt_handler = MQTTHandler(
        broker=settings.MQTT_BROKER,
        port=settings.MQTT_PORT
    )
    await mqtt_handler.connect()
    logger.info("✅ MQTT connected")
    
    # Initialize AI service
    ai_service = AIService(settings.GEMINI_API_KEY)
    logger.info("✅ AI service initialized")
    
    # Initialize emergency service
    emergency_service = EmergencyService(db, mqtt_handler)
    logger.info("✅ Emergency service initialized")
    
    # Start WebSocket server for camera connections
    camera_ws_port = 8765
    async def camera_ws_server():
        async def handler(websocket, path=None):
            await stream_handler.handle_camera_connection(websocket, path or "/")
        async with websockets.serve(
            handler,
            "0.0.0.0",
            camera_ws_port
        ):
            logger.info(f"✅ WebSocket server started on port {camera_ws_port} for cameras")
            await asyncio.Future()  # Run forever
    
    # Start camera WebSocket server in background
    camera_ws_task = asyncio.create_task(camera_ws_server())
    
    yield
    
    # Cleanup
    logger.info("🛑 Shutting down...")
    camera_ws_task.cancel()
    if mqtt_handler:
        await mqtt_handler.disconnect()
    if db:
        await db.disconnect()


app = FastAPI(
    title="WheelSense Backend API",
    description="Smart Home System for Wheelchair Users",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Models ====================

class ApplianceControl(BaseModel):
    room: str
    appliance: str
    state: bool
    value: Optional[int] = None


class EmergencyAlert(BaseModel):
    room: str
    event_type: str
    severity: str
    message: Optional[str] = None


class BehaviorAnalysisRequest(BaseModel):
    user_id: str
    date: Optional[str] = None


# ==================== Health Check ====================

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "database": db.is_connected if db else False,
            "mqtt": mqtt_handler.is_connected if mqtt_handler else False,
            "ai": ai_service is not None
        }
    }


# ==================== Room APIs ====================

@app.get("/rooms")
async def get_rooms():
    """Get all rooms with their current status."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    rooms = await db.get_all_rooms()
    return {"rooms": rooms}


@app.get("/rooms/{room_id}")
async def get_room(room_id: str):
    """Get specific room details."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    room = await db.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


@app.get("/rooms/{room_id}/status")
async def get_room_status(room_id: str):
    """Get real-time status of a room."""
    if not mqtt_handler:
        raise HTTPException(status_code=503, detail="MQTT not available")
    
    status = mqtt_handler.get_room_status(room_id)
    return status


# ==================== Appliance Control ====================

@app.post("/appliances/control")
async def control_appliance(control: ApplianceControl):
    """Control an appliance in a room."""
    if not mqtt_handler:
        raise HTTPException(status_code=503, detail="MQTT not available")
    
    success = await mqtt_handler.send_control_command(
        room=control.room,
        appliance=control.appliance,
        state=control.state,
        value=control.value
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send command")
    
    # Log activity
    if db:
        await db.log_activity(
            room_id=control.room,
            event_type="appliance_on" if control.state else "appliance_off",
            details={
                "appliance": control.appliance,
                "state": control.state,
                "value": control.value
            }
        )
    
    return {
        "success": True,
        "room": control.room,
        "appliance": control.appliance,
        "state": control.state
    }


@app.get("/appliances/{room_id}")
async def get_room_appliances(room_id: str):
    """Get all appliances in a room."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    appliances = await db.get_room_appliances(room_id)
    return {"appliances": appliances}


# ==================== User Location ====================

@app.get("/location/current")
async def get_current_location():
    """Get current user location based on camera detection."""
    if not mqtt_handler:
        raise HTTPException(status_code=503, detail="MQTT not available")
    
    location = mqtt_handler.get_user_location()
    return location


@app.get("/location/history")
async def get_location_history(limit: int = 100):
    """Get user location history."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    history = await db.get_activity_logs(
        event_types=["enter", "exit"],
        limit=limit
    )
    return {"history": history}


# ==================== Video Streaming (WebSocket) ====================

@app.get("/stream-url/{room_id}")
async def get_stream_url(room_id: str):
    """Get WebSocket stream URL for a room."""
    available = stream_handler.is_room_available(room_id)
    cameras = stream_handler.get_connected_cameras()
    
    return {
        "room_id": room_id,
        "ws_url": f"ws://localhost:8000/ws/stream/{room_id}",
        "available": available,
        "connected_cameras": cameras
    }

@app.get("/api/video/{room_id}")
async def get_video_frame(room_id: str):
    """Get latest video frame as JPEG (polling endpoint for fallback)."""
    if room_id not in stream_handler.latest_frames:
        # Return 1x1 transparent PNG as placeholder
        from fastapi.responses import Response
        placeholder = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xdb\x00\x00\x00\x00IEND\xaeB`\x82'
        return Response(content=placeholder, media_type="image/png")
    
    frame = stream_handler.latest_frames[room_id]
    return Response(content=frame, media_type="image/jpeg")

@app.websocket("/ws/stream/{room_id}")
async def stream_video_websocket(websocket: WebSocket, room_id: str):
    """WebSocket endpoint for dashboard clients to receive video stream."""
    await websocket.accept()
    
    # Add client to stream handler
    stream_handler.add_dashboard_client(room_id, websocket)
    
    try:
        # Keep connection alive and handle any incoming messages
        while True:
            try:
                # Wait for messages (or timeout to keep connection alive)
                message = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                # Handle any control messages if needed
                logger.debug(f"Message from dashboard client for {room_id}: {message}")
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                await websocket.send_text(json.dumps({"type": "ping"}))
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        pass
    finally:
        # Remove client
        stream_handler.remove_dashboard_client(room_id, websocket)


# ==================== WebSocket for Real-time Updates ====================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time updates (status, events, etc.)."""
    await websocket.accept()
    
    if mqtt_handler:
        mqtt_handler.add_websocket(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming WebSocket messages if needed
            message = json.loads(data)
            
            if message.get("type") == "control":
                # Handle control commands via WebSocket
                await mqtt_handler.send_control_command(
                    room=message["room"],
                    appliance=message["appliance"],
                    state=message["state"]
                )
    except WebSocketDisconnect:
        if mqtt_handler:
            mqtt_handler.remove_websocket(websocket)


# ==================== Emergency APIs ====================

@app.post("/emergency/alert")
async def create_emergency(alert: EmergencyAlert):
    """Create an emergency alert."""
    if not emergency_service:
        raise HTTPException(status_code=503, detail="Emergency service not available")
    
    event = await emergency_service.create_alert(
        room=alert.room,
        event_type=alert.event_type,
        severity=alert.severity,
        message=alert.message
    )
    
    return {"event_id": str(event["_id"]), "status": "created"}


@app.get("/emergency/active")
async def get_active_emergencies():
    """Get all active emergency events."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    events = await db.get_active_emergencies()
    return {"emergencies": events}


@app.post("/emergency/{event_id}/resolve")
async def resolve_emergency(event_id: str):
    """Resolve an emergency event."""
    if not emergency_service:
        raise HTTPException(status_code=503, detail="Emergency service not available")
    
    success = await emergency_service.resolve_alert(event_id)
    if not success:
        raise HTTPException(status_code=404, detail="Emergency not found")
    
    return {"status": "resolved"}


# ==================== AI/Behavior Analysis ====================

@app.post("/ai/analyze-behavior")
async def analyze_behavior(request: BehaviorAnalysisRequest):
    """Analyze user behavior using AI."""
    if not ai_service or not db:
        raise HTTPException(status_code=503, detail="AI service not available")
    
    # Get activity logs for analysis
    activities = await db.get_user_activities(
        user_id=request.user_id,
        date=request.date
    )
    
    # Run AI analysis
    analysis = await ai_service.analyze_behavior(activities)
    
    # Save analysis result
    await db.save_behavior_analysis(
        user_id=request.user_id,
        date=request.date or datetime.now().date().isoformat(),
        patterns=analysis["patterns"],
        anomalies=analysis["anomalies"],
        gemini_analysis=analysis["gemini_response"]
    )
    
    return analysis


@app.get("/ai/recommendations/{user_id}")
async def get_ai_recommendations(user_id: str):
    """Get AI-powered recommendations for the user."""
    if not ai_service or not db:
        raise HTTPException(status_code=503, detail="AI service not available")
    
    # Get recent behavior analysis
    analysis = await db.get_latest_behavior_analysis(user_id)
    
    if not analysis:
        return {"recommendations": []}
    
    recommendations = await ai_service.generate_recommendations(analysis)
    return {"recommendations": recommendations}


# ==================== Activity Logs ====================

@app.get("/activities")
async def get_activities(
    room_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 50
):
    """Get activity logs."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    activities = await db.get_activity_logs(
        room_id=room_id,
        event_types=[event_type] if event_type else None,
        limit=limit
    )
    return {"activities": activities}


# ==================== User Management ====================

@app.get("/users/{user_id}")
async def get_user(user_id: str):
    """Get user profile."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    user = await db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.put("/users/{user_id}/preferences")
async def update_user_preferences(user_id: str, preferences: dict):
    """Update user preferences."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    success = await db.update_user_preferences(user_id, preferences)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"status": "updated"}


# ==================== Building/Floor/Room Management ====================

@app.get("/map/buildings")
async def get_buildings():
    """Get all buildings."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    buildings = await db.db.buildings.find().to_list(length=100)
    return {"buildings": [Database._serialize_doc(b) for b in buildings]}


@app.post("/map/buildings")
async def create_building(building: dict):
    """Create a new building."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.buildings.insert_one(building)
    building["_id"] = result.inserted_id
    return Database._serialize_doc(building)


@app.get("/map/floors")
async def get_floors(building_id: Optional[str] = None):
    """Get all floors, optionally filtered by building."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    query = {"buildingId": building_id} if building_id else {}
    floors = await db.db.floors.find(query).to_list(length=100)
    return {"floors": [Database._serialize_doc(f) for f in floors]}


@app.post("/map/floors")
async def create_floor(floor: dict):
    """Create a new floor."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.floors.insert_one(floor)
    floor["_id"] = result.inserted_id
    return Database._serialize_doc(floor)


@app.get("/map/rooms")
async def get_rooms(floor_id: Optional[str] = None):
    """Get all rooms, optionally filtered by floor."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    query = {"floorId": floor_id} if floor_id else {}
    rooms = await db.db.rooms.find(query).to_list(length=100)
    return {"rooms": [Database._serialize_doc(r) for r in rooms]}


@app.post("/map/rooms")
async def create_room(room: dict):
    """Create a new room."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.rooms.insert_one(room)
    room["_id"] = result.inserted_id
    return Database._serialize_doc(room)


@app.put("/map/rooms/{room_id}")
async def update_room(room_id: str, updates: dict):
    """Update a room."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.rooms.update_one(
        {"id": room_id},
        {"$set": {**updates, "updatedAt": datetime.now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"status": "updated"}


@app.put("/map/rooms")
async def update_all_rooms(rooms_data: dict):
    """Update all rooms at once."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    rooms = rooms_data.get("rooms", [])
    updated_count = 0
    
    for room in rooms:
        try:
            # Ensure required fields for MongoDB validation
            room_update = {
                **room,
                "updatedAt": datetime.now()
            }
            
            # Add default values if missing (for MongoDB validation)
            if "roomType" not in room_update:
                # Generate roomType from nameEn or name
                name_en = room.get("nameEn", room.get("name", "Room"))
                room_update["roomType"] = name_en.lower().replace(" ", "_").replace("-", "_")
            
            if "deviceId" not in room_update:
                # Try to find device for this room
                device = await db.db.devices.find_one({"room": room.get("id")})
                if device:
                    room_update["deviceId"] = device.get("id", f"DEV_{room.get('id', 'UNKNOWN')}")
                else:
                    # Create a default device ID
                    room_update["deviceId"] = f"DEV_{room.get('id', 'UNKNOWN')}"
            
            # Ensure name exists (required field)
            if "name" not in room_update:
                room_update["name"] = room.get("nameEn", "Room")
            
            # Use bypassDocumentValidation to skip schema validation if needed
            result = await db.db.rooms.update_one(
                {"id": room.get("id")},
                {"$set": room_update},
                upsert=True,
                bypass_document_validation=False
            )
            
            if result.modified_count > 0 or result.upserted_id:
                updated_count += 1
                
        except Exception as e:
            logger.error(f"Failed to update room {room.get('id')}: {e}", exc_info=True)
            # Try with bypass validation as fallback
            try:
                room_update = {
                    **room,
                    "updatedAt": datetime.now()
                }
                # Remove validation-required fields and try again
                room_update.pop("deviceId", None)
                room_update.pop("roomType", None)
                
                result = await db.db.rooms.update_one(
                    {"id": room.get("id")},
                    {"$set": room_update},
                    upsert=True
                )
                if result.modified_count > 0 or result.upserted_id:
                    updated_count += 1
            except Exception as e2:
                logger.error(f"Failed to update room {room.get('id')} even with bypass: {e2}")
    
    return {"status": "updated", "count": updated_count}


@app.delete("/map/buildings/{building_id}")
async def delete_building(building_id: str):
    """Delete a building."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.buildings.delete_one({"id": building_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Building not found")
    return {"status": "deleted"}


@app.delete("/map/floors/{floor_id}")
async def delete_floor(floor_id: str):
    """Delete a floor."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.floors.delete_one({"id": floor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Floor not found")
    return {"status": "deleted"}


@app.delete("/map/rooms/{room_id}")
async def delete_room(room_id: str):
    """Delete a room."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.rooms.delete_one({"id": room_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"status": "deleted"}


@app.put("/map/wheelchair-positions")
async def update_wheelchair_positions(positions: dict):
    """Update wheelchair positions on map."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    await db.save_wheelchair_positions(positions)
    return {"status": "updated"}


@app.get("/map/wheelchair-positions")
async def get_wheelchair_positions():
    """Get wheelchair positions on map."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    positions = await db.get_wheelchair_positions()
    return {"positions": positions}


@app.put("/map/config")
async def save_map_config(config: dict):
    """Save complete map configuration."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    await db.save_map_config(config)
    return {"status": "saved"}


@app.get("/map/config")
async def get_map_config():
    """Get complete map configuration."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    config = await db.get_map_config()
    return config or {}


@app.get("/map/devices")
async def get_devices():
    """Get all devices."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    devices = await db.db.devices.find().to_list(length=1000)
    return {"devices": [Database._serialize_doc(d) for d in devices]}


@app.post("/map/devices")
async def create_device(device: dict):
    """Create a new device."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.devices.insert_one(device)
    device["_id"] = result.inserted_id
    return Database._serialize_doc(device)


@app.put("/map/devices/{device_id}")
async def update_device(device_id: str, updates: dict):
    """Update a device."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.devices.update_one(
        {"id": device_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"status": "updated"}


@app.get("/map/corridors")
async def get_corridors(floor_id: Optional[str] = None):
    """Get all corridors, optionally filtered by floor."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    query = {"floorId": floor_id} if floor_id else {}
    corridors = await db.db.corridors.find(query).to_list(length=100)
    return {"corridors": [Database._serialize_doc(c) for c in corridors]}


@app.post("/map/corridors")
async def create_corridor(corridor: dict):
    """Create a new corridor."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.corridors.insert_one(corridor)
    corridor["_id"] = result.inserted_id
    return Database._serialize_doc(corridor)


@app.put("/map/corridors/{corridor_id}")
async def update_corridor(corridor_id: str, updates: dict):
    """Update a corridor."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.corridors.update_one(
        {"id": corridor_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Corridor not found")
    return {"status": "updated"}


@app.delete("/map/corridors/{corridor_id}")
async def delete_corridor(corridor_id: str):
    """Delete a corridor."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.corridors.delete_one({"id": corridor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Corridor not found")
    return {"status": "deleted"}


@app.get("/map/mesh-routes")
async def get_mesh_routes():
    """Get all mesh routes."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    routes = await db.db.meshRoutes.find().to_list(length=100)
    return {"routes": [Database._serialize_doc(r) for r in routes]}


@app.post("/map/mesh-routes")
async def create_mesh_route(route: dict):
    """Create a new mesh route."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.meshRoutes.insert_one(route)
    route["_id"] = result.inserted_id
    return Database._serialize_doc(route)


@app.put("/map/mesh-routes/{node_id}")
async def update_mesh_route(node_id: str, updates: dict):
    """Update a mesh route."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.meshRoutes.update_one(
        {"nodeId": node_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Mesh route not found")
    return {"status": "updated"}


# ==================== Patient Management ====================

@app.get("/patients")
async def get_patients():
    """Get all patients."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    patients = await db.db.patients.find().to_list(length=1000)
    return {"patients": [Database._serialize_doc(p) for p in patients]}


@app.post("/patients")
async def create_patient(patient: dict):
    """Create a new patient."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.patients.insert_one(patient)
    patient["_id"] = result.inserted_id
    return Database._serialize_doc(patient)


@app.put("/patients/{patient_id}")
async def update_patient(patient_id: str, updates: dict):
    """Update a patient."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.patients.update_one(
        {"id": patient_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"status": "updated"}


@app.delete("/patients/{patient_id}")
async def delete_patient(patient_id: str):
    """Delete a patient."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.patients.delete_one({"id": patient_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"status": "deleted"}


# ==================== Routines Management ====================

@app.get("/routines")
async def get_routines(patient_id: Optional[str] = None):
    """Get all routines, optionally filtered by patient."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    query = {"patientId": patient_id} if patient_id else {}
    routines = await db.db.routines.find(query).to_list(length=1000)
    return {"routines": [Database._serialize_doc(r) for r in routines]}


@app.post("/routines")
async def create_routine(routine: dict):
    """Create a new routine."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    routine["id"] = f"R{datetime.now().timestamp()}"
    routine["completed"] = routine.get("completed", False)
    routine["createdAt"] = datetime.now()
    
    result = await db.db.routines.insert_one(routine)
    routine["_id"] = result.inserted_id
    
    # Log activity
    await db.log_activity(
        room_id=None,
        event_type="routine_created",
        details={"routineId": routine["id"], "title": routine.get("title")}
    )
    
    return Database._serialize_doc(routine)


@app.put("/routines/{routine_id}")
async def update_routine(routine_id: str, updates: dict):
    """Update a routine."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.routines.update_one(
        {"id": routine_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Routine not found")
    
    # Log activity if completed status changed
    if "completed" in updates:
        await db.log_activity(
            room_id=None,
            event_type="routine_completed" if updates["completed"] else "routine_uncompleted",
            details={"routineId": routine_id}
        )
    
    return {"status": "updated"}


@app.delete("/routines/{routine_id}")
async def delete_routine(routine_id: str):
    """Delete a routine."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.routines.delete_one({"id": routine_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Routine not found")
    return {"status": "deleted"}


# ==================== Wheelchairs Management ====================

@app.get("/wheelchairs")
async def get_wheelchairs():
    """Get all wheelchairs."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    wheelchairs = await db.db.wheelchairs.find().to_list(length=1000)
    return {"wheelchairs": [Database._serialize_doc(w) for w in wheelchairs]}


@app.post("/wheelchairs")
async def create_wheelchair(wheelchair: dict):
    """Create a new wheelchair."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.wheelchairs.insert_one(wheelchair)
    wheelchair["_id"] = result.inserted_id
    return Database._serialize_doc(wheelchair)


@app.put("/wheelchairs/{wheelchair_id}")
async def update_wheelchair(wheelchair_id: str, updates: dict):
    """Update a wheelchair."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.wheelchairs.update_one(
        {"id": wheelchair_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Wheelchair not found")
    return {"status": "updated"}


# ==================== Appliances Management ====================

@app.get("/appliances")
async def get_all_appliances():
    """Get all appliances."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    appliances = await db.db.appliances.find().to_list(length=1000)
    return {"appliances": [Database._serialize_doc(a) for a in appliances]}


@app.put("/appliances/{appliance_id}")
async def update_appliance(appliance_id: str, updates: dict):
    """Update an appliance state."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    result = await db.db.appliances.update_one(
        {"id": appliance_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appliance not found")
    
    # Log activity
    if "state" in updates:
        appliance = await db.db.appliances.find_one({"id": appliance_id})
        if appliance:
            await db.log_activity(
                room_id=appliance.get("room"),
                event_type="appliance_on" if updates["state"] else "appliance_off",
                details={"applianceId": appliance_id, "name": appliance.get("name")}
            )
    
    return {"status": "updated"}


# ==================== Doctor Notes ====================

@app.get("/doctor-notes/{patient_id}")
async def get_doctor_notes(patient_id: str):
    """Get doctor notes for a patient."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    notes = await db.db.doctorNotes.find({"patientId": patient_id}).to_list(length=100)
    return {"notes": [Database._serialize_doc(n) for n in notes]}


@app.post("/doctor-notes")
async def create_doctor_note(note: dict):
    """Create a new doctor note."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    note["id"] = f"DN{datetime.now().timestamp()}"
    note["createdAt"] = datetime.now()
    
    result = await db.db.doctorNotes.insert_one(note)
    note["_id"] = result.inserted_id
    return Database._serialize_doc(note)


# ==================== Behavior Analysis ====================

@app.get("/behavior/{patient_id}")
async def get_behavior_analysis(patient_id: str):
    """Get behavior analysis for a patient."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    analysis = await db.db.behaviorAnalysis.find(
        {"patientId": patient_id}
    ).sort("createdAt", -1).to_list(length=10)
    
    return {"analysis": [Database._serialize_doc(a) for a in analysis]}


# ==================== Main Entry Point ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)