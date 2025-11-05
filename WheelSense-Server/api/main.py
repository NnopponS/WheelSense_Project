"""
WheelSense FastAPI Server
Handles MQTT data collection and provides REST API for Dashboard
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import sqlite3
import json
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import asyncio
import os

# Database path
DB_PATH = os.getenv('DB_PATH', '../database/wheelsense.db')

# Initialize database
def init_database():
    """Initialize database with schema"""
    schema_path = os.path.join(os.path.dirname(__file__), '../database/schema.sql')
    
    # Create database directory if not exists
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Execute schema
    if os.path.exists(schema_path):
        with open(schema_path, 'r', encoding='utf-8') as f:
            cursor.executescript(f.read())
    
    conn.commit()
    conn.close()
    print(f"✅ Database initialized: {DB_PATH}")

# Database connection helper
def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Starting WheelSense FastAPI Server...")
    init_database()
    yield
    # Shutdown
    print("⏹️  Shutting down WheelSense FastAPI Server...")

# Create FastAPI app
app = FastAPI(
    title="WheelSense API",
    description="REST API for WheelSense System",
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

# Pydantic Models
class Wheelchair(BaseModel):
    device_id: str
    timestamp: str
    distance_m: float
    speed_ms: float
    status: int
    status_str: str
    current_node: Optional[int] = None
    rssi: Optional[int] = None
    stale: bool = False

class Node(BaseModel):
    node_id: int
    name: Optional[str] = None
    last_seen_by: Optional[str] = None
    rssi: Optional[int] = None
    status: str = 'offline'

class Building(BaseModel):
    id: str
    name: str
    description: Optional[str] = None

class Floor(BaseModel):
    id: str
    building_id: str
    name: str
    level: int
    description: Optional[str] = None

class Room(BaseModel):
    id: str
    floor_id: str
    name: str
    x: float
    y: float
    width: float
    height: float
    color: str = '#e6f2ff'
    node_id: Optional[int] = None
    description: Optional[str] = None

class Corridor(BaseModel):
    id: str
    floor_id: str
    name: str
    points: str  # JSON string
    width: float = 24
    color: str = '#e5e7eb'

# ============================================
# Wheelchair Endpoints
# ============================================

@app.get("/api/wheelchairs", response_model=Dict[str, Any])
async def get_wheelchairs():
    """Get all wheelchairs"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM wheelchairs 
        ORDER BY updated_at DESC
    """)
    
    wheelchairs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return {"data": wheelchairs, "count": len(wheelchairs)}

@app.get("/api/wheelchairs/{device_id}", response_model=Dict[str, Any])
async def get_wheelchair(device_id: str):
    """Get specific wheelchair"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM wheelchairs WHERE device_id = ?", (device_id,))
    wheelchair = cursor.fetchone()
    conn.close()
    
    if not wheelchair:
        raise HTTPException(status_code=404, detail="Wheelchair not found")
    
    return {"data": dict(wheelchair)}

@app.post("/api/wheelchairs")
async def create_or_update_wheelchair(wheelchair: Wheelchair):
    """Create or update wheelchair data (called by MQTT collector)"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO wheelchairs (
                device_id, timestamp, distance_m, speed_ms, status, status_str,
                current_node, rssi, stale
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
                timestamp = excluded.timestamp,
                distance_m = excluded.distance_m,
                speed_ms = excluded.speed_ms,
                status = excluded.status,
                status_str = excluded.status_str,
                current_node = excluded.current_node,
                rssi = excluded.rssi,
                stale = excluded.stale
        """, (
            wheelchair.device_id,
            wheelchair.timestamp,
            wheelchair.distance_m,
            wheelchair.speed_ms,
            wheelchair.status,
            wheelchair.status_str,
            wheelchair.current_node,
            wheelchair.rssi,
            wheelchair.stale
        ))
        
        # Insert into history
        cursor.execute("""
            INSERT INTO wheelchair_history (
                device_id, timestamp, distance_m, speed_ms, status, current_node, rssi
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            wheelchair.device_id,
            wheelchair.timestamp,
            wheelchair.distance_m,
            wheelchair.speed_ms,
            wheelchair.status,
            wheelchair.current_node,
            wheelchair.rssi
        ))
        
        conn.commit()
        conn.close()
        
        return {"status": "success", "device_id": wheelchair.device_id}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# Node Endpoints
# ============================================

@app.get("/api/nodes", response_model=Dict[str, Any])
async def get_nodes():
    """Get all nodes"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM nodes 
        ORDER BY node_id ASC
    """)
    
    nodes = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return {"data": nodes, "count": len(nodes)}

@app.get("/api/nodes/{node_id}", response_model=Dict[str, Any])
async def get_node(node_id: int):
    """Get specific node"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM nodes WHERE node_id = ?", (node_id,))
    node = cursor.fetchone()
    conn.close()
    
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    return {"data": dict(node)}

