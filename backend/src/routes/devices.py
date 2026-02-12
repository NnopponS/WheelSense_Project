"""
WheelSense v2.0 - Devices Routes
Device management (legacy compatibility + nodes)
"""

from fastapi import APIRouter

from ..core.database import db

router = APIRouter()


@router.get("")
async def get_devices():
    """Get all devices (nodes + gateways)"""
    nodes = await db.fetch_all("""
        SELECT 
            n.id,
            n.name,
            'node' as type,
            n.room_id,
            r.name as room_name,
            n.x,
            n.y,
            n.status,
            n.rssi,
            n.last_seen_by as mac_address,
            n.updated_at as last_seen
        FROM nodes n
        LEFT JOIN rooms r ON n.room_id = r.id
        ORDER BY n.id
    """)
    
    # Add a virtual gateway device
    gateway = {
        "id": "GW-01",
        "name": "Main Gateway",
        "type": "gateway",
        "room_id": None,
        "room_name": None,
        "x": None,
        "y": None,
        "status": "online",
        "rssi": None,
        "mac_address": None,
        "last_seen": None
    }
    
    devices = list(nodes) + [gateway]
    return {"devices": devices}


@router.get("/online")
async def get_online_devices():
    """Get only online devices"""
    nodes = await db.fetch_all("""
        SELECT 
            n.id,
            n.name,
            'node' as type,
            n.room_id,
            r.name as room_name,
            n.status,
            n.rssi
        FROM nodes n
        LEFT JOIN rooms r ON n.room_id = r.id
        WHERE n.status = 'online'
        ORDER BY n.id
    """)
    return {"devices": nodes}


@router.get("/stats")
async def get_device_stats():
    """Get device statistics"""
    total = await db.fetch_one("SELECT COUNT(*) as count FROM nodes")
    online = await db.fetch_one("SELECT COUNT(*) as count FROM nodes WHERE status = 'online'")
    offline = await db.fetch_one("SELECT COUNT(*) as count FROM nodes WHERE status = 'offline'")
    
    return {
        "total": total["count"] if total else 0,
        "online": online["count"] if online else 0,
        "offline": offline["count"] if offline else 0,
    }
