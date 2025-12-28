"""
WheelSense MCP Server - Unified Main Application
Combines MCP Protocol and Backend REST API
Smart Home System for Wheelchair Users
"""

import asyncio
import json
import logging
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import websockets

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
import httpx

from .config import settings
from .database import Database
from .mqtt_handler import MQTTHandler
from .ai_service import AIService
from .emergency_service import EmergencyService
from .websocket_handler import stream_handler
from .tools import ToolRegistry
from .mqtt_client import MQTTClient

# Import LLM client from llm service (shared module)
import sys
import os
from typing import Any, Dict, List
llm_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'llm')
if os.path.exists(llm_path):
    sys.path.insert(0, os.path.dirname(llm_path))
    from llm.llm_client import OllamaClient
else:
    # Fallback to local import if llm folder not found
    try:
        from .llm_client import OllamaClient
    except ImportError:
        OllamaClient = None

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
db: Optional[Database] = None
mqtt_handler: Optional[MQTTHandler] = None
ai_service: Optional[AIService] = None
emergency_service: Optional[EmergencyService] = None
# MCP Protocol instances
llm_client: Optional[OllamaClient] = None
tool_registry: Optional[ToolRegistry] = None
mcp_mqtt_client: Optional[MQTTClient] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""
    global db, mqtt_handler, ai_service, emergency_service
    global llm_client, tool_registry, mcp_mqtt_client
    
    logger.info("🚀 Starting WheelSense Backend...")
    
    # Initialize database
    db = Database(settings.MONGO_URI)
    await db.connect()
    logger.info("✅ Database connected")
    
    # Set database reference in stream_handler
    from .websocket_handler import stream_handler
    stream_handler.db = db
    
    # Fix AV to AC in database (if any exists)
    try:
        result = await db.db.appliances.update_many(
            {"type": {"$in": ["AV", "av"]}},
            {"$set": {"type": "AC"}}
        )
        if result.modified_count > 0:
            logger.info(f"✅ Fixed {result.modified_count} appliances from AV to AC")
    except Exception as e:
        logger.warning(f"Failed to fix AV to AC: {e}")
    
    # Initialize MQTT handler
    mqtt_handler = MQTTHandler(
        broker=settings.MQTT_BROKER,
        port=settings.MQTT_PORT
    )
    
    # Set callback for wheelchair detection to update database
    async def on_wheelchair_detection(room: str, detection: dict):
        """Callback when wheelchair is detected - update position in database and save timeline."""
        if not detection.get("detected", False):
            return
        
        try:
            # Find first wheelchair in the system (we only have one)
            # Don't filter by room - the wheelchair moves between rooms
            wheelchairs = await db.db.wheelchairs.find({}).to_list(length=1)
            if not wheelchairs:
                logger.warning(f"No wheelchair found in database")
                return
            
            # Get the wheelchair
            wheelchair = wheelchairs[0]
            wheelchair_id = wheelchair.get("id", str(wheelchair.get("_id")))
            previous_room = wheelchair.get("currentRoom")  # Track previous room for timeline
            
            logger.info(f"🦽 Processing detection for wheelchair {wheelchair_id} in room: {room} (was: {previous_room})")
            
            # Get current positions
            map_config = await db.get_map_config()
            positions = map_config.get("wheelchairPositions", {}) if map_config else {}
            
            # Get room data to calculate position
            room_data = await db.get_room(room)
            if not room_data:
                logger.warning(f"Room not found: {room}")
                return
            
            # Calculate new position based on bbox or use room center
            bbox = detection.get("bbox")
            frame_size = detection.get("frame_size", {})
            
            room_x = room_data.get("x", 50)
            room_y = room_data.get("y", 50)
            room_width = room_data.get("width", 20)
            room_height = room_data.get("height", 20)
            
            if bbox and len(bbox) == 4 and frame_size:
                # bbox is (x, y, w, h) in pixels
                x, y, w, h = bbox
                frame_width = frame_size.get("width", 640)
                frame_height = frame_size.get("height", 480)
                
                # Calculate center of bbox in pixel coordinates
                bbox_center_x = x + w / 2
                bbox_center_y = y + h / 2
                
                # Convert to percentage of video frame (0-100%)
                video_x_percent = (bbox_center_x / frame_width) * 100
                video_y_percent = (bbox_center_y / frame_height) * 100
                
                # Map video coordinates to room position on map
                new_x = room_x + (video_x_percent / 100) * room_width
                new_y = room_y + (video_y_percent / 100) * room_height
                
                # Clamp to room bounds
                new_x = max(room_x, min(room_x + room_width, new_x))
                new_y = max(room_y, min(room_y + room_height, new_y))
                
                positions[str(wheelchair_id)] = {"x": new_x, "y": new_y}
                await db.save_wheelchair_positions(positions)
                logger.info(f"📍 Updated wheelchair {wheelchair_id} to {room}: ({new_x:.1f}%, {new_y:.1f}%) [from bbox]")
            else:
                # No bbox - use center of room
                new_x = room_x + room_width / 2
                new_y = room_y + room_height / 2
                
                positions[str(wheelchair_id)] = {"x": new_x, "y": new_y}
                await db.save_wheelchair_positions(positions)
                logger.info(f"📍 Updated wheelchair {wheelchair_id} to {room}: ({new_x:.1f}%, {new_y:.1f}%) [center of room]")
            
            # Update the wheelchair document with current room and status
            # Set status to "online" when wheelchair is detected in a room
            # Use room_data.id (room ID from database) instead of room type string
            room_id = room_data.get("id") or room_data.get("_id") or room
            await db.db.wheelchairs.update_one(
                {"_id": wheelchair["_id"]},
                {"$set": {
                    "currentRoom": room,  # Keep room type for backward compatibility
                    "room": room_id,  # Use room ID from database for frontend matching
                    "status": "online",  # Set status to online when detected
                    "lastUpdated": datetime.now()
                }}
            )
            
            # Broadcast wheelchair update to all connected clients so frontend can refresh
            if mqtt_handler:
                # Get updated wheelchair data
                updated_wheelchair = await db.db.wheelchairs.find_one({"_id": wheelchair["_id"]})
                if updated_wheelchair:
                    wheelchair_dict = Database._serialize_doc(updated_wheelchair)
                    # Include position in the update message
                    current_position = positions.get(str(wheelchair_id), {})
                    await mqtt_handler._broadcast_ws({
                        "type": "wheelchair_updated",
                        "wheelchair": wheelchair_dict,
                        "position": current_position,  # Include position so frontend can update marker
                        "room_id": room_id  # Include room_id for reference
                    })
                    logger.info(f"📡 Broadcasted wheelchair update: {wheelchair_id} -> room: {room_id}, position: {current_position}")
            
            # ===== TIMELINE: Save location change event if room changed =====
            if previous_room != room:
                # Get user/patient info linked to this wheelchair
                patient = await db.db.patients.find_one({"wheelchairId": wheelchair_id})
                user_id = patient.get("id", "P001") if patient else "P001"
                user_name = patient.get("name", "User") if patient else "User"
                
                # Save timeline event
                confidence = detection.get("confidence", 0.0)
                timeline_event = await db.save_location_event(
                    user_id=user_id,
                    wheelchair_id=wheelchair_id,
                    from_room=previous_room,
                    to_room=room,
                    user_name=user_name,
                    detection_confidence=confidence,
                    bbox=bbox
                )
                
                logger.info(f"📋 Timeline: {user_name} moved from {previous_room} to {room}")
                
                # Broadcast timeline event to all connected clients
                if mqtt_handler:
                    await mqtt_handler._broadcast_ws({
                        "type": "timeline_event",
                        "event": timeline_event
                    })
            
        except Exception as e:
            logger.error(f"Error updating wheelchair position: {e}", exc_info=True)
    
    mqtt_handler.on_detection_callback = on_wheelchair_detection
    await mqtt_handler.connect()
    logger.info("✅ MQTT connected (for registration only)")
    
    # Set detection callback and mqtt_handler reference in websocket handler
    stream_handler.on_detection_callback = on_wheelchair_detection
    stream_handler.mqtt_handler = mqtt_handler
    stream_handler.db = db
    logger.info("✅ WebSocket handler configured for detection")
    
    # Initialize AI service
    ai_service = AIService(settings.GEMINI_API_KEY)
    logger.info("✅ AI service initialized")
    
    # Initialize emergency service
    emergency_service = EmergencyService(db, mqtt_handler)
    logger.info("✅ Emergency service initialized")
    
    # Initialize MCP Protocol components
    if OllamaClient:
        try:
            # Initialize MCP MQTT client (separate from backend MQTT handler)
            mcp_mqtt_client = MQTTClient(
                broker=settings.MQTT_BROKER,
                port=settings.MQTT_PORT
            )
            await mcp_mqtt_client.connect()
            logger.info("✅ MCP MQTT connected")
            
            # Initialize LLM client
            llm_client = OllamaClient(
                host=settings.OLLAMA_HOST,
                model=settings.OLLAMA_MODEL
            )
            logger.info("✅ LLM client initialized")
            
            # Initialize tool registry
            tool_registry = ToolRegistry(mcp_mqtt_client, db)
            logger.info("✅ Tool registry initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize MCP components: {e}")
            logger.warning("MCP Protocol endpoints will not be available")
    else:
        logger.warning("OllamaClient not available, MCP Protocol endpoints disabled")
    
    # Start WebSocket server for camera connections
    camera_ws_port = 8765
    async def camera_ws_server():
        async def handler(websocket, path=None):
            await stream_handler.handle_camera_connection(websocket, path or "/")
        async with websockets.serve(
            handler,
            "0.0.0.0",
            camera_ws_port,
            ping_interval=None,  # Disable server-side pings; let ESP32 client handle keepalive
            max_size=None,       # Allow large frames
            max_queue=16         # Limit queue to prevent memory growth
        ):
            logger.info(f"✅ WebSocket server started on port {camera_ws_port} for cameras")
            await asyncio.Future()  # Run forever
    
    # Start camera WebSocket server in background
    camera_ws_task = asyncio.create_task(camera_ws_server())
    
    # ===== UDP Discovery Server for ESP32 Auto-Discovery =====
    import socket
    import os
    
    def get_host_ip():
        """Get the host's IP address dynamically. Auto-detects network IP.
        
        Priority:
        1. HOST_IP env var (if set and valid) - for manual override
        2. Try to get host gateway IP from Docker (host.docker.internal)
        3. Auto-detect from network interface
        4. Fallback to 127.0.0.1
        """
        # Priority 1: Environment variable (for manual override)
        env_ip = os.getenv("HOST_IP")
        if env_ip and env_ip != "127.0.0.1":
            logger.info(f"Using HOST_IP from environment: {env_ip}")
            return env_ip
        
        # Priority 2: Try to resolve host gateway (Docker host IP)
        try:
            import subprocess
            # Get default gateway IP (which is the host machine in Docker bridge network)
            result = subprocess.run(
                ["ip", "route", "show", "default"],
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0:
                # Parse "default via 172.28.0.1 dev eth0"
                parts = result.stdout.split()
                if len(parts) >= 3 and parts[0] == "default" and parts[1] == "via":
                    gateway_ip = parts[2]
                    logger.info(f"Detected Docker host gateway: {gateway_ip}")
                    return gateway_ip
        except Exception as e:
            logger.debug(f"Failed to get Docker gateway: {e}")
        
        # Priority 3: Auto-detection (may return Docker bridge IP)
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            detected_ip = s.getsockname()[0]
            s.close()
            
            # Filter out Docker bridge IPs (172.x.x.x)
            if detected_ip and not detected_ip.startswith("172.") and detected_ip != "127.0.0.1":
                logger.info(f"Auto-detected host IP: {detected_ip}")
                return detected_ip
            else:
                logger.debug(f"Auto-detected IP is Docker internal ({detected_ip}), trying alternatives...")
        except Exception as e:
            logger.debug(f"Auto-detection failed: {e}")
            
        # Last resort fallback
        logger.warning("Could not detect host IP, using 127.0.0.1")
        return "127.0.0.1"
    
    async def udp_discovery_server():
        """UDP Server that responds to WheelSense discovery broadcasts.
        
        Dynamically detects and updates host IP periodically to handle IP changes.
        """
        discovery_port = 5555
        
        # Create UDP socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", discovery_port))
        sock.setblocking(False)
        
        # Get initial IP
        host_ip = get_host_ip()
        last_ip_check = time.time()
        ip_check_interval = 30  # Check IP every 30 seconds
        
        logger.info(f"✅ UDP Discovery server started on port {discovery_port} (Announcing IP: {host_ip})")
        
        loop = asyncio.get_event_loop()
        
        while True:
            try:
                # Periodically refresh IP address (in case it changes)
                current_time = time.time()
                if current_time - last_ip_check > ip_check_interval:
                    new_ip = get_host_ip()
                    if new_ip != host_ip:
                        logger.info(f"🔄 Host IP changed: {host_ip} -> {new_ip}")
                        host_ip = new_ip
                    last_ip_check = current_time
                
                # Non-blocking receive
                data, addr = await loop.run_in_executor(None, lambda: sock.recvfrom(1024))
                message = data.decode().strip()
                
                if message == "WHEELSENSE_DISCOVER":
                    # Refresh IP before responding (to ensure latest IP)
                    current_ip = get_host_ip()
                    if current_ip != host_ip:
                        logger.debug(f"IP updated during discovery: {host_ip} -> {current_ip}")
                        host_ip = current_ip
                    
                    # Send response with server info
                    response = json.dumps({
                        "type": "WHEELSENSE_SERVER",
                        "ip": host_ip,
                        "websocket_port": camera_ws_port,
                        "mqtt_port": 1883,
                        "http_port": 8000
                    })
                    sock.sendto(response.encode(), addr)
                    logger.debug(f"📡 Discovery: Sent server info ({host_ip}) to {addr[0]}")
                    
            except BlockingIOError:
                await asyncio.sleep(0.1)
            except Exception as e:
                logger.error(f"UDP Discovery error: {e}")
                await asyncio.sleep(1)
    
    # Start UDP discovery server
    discovery_task = asyncio.create_task(udp_discovery_server())
    
    # Start periodic connection cleanup task (every 60 seconds)
    async def periodic_cleanup():
        while True:
            try:
                await asyncio.sleep(60)  # Run every 60 seconds
                await stream_handler.cleanup_stale_connections(timeout_seconds=60)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in periodic cleanup: {e}")
    
    cleanup_task = asyncio.create_task(periodic_cleanup())
    
    yield
    
    # ===== Graceful Shutdown =====
    logger.info("🛑 Shutting down gracefully...")
    
    # Cancel background tasks
    logger.info("Cancelling background tasks...")
    camera_ws_task.cancel()
    discovery_task.cancel()
    cleanup_task.cancel()
    
    # Wait for tasks to complete cancellation
    try:
        await asyncio.gather(camera_ws_task, discovery_task, cleanup_task, return_exceptions=True)
    except Exception as e:
        logger.debug(f"Task cancellation completed: {e}")
    
    # Close all active WebSocket connections
    logger.info("Closing WebSocket connections...")
    try:
        # Close camera connections
        for device_id, ws in list(stream_handler.camera_connections.items()):
            try:
                await ws.close()
                logger.debug(f"Closed camera connection: {device_id}")
            except Exception as e:
                logger.debug(f"Error closing camera {device_id}: {e}")
        
        # Close appliance connections
        for device_id, ws in list(stream_handler.appliance_connections.items()):
            try:
                await ws.close()
                logger.debug(f"Closed appliance connection: {device_id}")
            except Exception as e:
                logger.debug(f"Error closing appliance {device_id}: {e}")
        
        # Close dashboard clients
        for room, clients in list(stream_handler.dashboard_clients.items()):
            for client in list(clients):
                try:
                    await client.close()
                except Exception as e:
                    logger.debug(f"Error closing dashboard client: {e}")
        
        logger.info("✅ WebSocket connections closed")
    except Exception as e:
        logger.error(f"Error closing WebSocket connections: {e}")
    
    # Disconnect MQTT
    logger.info("Disconnecting MQTT...")
    if mqtt_handler:
        try:
            await mqtt_handler.disconnect()
            logger.info("✅ MQTT disconnected")
        except Exception as e:
            logger.error(f"Error disconnecting MQTT: {e}")
    
    if mcp_mqtt_client:
        try:
            await mcp_mqtt_client.disconnect()
            logger.info("✅ MCP MQTT disconnected")
        except Exception as e:
            logger.error(f"Error disconnecting MCP MQTT: {e}")
    
    # Disconnect database
    logger.info("Disconnecting database...")
    if db:
        try:
            await db.disconnect()
            logger.info("✅ Database disconnected")
        except Exception as e:
            logger.error(f"Error disconnecting database: {e}")
    
    logger.info("✅ Shutdown complete")


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


@app.get("/nodes/live-status")
async def get_nodes_live_status():
    """Get real-time online/offline status of all connected camera nodes."""
    if stream_handler:
        devices = stream_handler.get_all_device_status()
        return {
            "nodes": devices,
            "total": len(devices),
            "online_count": sum(1 for d in devices if d.get("online", False)),
            "timestamp": datetime.now().isoformat()
        }
    return {"nodes": [], "total": 0, "online_count": 0, "timestamp": datetime.now().isoformat()}


# ==================== Translation API ====================

from .translation_service import translate_with_cache

class TranslationRequest(BaseModel):
    text: str
    from_lang: str = "en"
    to_lang: str = "th"


@app.post("/translate")
async def translate_text(request: TranslationRequest):
    """
    Translate text from English to Thai using transformer model.
    Uses Helsinki-NLP/opus-mt-en-th model for local translation.
    """
    try:
        # If same language, return as-is
        if request.from_lang == request.to_lang:
            return {
                "translated": request.text,
                "from": request.from_lang,
                "to": request.to_lang
            }
        
        # Translate using transformer model (with caching)
        translated = translate_with_cache(
            request.text,
            source_lang=request.from_lang,
            target_lang=request.to_lang
        )
        
        return {
            "translated": translated,
            "from": request.from_lang,
            "to": request.to_lang
        }
    except Exception as e:
        logger.error(f"Translation error: {e}")
        # Fallback: return original text
        return {
            "translated": request.text,
            "from": request.from_lang,
            "to": request.to_lang,
            "error": str(e)
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


@app.post("/nodes/{device_id}/rotate")
async def rotate_camera(device_id: str, degrees: int = Query(...)):
    """Rotate camera by updating its rotation setting."""
    # Normalize degrees to 0, 90, 180, 270
    degrees = degrees % 360
    if degrees not in [0, 90, 180, 270]:
        # Snap to nearest 90
        degrees = round(degrees / 90) * 90 % 360
    
    # 1. Update in-memory cache in stream_handler
    stream_handler.device_rotations[device_id] = degrees
    
    # 2. Update in database
    if db:
        try:
            await db.db.devices.update_one(
                {"id": device_id},
                {"$set": {"rotation": degrees}},
                upsert=True
            )
            logger.info(f"🔄 Updated rotation for {device_id} to {degrees}°")
        except Exception as e:
            logger.error(f"Failed to update rotation in DB: {e}")
            raise HTTPException(status_code=500, detail="Failed to save rotation setting")
    
    return {"device_id": device_id, "rotation": degrees}



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
    
    # Log activity (don't let logging failure break the control command)
    if db:
        try:
            await db.log_activity(
                room_id=control.room,
                event_type="appliance_on" if control.state else "appliance_off",
                details={
                    "appliance": control.appliance,
                    "state": control.state,
                    "value": control.value
                }
            )
        except Exception as e:
            logger.warning(f"Failed to log activity for appliance control: {e}")
    
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
    
    # Get mqtt_handler from app state if available, otherwise fallback to global
    handler = getattr(app.state, "mqtt_handler", mqtt_handler)
    
    if handler:
        logger.info(f"Adding websocket to MQTT handler id={id(handler)}")
        handler.add_websocket(websocket)
        logger.info(f"Current websocket count: {len(handler.websockets)}")
    else:
        logger.error("MQTT handler is None in websocket_endpoint!")
    
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming WebSocket messages if needed
            try:
                message = json.loads(data)
                msg_type = message.get("type", "")
                
                if msg_type == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                
                elif msg_type == "control":
                    if handler:
                        # Handle control commands via WebSocket
                        await handler.send_control_command(
                            room=message["room"],
                            appliance=message["appliance"],
                            state=message["state"]
                        )
                
                elif msg_type == "wheelchair_detection":
                    # Handle wheelchair detection from test simulator or camera-service
                    room = message.get("room", "livingroom")
                    detected = message.get("detected", False)
                    bbox = message.get("bbox")
                    frame_size = message.get("frame_size")
                    source = message.get("source")
                    
                    logger.info(f"🦽 Wheelchair detection from client: room={room}, detected={detected}, source={source}")
                    
                    # ONLY accept detection from detection-test page for position updates
                    if source == "detection-test":
                        # Broadcast to all clients
                        if handler:
                            await handler._broadcast_ws({
                                "type": "wheelchair_detection",
                                "room": room,
                                "device_id": message.get("device_id", "TEST"),
                                "detected": detected,
                                "confidence": message.get("confidence", 0.9),
                                "bbox": bbox,
                                "frame_size": frame_size,
                                "timestamp": datetime.now().isoformat(),
                                "source": "detection-test"
                            })
                        
                        # Trigger database update callback ONLY from detection-test
                        if detected and stream_handler.on_detection_callback:
                            await stream_handler.on_detection_callback(room, {
                                "detected": detected,
                                "bbox": bbox,
                                "frame_size": frame_size,
                                "wheelchair_id": message.get("wheelchair_id")
                            })
                    else:
                        logger.debug(f"Ignoring wheelchair_detection from source: {source} (only accepting from detection-test)")
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON received on WebSocket: {data}")
            except Exception as e:
                logger.error(f"Error processing WebSocket message: {e}", exc_info=True)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
        if handler:
            handler.remove_websocket(websocket)
    except Exception as e:
        logger.error(f"WebSocket endpoint error: {e}", exc_info=True)
        if handler:
            handler.remove_websocket(websocket)



@app.websocket("/ws/camera-service")
async def websocket_camera_service_endpoint(websocket: WebSocket):
    """WebSocket endpoint for camera-service to connect and send detections."""
    await websocket.accept()
    # Convert FastAPI WebSocket to websockets.WebSocketServerProtocol-like interface
    # We'll use a wrapper or adapt the handler
    await stream_handler._handle_camera_service_connection_fastapi(websocket)


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


# ==================== Timeline API ====================

class TimelineQuery(BaseModel):
    user_id: Optional[str] = None
    room_id: Optional[str] = None
    event_type: Optional[str] = None
    date: Optional[str] = None
    limit: int = 100


@app.get("/timeline")
async def get_timeline(
    user_id: Optional[str] = None,
    room_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 100
):
    """Get timeline events with optional filters."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    events = await db.get_timeline(
        user_id=user_id,
        room_id=room_id,
        event_type=event_type,
        limit=limit
    )
    return {"timeline": events, "count": len(events)}


@app.get("/timeline/history")
async def get_timeline_history(date: str, user_id: Optional[str] = None):
    """Get timeline events for a specific date (historical analysis)."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    events = await db.get_timeline_by_date(date, user_id)
    return {
        "date": date,
        "timeline": events,
        "count": len(events)
    }


@app.get("/timeline/summary/{user_id}")
async def get_timeline_summary(user_id: str, date: Optional[str] = None):
    """Get summary of user's timeline for analysis."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    summary = await db.get_timeline_summary(user_id, date)
    return summary


class LocationEventRequest(BaseModel):
    user_id: str
    wheelchair_id: str
    from_room: Optional[str] = None
    to_room: str
    user_name: Optional[str] = None
    detection_confidence: float = 0.0
    bbox: Optional[List] = None


@app.post("/detection/notify")
async def notify_detection(request: Request):
    """Receive detection notification from detection test page and forward to dashboard."""
    try:
        data = await request.json()
        room = data.get("room")
        detected = data.get("detected", False)
        confidence = data.get("confidence", 0.0)
        bbox = data.get("bbox")
        device_id = data.get("device_id")
        timestamp = data.get("timestamp", datetime.now().isoformat())
        
        if not room:
            raise HTTPException(status_code=400, detail="Room is required")
        
        logger.info(f"📢 Detection notification from test page: room={room}, detected={detected}, confidence={confidence}")
        
        # Forward to dashboard via WebSocket and MQTT
        detection_data = {
            "type": "wheelchair_detection",
            "room": room,
            "detected": detected,
            "confidence": confidence,
            "bbox": bbox,
            "device_id": device_id,
            "timestamp": timestamp,
            "method": "yolo",
            "source": "detection-test"
        }
        
        # Broadcast via WebSocket to dashboard clients (video stream)
        await stream_handler._broadcast_detection_to_dashboard(detection_data)
        
        # Also broadcast via MQTT handler WebSocket (main /ws endpoint)
        if hasattr(stream_handler, 'mqtt_handler') and stream_handler.mqtt_handler:
            await stream_handler.mqtt_handler._broadcast_ws(detection_data)
            logger.info(f"📤 Broadcasted detection to /ws clients via mqtt_handler")
        
        # Also trigger detection callback if detected (to update database and positions)
        if detected and stream_handler.on_detection_callback:
            await stream_handler.on_detection_callback(room, {
                "detected": detected,
                "confidence": confidence,
                "bbox": bbox,
                "frame_size": {},
                "device_id": device_id
            })
        
        return {"status": "ok", "message": "Detection notification forwarded"}
    except Exception as e:
        logger.error(f"Error handling detection notification: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/timeline/location")
async def save_location_event(event: LocationEventRequest):
    """Save a location change event to timeline."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    saved_event = await db.save_location_event(
        user_id=event.user_id,
        wheelchair_id=event.wheelchair_id,
        from_room=event.from_room,
        to_room=event.to_room,
        user_name=event.user_name,
        detection_confidence=event.detection_confidence,
        bbox=event.bbox
    )
    
    # Broadcast to WebSocket clients
    if mqtt_handler:
        await mqtt_handler._broadcast_ws({
            "type": "timeline_event",
            "event": saved_event
        })
    
    return {"status": "saved", "event": saved_event}


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
            # Create a copy and remove _id to prevent MongoDB error
            room_update = {k: v for k, v in room.items() if k != "_id"}
            room_update["updatedAt"] = datetime.now()
            
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
            
            # Update room in database
            result = await db.db.rooms.update_one(
                {"id": room.get("id")},
                {"$set": room_update},
                upsert=True
            )
            
            if result.modified_count > 0 or result.upserted_id:
                updated_count += 1
                
        except Exception as e:
            logger.error(f"Failed to update room {room.get('id')}: {e}", exc_info=True)
            # Try with minimal fields as fallback
            try:
                room_update = {k: v for k, v in room.items() if k not in ["_id", "deviceId", "roomType"]}
                room_update["updatedAt"] = datetime.now()
                
                result = await db.db.rooms.update_one(
                    {"id": room.get("id")},
                    {"$set": room_update},
                    upsert=True
                )
                if result.modified_count > 0 or result.upserted_id:
                    updated_count += 1
            except Exception as e2:
                logger.error(f"Failed to update room {room.get('id')} even with fallback: {e2}")
    
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


@app.delete("/map/devices/{device_id}")
async def delete_device(device_id: str):
    """Delete a device."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Try multiple ways to identify the device
    query = {"$or": [{"id": device_id}, {"deviceId": device_id}]}
    result = await db.db.devices.delete_one(query)
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    
    return {"status": "deleted"}


@app.post("/nodes/{device_id}/config-mode")
async def trigger_config_mode(device_id: str, request: Request):
    """Trigger config mode on ESP32 device via HTTP."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Find device to get IP address
    device = await db.db.devices.find_one({"$or": [{"id": device_id}, {"deviceId": device_id}]})
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Try to get IP from device document or device_status
    device_ip = device.get("ip") or device.get("ip_address")
    
    if not device_ip:
        # Try to get from websocket handler device_status
        status = stream_handler.device_status.get(device_id, {})
        device_ip = status.get("ip", "")
    
    if not device_ip:
        raise HTTPException(status_code=400, detail="Device IP address not available. Device may not be connected.")
    
    # Send HTTP POST request to device's /config endpoint
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            url = f"http://{device_ip}/config"
            response = await client.post(url)
            if response.status_code == 200:
                return {
                    "status": "success",
                    "device_id": device_id,
                    "ip": device_ip,
                    "message": "Config mode triggered. Connect to WiFi: WheelSense-" + device_id
                }
            else:
                logger.warning(f"Config mode request returned status {response.status_code}")
                return {
                    "status": "sent",
                    "device_id": device_id,
                    "ip": device_ip,
                    "message": "Request sent (device may reset immediately)"
                }
    except httpx.TimeoutException:
        # Timeout is expected if device resets quickly
        return {
            "status": "sent",
            "device_id": device_id,
            "ip": device_ip,
            "message": "Request sent (device may have reset)"
        }
    except Exception as e:
        logger.error(f"Failed to trigger config mode: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to trigger config mode: {str(e)}")


@app.post("/nodes/{device_id}/rotate")
async def rotate_camera(device_id: str, request: Request, degrees: Optional[int] = Query(90, description="Rotation step in degrees")):
    """Rotate camera view. Stores rotation state in database (server-side rotation).
    
    Rotation is applied on the server side when processing frames, so ESP32 device
    doesn't need to be in config mode.
    
    Args:
        device_id: Device ID
        degrees: Rotation angle (0, 90, 180, or 270)
    """
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Find device
    device = await db.db.devices.find_one({"$or": [{"id": device_id}, {"deviceId": device_id}]})
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Normalize degrees to 0, 90, 180, or 270
    rotate_deg = degrees if degrees is not None else 90
    rotate_deg = rotate_deg % 360
    if rotate_deg not in [0, 90, 180, 270]:
        # Round to nearest valid value
        rotate_deg = round(rotate_deg / 90) * 90 % 360
    
    # Update rotation in database
    try:
        result = await db.db.devices.update_one(
            {"$or": [{"id": device_id}, {"deviceId": device_id}]},
            {"$set": {"rotation": rotate_deg}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Device not found")
        
        logger.info(f"Updated rotation for device {device_id}: {rotate_deg}°")
        
        # Update rotation cache in stream_handler
        if stream_handler and device_id:
            stream_handler.device_rotations[device_id] = rotate_deg
        
        return {
            "status": "success",
            "device_id": device_id,
            "rotation": rotate_deg,
            "message": f"Camera rotation set to {rotate_deg}°. Rotation will be applied on server side."
        }
    except Exception as e:
        logger.error(f"Failed to update rotation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update rotation: {str(e)}")


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


@app.post("/appliances/fix-av-to-ac")
async def fix_av_to_ac():
    """Fix all appliances with type 'AV' to 'AC' in database."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Update all appliances with type "AV" or "av" to "AC"
    result = await db.db.appliances.update_many(
        {"type": {"$in": ["AV", "av"]}},
        {"$set": {"type": "AC"}}
    )
    
    logger.info(f"Fixed {result.modified_count} appliances from AV to AC")
    
    return {
        "status": "fixed",
        "modified_count": result.modified_count,
        "message": f"Updated {result.modified_count} appliances from AV to AC"
    }


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


# ==================== Migration Endpoint ====================

@app.post("/migrate/rooms-thai-to-english")
async def migrate_rooms_thai_to_english():
    """Migrate Thai room names to English."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Room name mapping (Thai -> English)
    room_name_map = {
        "ห้องนอน": "Bedroom",
        "ห้องน้ำ": "Bathroom",
        "ห้องครัว": "Kitchen",
        "ห้องนั่งเล่น": "Living Room",
        "ทางเดิน": "Corridor"
    }
    
    rooms_updated = 0
    async for room in db.db.rooms.find({}):
        updates = {}
        updated = False
        
        # Update name if it's Thai
        if room.get('name') and room['name'] in room_name_map:
            updates['name'] = room_name_map[room['name']]
            updated = True
        
        # Ensure nameEn is set to English name
        if room.get('nameEn') and room['nameEn'] in room_name_map:
            updates['nameEn'] = room_name_map[room['nameEn']]
            updated = True
        elif not room.get('nameEn') and room.get('name'):
            if room['name'] in room_name_map:
                updates['nameEn'] = room_name_map[room['name']]
                updated = True
            elif room['name'] not in room_name_map.values():
                # If name is already English but nameEn is missing, copy name to nameEn
                updates['nameEn'] = room['name']
                updated = True
        
        # If nameEn exists and is English, but name doesn't match, update name to match nameEn
        if room.get('nameEn') and room['nameEn'] not in room_name_map:
            if room.get('name') != room.get('nameEn'):
                updates['name'] = room['nameEn']
                updated = True
        
        if updated:
            await db.db.rooms.update_one(
                {'_id': room['_id']},
                {'$set': {**updates, 'updatedAt': datetime.now()}}
            )
            rooms_updated += 1
    
    return {
        "status": "success",
        "rooms_updated": rooms_updated,
        "message": f"Migration complete! Updated {rooms_updated} room(s)."
    }


# ==================== Gemini AI Endpoints ====================

class GeminiChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    system_prompt: Optional[str] = None
    context: Optional[Dict[str, Any]] = None

@app.post("/ai/gemini/chat")
async def gemini_chat(request: GeminiChatRequest):
    """
    Chat with Gemini Flash API for intelligent responses.
    Used for Analytics insights, Routine suggestions, and general AI chat.
    """
    if not ai_service:
        raise HTTPException(status_code=503, detail="AI service not available")
    
    if not ai_service.gemini_api_key:
        raise HTTPException(status_code=503, detail="Gemini API key not configured. Set GEMINI_API_KEY environment variable.")
    
    response = await ai_service.chat_with_gemini(
        messages=request.messages,
        system_prompt=request.system_prompt,
        context=request.context
    )
    
    return {
        "response": response,
        "model": "gemini-2.0-flash-exp",
        "timestamp": datetime.now().isoformat()
    }


@app.post("/ai/gemini/suggest-routines")
async def suggest_routines(patient_id: Optional[str] = None):
    """
    Get AI-powered routine suggestions based on user behavior patterns.
    For the Routines page.
    """
    if not ai_service or not db:
        raise HTTPException(status_code=503, detail="AI service or database not available")
    
    if not ai_service.gemini_api_key:
        raise HTTPException(status_code=503, detail="Gemini API key not configured")
    
    # Get user patterns from behavior analysis
    patterns = {
        "room_time": {},
        "peak_hours": {},
        "appliance_usage": {}
    }
    
    if patient_id:
        # Get recent activities for this patient
        activities = await db.get_user_activities(user_id=patient_id, limit=100)
        if activities:
            patterns = ai_service._extract_patterns(activities)
    
    # Get existing routines
    query = {"patientId": patient_id} if patient_id else {}
    existing_routines = await db.db.routines.find(query).to_list(length=50)
    existing_routines = [Database._serialize_doc(r) for r in existing_routines]
    
    # Get suggestions from Gemini
    suggestions = await ai_service.suggest_routines(
        user_patterns=patterns,
        existing_routines=existing_routines
    )
    
    return {
        "suggestions": suggestions,
        "model": "gemini-2.0-flash-exp",
        "timestamp": datetime.now().isoformat()
    }


@app.post("/ai/gemini/analyze")
async def gemini_analyze(
    patient_id: Optional[str] = None,
    question: Optional[str] = None
):
    """
    Get AI-powered analytics insights from Gemini Flash.
    For the Analytics page.
    """
    if not ai_service or not db:
        raise HTTPException(status_code=503, detail="AI service or database not available")
    
    if not ai_service.gemini_api_key:
        raise HTTPException(status_code=503, detail="Gemini API key not configured")
    
    # Get patient data
    patient_data = {}
    if patient_id:
        patient = await db.db.patients.find_one({"id": patient_id})
        if patient:
            patient_data = Database._serialize_doc(patient)
    
    # Get recent timeline data
    timeline_query = {"userId": patient_id} if patient_id else {}
    timeline_data = await db.db.timeline.find(timeline_query).sort("timestamp", -1).to_list(length=100)
    timeline_data = [Database._serialize_doc(t) for t in timeline_data]
    
    # Get Gemini analysis
    analysis = await ai_service.analyze_analytics_data(
        timeline_data=timeline_data,
        patient_data=patient_data,
        question=question
    )
    
    return analysis


# ==================== Data Management APIs ====================

@app.get("/data/export/patients")
async def export_patients_csv():
    """Export all patient data as CSV."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    import io
    import csv
    
    patients = await db.db.patients.find().to_list(length=1000)
    
    if not patients:
        return Response(content="No data to export", media_type="text/plain")
    
    # Create CSV
    output = io.StringIO()
    fieldnames = ["id", "name", "age", "wheelchairId", "avatar", "status", "currentRoom", "phone", "email", "emergencyContact"]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    
    for patient in patients:
        row = Database._serialize_doc(patient)
        writer.writerow(row)
    
    content = output.getvalue()
    
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=patients_export.csv"}
    )


@app.get("/data/export/timeline")
async def export_timeline_csv(days: int = 30):
    """Export timeline data as CSV."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    import io
    import csv
    from datetime import timedelta
    
    # Get timeline data from last N days
    start_date = datetime.now() - timedelta(days=days)
    timeline = await db.db.timeline.find({
        "timestamp": {"$gte": start_date}
    }).sort("timestamp", -1).to_list(length=10000)
    
    if not timeline:
        return Response(content="No data to export", media_type="text/plain")
    
    # Create CSV
    output = io.StringIO()
    fieldnames = ["timestamp", "userId", "eventType", "fromRoom", "toRoom", "confidence", "message"]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    
    for event in timeline:
        row = Database._serialize_doc(event)
        if isinstance(row.get("timestamp"), datetime):
            row["timestamp"] = row["timestamp"].isoformat()
        writer.writerow(row)
    
    content = output.getvalue()
    
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=timeline_export_{days}days.csv"}
    )


@app.get("/data/export/ai-report")
async def export_ai_report_json(patient_id: Optional[str] = None):
    """Export AI analysis report as JSON (could be converted to PDF on frontend)."""
    if not ai_service or not db:
        raise HTTPException(status_code=503, detail="AI service or database not available")
    
    # Get patient data
    patient_data = {}
    if patient_id:
        patient = await db.db.patients.find_one({"id": patient_id})
        if patient:
            patient_data = Database._serialize_doc(patient)
    else:
        # Get first patient
        patient = await db.db.patients.find_one({})
        if patient:
            patient_data = Database._serialize_doc(patient)
            patient_id = patient_data.get("id")
    
    # Get recent activities
    activities = await db.get_user_activities(user_id=patient_id, limit=200) if patient_id else []
    
    # Run behavior analysis
    analysis = await ai_service.analyze_behavior(activities)
    
    # Get recommendations
    recommendations = await ai_service.generate_recommendations(analysis)
    
    report = {
        "report_type": "AI Behavior Analysis",
        "generated_at": datetime.now().isoformat(),
        "patient": patient_data,
        "analysis": analysis,
        "recommendations": recommendations
    }
    
    return report


@app.get("/data/export/backup")
async def export_backup_json():
    """Backup all data as JSON."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Export all collections
    backup = {
        "exported_at": datetime.now().isoformat(),
        "version": "1.0.0",
        "data": {}
    }
    
    collections = ["patients", "wheelchairs", "rooms", "buildings", "floors", 
                   "appliances", "devices", "routines", "timeline", "activities"]
    
    for collection_name in collections:
        try:
            collection = getattr(db.db, collection_name)
            docs = await collection.find().to_list(length=10000)
            backup["data"][collection_name] = [Database._serialize_doc(d) for d in docs]
        except Exception as e:
            logger.warning(f"Could not export collection {collection_name}: {e}")
            backup["data"][collection_name] = []
    
    content = json.dumps(backup, ensure_ascii=False, indent=2, default=str)
    
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=wheelsense_backup.json"}
    )


class ImportDataRequest(BaseModel):
    collection: str
    data: List[Dict[str, Any]]
    replace_existing: bool = False

@app.post("/data/import")
async def import_data(request: ImportDataRequest):
    """Import data from JSON."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    allowed_collections = ["patients", "wheelchairs", "rooms", "buildings", "floors",
                          "appliances", "devices", "routines"]
    
    if request.collection not in allowed_collections:
        raise HTTPException(status_code=400, detail=f"Collection not allowed. Allowed: {allowed_collections}")
    
    collection = getattr(db.db, request.collection)
    
    if request.replace_existing:
        # Delete existing data
        await collection.delete_many({})
    
    # Insert new data
    if request.data:
        # Remove _id fields to avoid conflicts
        data_to_insert = [{k: v for k, v in doc.items() if k != "_id"} for doc in request.data]
        result = await collection.insert_many(data_to_insert)
        
        return {
            "status": "success",
            "collection": request.collection,
            "inserted_count": len(result.inserted_ids)
        }
    
    return {"status": "success", "inserted_count": 0}


@app.delete("/data/timeline")
async def clear_timeline_data(days_ago: int = 30):
    """Clear timeline data older than specified days."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    from datetime import timedelta
    
    cutoff_date = datetime.now() - timedelta(days=days_ago)
    
    # Delete old timeline entries
    result = await db.db.timeline.delete_many({
        "timestamp": {"$lt": cutoff_date}
    })
    
    # Also clear old activities
    activities_result = await db.db.activities.delete_many({
        "timestamp": {"$lt": cutoff_date}
    })
    
    return {
        "status": "success",
        "timeline_deleted": result.deleted_count,
        "activities_deleted": activities_result.deleted_count,
        "cutoff_date": cutoff_date.isoformat()
    }


@app.post("/data/reset-defaults")
async def reset_all_defaults():
    """Reset all settings to defaults and clear user data."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Clear timeline data
    timeline_result = await db.db.timeline.delete_many({})
    activities_result = await db.db.activities.delete_many({})
    routines_result = await db.db.routines.delete_many({})
    behavior_result = await db.db.behaviorAnalysis.delete_many({})
    notes_result = await db.db.doctorNotes.delete_many({})
    
    # Reset appliance states to off
    await db.db.appliances.update_many(
        {},
        {"$set": {"state": False, "value": 0}}
    )
    
    # Reset wheelchair positions
    await db.save_wheelchair_positions({})
    
    return {
        "status": "success",
        "message": "All data reset to defaults",
        "cleared": {
            "timeline": timeline_result.deleted_count,
            "activities": activities_result.deleted_count,
            "routines": routines_result.deleted_count,
            "behaviorAnalysis": behavior_result.deleted_count,
            "doctorNotes": notes_result.deleted_count
        }
    }


# ==================== Settings/API Keys Management ====================

class ApiKeysRequest(BaseModel):
    gemini_api_key: Optional[str] = None
    ollama_host: Optional[str] = None

@app.post("/settings/api-keys")
async def save_api_keys(request: ApiKeysRequest):
    """Save API keys to database (for persistence across restarts)."""
    global ai_service
    
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Save to database
    settings_doc = {
        "type": "api_keys",
        "gemini_api_key": request.gemini_api_key,
        "ollama_host": request.ollama_host,
        "updated_at": datetime.now()
    }
    
    await db.db.settings.update_one(
        {"type": "api_keys"},
        {"$set": settings_doc},
        upsert=True
    )
    
    # Update AI service with new key if provided
    if request.gemini_api_key and ai_service:
        ai_service.gemini_api_key = request.gemini_api_key
        logger.info("✅ Gemini API key updated")
    
    return {"status": "saved", "message": "API keys saved successfully"}


@app.get("/settings/api-keys")
async def get_api_keys():
    """Get saved API keys (masked for security)."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    settings_doc = await db.db.settings.find_one({"type": "api_keys"})
    
    if not settings_doc:
        return {
            "gemini_api_key_set": False,
            "ollama_host": "http://localhost:11434"
        }
    
    # Mask the API key for security
    gemini_key = settings_doc.get("gemini_api_key", "")
    gemini_masked = f"{gemini_key[:10]}...{gemini_key[-4:]}" if gemini_key and len(gemini_key) > 14 else ""
    
    return {
        "gemini_api_key_set": bool(gemini_key),
        "gemini_api_key_masked": gemini_masked,
        "ollama_host": settings_doc.get("ollama_host", "http://localhost:11434")
    }


# ==================== MCP Protocol Endpoints ====================

class MCPRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: int
    method: str
    params: Optional[Dict[str, Any]] = None

class MCPResponse(BaseModel):
    jsonrpc: str = "2.0"
    id: int
    result: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None

class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    tools: Optional[List[str]] = None

@app.post("/mcp")
async def handle_mcp_request(request: MCPRequest) -> MCPResponse:
    """Handle MCP protocol requests."""
    if not tool_registry:
        return MCPResponse(
            id=request.id,
            error={"code": -32603, "message": "Tool registry not initialized"}
        )
    
    method = request.method
    params = request.params or {}
    
    try:
        if method == "initialize":
            result = {
                "protocolVersion": "2024-11-05",
                "serverInfo": {
                    "name": "wheelsense-mcp-server",
                    "version": "1.0.0"
                },
                "capabilities": {
                    "tools": {}
                }
            }
        elif method == "tools/list":
            tools = tool_registry.get_tools()
            result = {"tools": tools}
        elif method == "tools/call":
            tool_name = params.get("name")
            arguments = params.get("arguments", {})
            result = await tool_registry.call_tool(tool_name, arguments)
        else:
            return MCPResponse(
                id=request.id,
                error={"code": -32601, "message": f"Method not found: {method}"}
            )
        
        return MCPResponse(id=request.id, result=result)
        
    except Exception as e:
        logger.error(f"MCP request error: {e}")
        return MCPResponse(
            id=request.id,
            error={"code": -32603, "message": str(e)}
        )

@app.post("/chat")
async def chat(request: ChatRequest):
    """Handle chat requests with optional tool calling."""
    if not llm_client:
        raise HTTPException(status_code=503, detail="LLM not available")
    
    # Get available tools if requested
    available_tools = []
    if request.tools and tool_registry:
        all_tools = tool_registry.get_tools()
        available_tools = [t for t in all_tools if t["name"] in request.tools]
    
    # Build system message with tools info
    system_message = """You are WheelSense smart home assistant for wheelchair users.
Respond in English, concise and clear.

"""
    
    if available_tools:
        system_message += "Available tools:\n"
        for tool in available_tools:
            system_message += f"- {tool['name']}: {tool['description']}\n"
    
    # Convert messages
    messages = [{"role": "system", "content": system_message}]
    for msg in request.messages:
        messages.append({"role": msg["role"], "content": msg["content"]})
    
    # Get LLM response
    try:
        response = await llm_client.chat(messages)
    except Exception as e:
        logger.error(f"LLM chat failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Unable to connect to AI system: {str(e)}"
        )
    
    # Check if response contains tool calls (simple pattern matching)
    tool_results = []
    if available_tools and ("turn on" in response.lower() or "turn off" in response.lower()):
        # Simple pattern matching for demo
        text_lower = response.lower()
        rooms_map = {
            "bedroom": "bedroom",
            "bathroom": "bathroom",
            "kitchen": "kitchen",
            "living room": "livingroom",
            "livingroom": "livingroom"
        }
        appliances_map = {
            "light": "light",
            "lights": "light",
            "ac": "AC",
            "air conditioner": "AC",
            "fan": "fan",
            "tv": "tv",
            "television": "tv"
        }
        
        for room_name, room_en in rooms_map.items():
            for appliance_name, appliance_en in appliances_map.items():
                if room_name in text_lower and appliance_name in text_lower:
                    state = "turn on" in text_lower or "on" in text_lower
                    if tool_registry:
                        try:
                            result = await tool_registry.call_tool(
                                "control_appliance",
                                {"room": room_en, "appliance": appliance_en, "state": state}
                            )
                            tool_results.append(result)
                        except Exception as e:
                            logger.error(f"Tool call failed: {e}")
    
    return {
        "response": response,
        "tool_results": tool_results,
        "timestamp": datetime.now().isoformat()
    }


# ==================== Main Entry Point ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)