@app.post("/api/nodes")
async def create_or_update_node(node: Node):
    """Create or update node data (called by MQTT collector)"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO nodes (node_id, name, last_seen_by, rssi, status)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(node_id) DO UPDATE SET
                name = COALESCE(excluded.name, nodes.name),
                last_seen_by = excluded.last_seen_by,
                rssi = excluded.rssi,
                status = excluded.status
        """, (
            node.node_id,
            node.name,
            node.last_seen_by,
            node.rssi,
            node.status
        ))
        
        conn.commit()
        conn.close()
        
        return {"status": "success", "node_id": node.node_id}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# Map Endpoints (Buildings, Floors, Rooms, Corridors)
# ============================================

@app.get("/api/buildings", response_model=List[Dict[str, Any]])
async def get_buildings():
    """Get all buildings"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM buildings ORDER BY name")
    buildings = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return buildings

@app.post("/api/buildings")
async def create_building(building: Building):
    """Create building"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO buildings (id, name, description) VALUES (?, ?, ?)",
            (building.id, building.name, building.description)
        )
        conn.commit()
        conn.close()
        return {"status": "success", "id": building.id}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/floors", response_model=List[Dict[str, Any]])
async def get_floors():
    """Get all floors"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM floors ORDER BY building_id, level")
    floors = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return floors

@app.get("/api/rooms", response_model=List[Dict[str, Any]])
async def get_rooms():
    """Get all rooms"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rooms ORDER BY floor_id, name")
    rooms = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rooms

@app.post("/api/rooms")
async def create_room(room: Room):
    """Create room"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO rooms (id, floor_id, name, x, y, width, height, color, node_id, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            room.id, room.floor_id, room.name, room.x, room.y,
            room.width, room.height, room.color, room.node_id, room.description
        ))
        conn.commit()
        conn.close()
        return {"status": "success", "id": room.id}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/rooms/{room_id}")
async def update_room(room_id: str, room: Room):
    """Update room"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE rooms SET
                name = ?, x = ?, y = ?, width = ?, height = ?,
                color = ?, node_id = ?, description = ?
            WHERE id = ?
        """, (
            room.name, room.x, room.y, room.width, room.height,
            room.color, room.node_id, room.description, room_id
        ))
        conn.commit()
        conn.close()
        return {"status": "success", "id": room_id}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/corridors", response_model=List[Dict[str, Any]])
async def get_corridors():
    """Get all corridors"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM corridors ORDER BY floor_id, name")
    corridors = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return corridors

# ============================================
# Health Check
# ============================================

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) as count FROM wheelchairs")
    wheelchair_count = cursor.fetchone()['count']
    
    cursor.execute("SELECT COUNT(*) as count FROM nodes WHERE status = 'online'")
    online_nodes = cursor.fetchone()['count']
    
    conn.close()
    
    return {
        "status": "ok",
        "database": "connected",
        "wheelchairs": wheelchair_count,
        "online_nodes": online_nodes,
        "timestamp": datetime.now().isoformat()
    }

# ============================================
# Mark stale data (background task)
# ============================================

async def mark_stale_data():
    """Background task to mark stale wheelchair data"""
    while True:
        await asyncio.sleep(10)  # Run every 10 seconds
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Mark wheelchairs as stale if not updated in 30 seconds
        cursor.execute("""
            UPDATE wheelchairs 
            SET stale = TRUE 
            WHERE datetime(updated_at) < datetime('now', '-30 seconds')
            AND stale = FALSE
        """)
        
        # Mark nodes as offline if not seen in 30 seconds
        cursor.execute("""
            UPDATE nodes 
            SET status = 'offline' 
            WHERE datetime(updated_at) < datetime('now', '-30 seconds')
            AND status = 'online'
        """)
        
        if cursor.rowcount > 0:
            print(f"⏰ Marked {cursor.rowcount} item(s) as stale/offline")
        
        conn.commit()
        conn.close()

# Start background task
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(mark_stale_data())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)






