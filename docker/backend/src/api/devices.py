"""
Device APIs - Device (ESP32/Camera) management
"""

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from typing import List, Optional
import json
import logging
import httpx

from ..core.database import Database
from ..dependencies import get_db, get_mqtt_handler

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Devices"])


class DeleteDevicesBulkRequest(BaseModel):
    device_ids: List[str]


@router.get("/map/devices")
async def get_devices(request: Request):
    """Get all devices."""
    db = get_db(request)
    
    devices = await db.db.devices.find().to_list(length=1000)
    return {"devices": [Database._serialize_doc(d) for d in devices]}


@router.post("/map/devices")
async def create_device(device: dict, request: Request):
    """Create a new device."""
    db = get_db(request)
    
    result = await db.db.devices.insert_one(device)
    device["_id"] = result.inserted_id
    return Database._serialize_doc(device)


@router.put("/map/devices/{device_id}")
async def update_device(device_id: str, updates: dict, request: Request):
    """Update a device."""
    db = get_db(request)
    
    result = await db.db.devices.update_one(
        {"id": device_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"status": "updated"}


@router.delete("/map/devices/{device_id}")
async def delete_device(device_id: str, request: Request):
    """Delete a device."""
    db = get_db(request)
    
    query = {"$or": [{"id": device_id}, {"deviceId": device_id}]}
    result = await db.db.devices.delete_one(query)
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    
    return {"status": "deleted", "deleted_count": result.deleted_count}


@router.delete("/map/devices")
async def delete_all_devices(request: Request):
    """Delete all devices from database."""
    db = get_db(request)
    
    result = await db.db.devices.delete_many({})
    logger.info(f"Deleted {result.deleted_count} devices from database")
    
    return {"status": "deleted", "deleted_count": result.deleted_count}


@router.post("/map/devices/bulk-delete")
async def delete_devices_bulk(request_body: DeleteDevicesBulkRequest, request: Request):
    """Delete multiple devices by IDs."""
    db = get_db(request)
    
    device_ids = request_body.device_ids
    query = {"$or": [{"id": {"$in": device_ids}}, {"deviceId": {"$in": device_ids}}]}
    result = await db.db.devices.delete_many(query)
    logger.info(f"Deleted {result.deleted_count} devices from database: {device_ids}")
    
    return {"status": "deleted", "deleted_count": result.deleted_count}


@router.post("/nodes/{device_id}/config-mode")
async def trigger_config_mode(device_id: str, request: Request):
    """Trigger config mode on ESP32 device via HTTP."""
    db = get_db(request)
    
    # Find device to get IP address
    device = await db.db.devices.find_one({"$or": [{"id": device_id}, {"deviceId": device_id}]})
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Try to get IP from device document or device_status
    device_ip = device.get("ip") or device.get("ip_address")
    
    if not device_ip:
        # Try to get from websocket handler device_status
        from ..websocket_handler import stream_handler
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


@router.post("/nodes/{device_id}/rotate")
async def rotate_camera(device_id: str, request: Request, degrees: Optional[int] = Query(90, description="Rotation in degrees. If 0, 90, 180, or 270, treated as absolute value. Otherwise treated as incremental step.")):
    """Rotate camera view. 
    
    This endpoint:
    1. Tries to send HTTP request to ESP32 device (if in config mode)
    2. Always saves rotation to database and stream_handler for server-side rotation
    3. Camera-service will use this rotation for detection
    
    Args:
        device_id: Device ID
        degrees: Rotation value. If 0, 90, 180, or 270, treated as absolute rotation.
                 Otherwise treated as incremental step (for backward compatibility).
    """
    db = get_db(request)
    from ..websocket_handler import stream_handler
    
    # Find device to get IP address
    device = await db.db.devices.find_one({"$or": [{"id": device_id}, {"deviceId": device_id}]})
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Get current rotation from database or default to 0
    current_rotation = device.get("rotation", 0)
    
    # Determine if degrees is an absolute value (0, 90, 180, 270) or incremental step
    rotate_deg = degrees if degrees is not None else 90
    absolute_rotations = [0, 90, 180, 270]
    
    if rotate_deg in absolute_rotations:
        # Treat as absolute rotation value
        new_rotation = rotate_deg
    else:
        # Treat as incremental step (backward compatibility)
        new_rotation = (current_rotation + rotate_deg) % 360
    
    # Always save rotation to database and stream_handler (for server-side rotation)
    await db.db.devices.update_one(
        {"$or": [{"id": device_id}, {"deviceId": device_id}]},
        {"$set": {"rotation": new_rotation}}
    )
    
    # Update stream_handler rotation cache
    stream_handler.device_rotations[device_id] = new_rotation
    
    logger.info(f"📹 Rotation updated for device {device_id}: {current_rotation}° -> {new_rotation}° (server-side)")
    
    # Try to send HTTP request to ESP32 device (optional - only works in config mode)
    device_ip = device.get("ip") or device.get("ip_address")
    if not device_ip:
        status = stream_handler.device_status.get(device_id, {})
        device_ip = status.get("ip", "")
    
    device_rotated = False
    if device_ip:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                url = f"http://{device_ip}/rotate"
                params = {"deg": rotate_deg}
                response = await client.get(url, params=params)
                if response.status_code == 200:
                    device_rotated = True
                    logger.info(f"✅ Device {device_id} rotated on ESP32 (config mode)")
                elif response.status_code == 403:
                    logger.info(f"ℹ️ Device {device_id} not in config mode - using server-side rotation only")
                else:
                    logger.warning(f"⚠️ Device {device_id} returned status {response.status_code}")
        except httpx.TimeoutException:
            logger.debug(f"Device {device_id} timeout - using server-side rotation only")
        except Exception as e:
            logger.debug(f"Device rotation failed for {device_id}: {e} - using server-side rotation only")
    
    return {
        "status": "success",
        "device_id": device_id,
        "rotation": new_rotation,
        "device_rotated": device_rotated,
        "message": "Rotation saved. Detection will use rotated image." if not device_rotated else "Rotation applied on both device and server."
    }
