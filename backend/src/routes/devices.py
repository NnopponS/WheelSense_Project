"""
WheelSense v2.0 - Devices Routes
Device management (legacy compatibility + nodes)
Config sync for M5StickCPlus2 (rooms, nodes, 2-way config push)
"""

from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter
from pydantic import BaseModel

from ..core.database import db
from ..core.mqtt import mqtt_collector

router = APIRouter()


class DeviceConfigPush(BaseModel):
    """Config to push to device via MQTT"""
    wifi_ssid: Optional[str] = None
    wifi_password: Optional[str] = None
    mqtt_broker: Optional[str] = None
    mqtt_port: Optional[int] = None
    rooms: Optional[List[dict]] = None
    nodes: Optional[List[dict]] = None


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


@router.get("/{device_id}/config")
async def get_device_config(device_id: str):
    """Return config + rooms + nodes for device (device calls when Sync pressed)"""
    rooms = await db.fetch_all(
        "SELECT id, name FROM rooms ORDER BY name"
    )
    nodes = await db.fetch_all(
        "SELECT id, room_id, name FROM nodes ORDER BY id"
    )
    return {
        "rooms": [{"id": r["id"], "name": r["name"]} for r in rooms],
        "nodes": [{"id": n["id"], "room_id": n["room_id"], "name": n["name"]} for n in nodes],
        "timestamp": datetime.now().isoformat(),
    }


@router.post("/{device_id}/config")
async def push_device_config(device_id: str, config: DeviceConfigPush):
    """Push configuration to device via MQTT"""
    import json
    topic = f"WheelSense/config/{device_id}"
    payload = config.model_dump_json(exclude_none=True)
    await mqtt_collector.publish(topic, payload)
    return {"message": "Config pushed to device"}
