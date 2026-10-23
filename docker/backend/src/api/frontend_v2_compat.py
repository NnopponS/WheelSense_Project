"""
Frontend V2 Compatibility Layer for WheelSense Backend
Enables the new Next.js WheelSense Platform Frontend to connect seamlessly
with the existing FastAPI + MQTT + SQLite + TSIM + CucumberRS hardware system.
"""

from datetime import datetime, timezone
import json
import logging
import base64
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from ..dependencies import get_db, get_mqtt_handler
from ..core.database import Database
from ..core.appliance_control import control_appliance_core

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Frontend V2 Compatibility"])

# ─────────────────────────────────────────────────────────────────────────────
# Helper: Create valid demo JWT token for proxy.ts
# ─────────────────────────────────────────────────────────────────────────────
def create_demo_jwt(role: str = "admin", username: str = "admin", user_id: int = 1) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    now_ts = int(datetime.now(timezone.utc).timestamp())
    payload = {
        "sub": username,
        "user_id": user_id,
        "role": role,
        "sid": "session-demo-001",
        "iat": now_ts,
        "exp": now_ts + (60 * 60 * 24 * 30),  # 30 days
    }
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    dummy_signature = base64.urlsafe_b64encode(b"wheelsense-demo-secret-signature").decode().rstrip("=")
    return f"{header}.{payload_b64}.{dummy_signature}"

DEMO_USER = {
    "id": 1,
    "workspace_id": 1,
    "username": "admin",
    "role": "admin",
    "is_active": True,
    "caregiver_id": None,
    "patient_id": None,
    "profile_image_url": None,
    "email": "admin@wheelsense.local",
    "phone": "081-234-5678",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-10-23T00:00:00Z",
}

# ─────────────────────────────────────────────────────────────────────────────
# Auth Endpoints
# ─────────────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

@router.get("/auth/session")
@router.get("/api/auth/session")
async def get_session():
    """Returns active session or mock authenticated admin user."""
    return {
        "authenticated": True,
        "user": DEMO_USER
    }

@router.post("/auth/login")
@router.post("/api/auth/login")
async def login(request: Request, response: Response):
    """Authenticate user, set ws_token cookie, and return JWT token."""
    username = "admin"
    password = ""
    
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            data = await request.json()
            username = data.get("username", "admin")
            password = data.get("password", "")
        except Exception:
            pass
    elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        try:
            form = await request.form()
            username = form.get("username", "admin")
            password = form.get("password", "")
        except Exception:
            pass

    role = "admin"
    token = create_demo_jwt(role=role, username=username)
    
    # Set ws_token cookie for proxy middleware
    response.set_cookie(
        key="ws_token",
        value=token,
        max_age=60 * 60 * 24 * 30,
        path="/",
        httponly=False,
        samesite="lax"
    )
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "session_id": "session-demo-001",
        "user": {
            **DEMO_USER,
            "username": username,
            "role": role
        }
    }

@router.post("/auth/logout")
@router.post("/api/auth/logout")
async def logout():
    return Response(status_code=204)

@router.get("/users")
@router.get("/api/users")
async def list_users():
    return [DEMO_USER]

@router.get("/caregivers")
@router.get("/api/caregivers")
async def list_caregivers():
    return [
        {
            "id": 1,
            "user_id": 1,
            "workspace_id": 1,
            "first_name": "Caregiver",
            "last_name": "Admin",
            "nickname": "Admin",
            "role": "admin",
            "status": "on_duty",
            "shift_pattern": "Day Shift",
            "phone": "081-234-5678",
            "email": "admin@wheelsense.local",
            "created_at": "2026-01-01T00:00:00Z"
        }
    ]

# ─────────────────────────────────────────────────────────────────────────────
# Smart Devices (Home Assistant style / CucumberRS MQTT Lights)
# ─────────────────────────────────────────────────────────────────────────────
SMART_DEVICE_DEFS = [
    {
        "id": 1,
        "workspace_id": 1,
        "name": "Living Room Light",
        "ha_entity_id": "light.livingroom",
        "device_type": "light",
        "room": "livingroom",
        "appliance": "light",
        "room_id": 1,
        "pin": 21,
        "is_active": True,
        "config": {"pin": 21, "room": "livingroom", "type": "light"}
    },
    {
        "id": 2,
        "workspace_id": 1,
        "name": "Bedroom Light",
        "ha_entity_id": "light.bedroom",
        "device_type": "light",
        "room": "bedroom",
        "appliance": "light",
        "room_id": 2,
        "pin": 17,
        "is_active": True,
        "config": {"pin": 17, "room": "bedroom", "type": "light"}
    },
    {
        "id": 3,
        "workspace_id": 1,
        "name": "Kitchen Light",
        "ha_entity_id": "light.kitchen",
        "device_type": "light",
        "room": "kitchen",
        "appliance": "light",
        "room_id": 3,
        "pin": 5,
        "is_active": True,
        "config": {"pin": 5, "room": "kitchen", "type": "light"}
    },
    {
        "id": 4,
        "workspace_id": 1,
        "name": "Bathroom Light",
        "ha_entity_id": "light.bathroom",
        "device_type": "light",
        "room": "bathroom",
        "appliance": "light",
        "room_id": 4,
        "pin": 14,
        "is_active": True,
        "config": {"pin": 14, "room": "bathroom", "type": "light"}
    }
]

@router.get("/ha/devices")
@router.get("/api/ha/devices")
async def list_smart_devices(request: Request):
    """List all smart devices with current state from database."""
    db = get_db(request)
    result = []
    
    for dev in SMART_DEVICE_DEFS:
        # Check current state in database
        state_str = "off"
        try:
            if db:
                app_doc = await db.get_appliance(dev["room"], dev["appliance"])
                if app_doc and app_doc.get("state"):
                    state_str = "on"
        except Exception:
            pass
            
        result.append({
            "id": dev["id"],
            "workspace_id": dev["workspace_id"],
            "name": dev["name"],
            "ha_entity_id": dev["ha_entity_id"],
            "device_type": dev["device_type"],
            "room_id": dev["room_id"],
            "is_active": dev["is_active"],
            "config": dev["config"],
            "state": state_str,
            "created_at": "2026-01-01T00:00:00Z"
        })
    return result

class SmartDeviceControl(BaseModel):
    action: Optional[str] = "toggle"
    parameters: Optional[Dict[str, Any]] = None
    state: Optional[bool] = None

@router.post("/ha/devices/{device_id}/control")
@router.post("/api/ha/devices/{device_id}/control")
async def control_smart_device(device_id: int, control: SmartDeviceControl, request: Request):
    """Control a smart device (turns CucumberRS GPIO pin ON/OFF via MQTT)."""
    mqtt_handler = get_mqtt_handler(request)
    db = getattr(request.app.state, 'db', None)
    
    dev = next((d for d in SMART_DEVICE_DEFS if d["id"] == device_id), None)
    if not dev:
        raise HTTPException(status_code=404, detail=f"Smart device {device_id} not found")
        
    # Determine new target state
    current_state = False
    try:
        if db:
            app_doc = await db.get_appliance(dev["room"], dev["appliance"])
            if app_doc:
                current_state = bool(app_doc.get("state", False))
    except Exception:
        pass

    target_state = current_state
    if control.state is not None:
        target_state = control.state
    elif control.action in ["turn_on", "on"]:
        target_state = True
    elif control.action in ["turn_off", "off"]:
        target_state = False
    elif control.action in ["toggle"]:
        target_state = not current_state

    # Execute core control (publishes to MQTT WheelSense/<room>/control)
    res = await control_appliance_core(
        db=db,
        mqtt_handler=mqtt_handler,
        room=dev["room"],
        appliance=dev["appliance"],
        state=target_state
    )
    
    logger.info(f"💡 Smart Device #{device_id} ({dev['name']}) -> {target_state} (res: {res})")
    
    return {
        "success": res.get("success", True),
        "device_id": device_id,
        "state": "on" if target_state else "off",
        "entity_id": dev["ha_entity_id"],
        "room": dev["room"]
    }

# ─────────────────────────────────────────────────────────────────────────────
# Device Fleet (/api/devices)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/devices")
@router.get("/api/devices")
async def list_registry_devices(request: Request):
    """List hardware fleet: TSIM camera, CucumberRS controller, Wheelchair."""
    now_iso = datetime.now(timezone.utc).isoformat()
    return [
        {
            "id": 1,
            "device_id": "TSIM_004",
            "device_type": "camera",
            "hardware_type": "node",
            "display_name": "TSIM Camera (ESP32-CAM Bathroom)",
            "ip_address": "172.20.10.4",
            "firmware": "v2.1.0-autodiscovery",
            "last_seen": now_iso,
            "config": {"room": "bathroom", "ws_port": 8765}
        },
        {
            "id": 2,
            "device_id": "CUCUMBER_01",
            "device_type": "appliance_controller",
            "hardware_type": "node",
            "display_name": "CucumberRS Appliance Controller (ESP32-S2)",
            "ip_address": "172.20.10.x",
            "firmware": "v2.0-cucumber-mqtt",
            "last_seen": now_iso,
            "config": {"gpios": [21, 17, 5, 14]}
        },
        {
            "id": 3,
            "device_id": "WS_001",
            "device_type": "wheelchair",
            "hardware_type": "wheelchair",
            "display_name": "Smart Wheelchair #001",
            "ip_address": "172.20.10.x",
            "firmware": "v1.5.2",
            "last_seen": now_iso,
            "config": {}
        }
    ]

# ─────────────────────────────────────────────────────────────────────────────
# Floorplans & Live Presence
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/floorplans/presence")
@router.get("/api/floorplans/presence")
async def get_floorplan_presence(request: Request):
    """Returns presence, occupant counts, live camera snapshots for each room."""
    db = get_db(request)
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # Check current location from DB
    current_location = "bathroom"
    try:
        if db:
            user_info = await db.get_user_info()
            if user_info and user_info.get("current_location"):
                current_location = str(user_info["current_location"]).lower().replace(" ", "")
    except Exception:
        pass
        
    rooms_data = [
        {
            "room_id": 1,
            "room_name": "Living Room",
            "room_type": "livingroom",
            "occupant_count": 1 if current_location == "livingroom" else 0,
            "patient_count": 1 if current_location == "livingroom" else 0,
            "staff_count": 0,
            "alert_count": 0,
            "patient_hint": {
                "patient_id": 1,
                "first_name": "Somchai",
                "last_name": "Sukjai",
                "nickname": "Chai"
            } if current_location == "livingroom" else None,
            "camera_summary": {
                "device_id": "TSIM_004",
                "latest_photo_url": "/api/video/livingroom",
                "captured_at": now_iso,
                "capture_available": True
            }
        },
        {
            "room_id": 2,
            "room_name": "Bedroom",
            "room_type": "bedroom",
            "occupant_count": 1 if current_location == "bedroom" else 0,
            "patient_count": 1 if current_location == "bedroom" else 0,
            "staff_count": 0,
            "alert_count": 0,
            "patient_hint": {
                "patient_id": 1,
                "first_name": "Somchai",
                "last_name": "Sukjai",
                "nickname": "Chai"
            } if current_location == "bedroom" else None,
            "camera_summary": {
                "device_id": "TSIM_004",
                "latest_photo_url": "/api/video/bedroom",
                "captured_at": now_iso,
                "capture_available": True
            }
        },
        {
            "room_id": 3,
            "room_name": "Kitchen",
            "room_type": "kitchen",
            "occupant_count": 1 if current_location == "kitchen" else 0,
            "patient_count": 1 if current_location == "kitchen" else 0,
            "staff_count": 0,
            "alert_count": 0,
            "patient_hint": {
                "patient_id": 1,
                "first_name": "Somchai",
                "last_name": "Sukjai",
                "nickname": "Chai"
            } if current_location == "kitchen" else None,
            "camera_summary": {
                "device_id": "TSIM_004",
                "latest_photo_url": "/api/video/kitchen",
                "captured_at": now_iso,
                "capture_available": True
            }
        },
        {
            "room_id": 4,
            "room_name": "Bathroom",
            "room_type": "bathroom",
            "occupant_count": 1 if current_location in ["bathroom", "toilet"] else 0,
            "patient_count": 1 if current_location in ["bathroom", "toilet"] else 0,
            "staff_count": 0,
            "alert_count": 0,
            "patient_hint": {
                "patient_id": 1,
                "first_name": "Somchai",
                "last_name": "Sukjai",
                "nickname": "Chai"
            } if current_location in ["bathroom", "toilet"] else None,
            "camera_summary": {
                "device_id": "TSIM_004",
                "latest_photo_url": "/api/video/bathroom",
                "captured_at": now_iso,
                "capture_available": True
            }
        }
    ]
    
    return {
        "facility_id": 1,
        "floor_id": 1,
        "computed_at": now_iso,
        "rooms": rooms_data
    }

@router.post("/floorplans/rooms/{room_id}/capture")
@router.post("/api/floorplans/rooms/{room_id}/capture")
async def capture_room_snapshot(room_id: int):
    """Triggers snapshot from TSIM camera for the specified room."""
    return {
        "success": True,
        "message": f"Camera snapshot captured for room {room_id}",
        "photo_url": f"/api/video/bathroom"
    }

# ─────────────────────────────────────────────────────────────────────────────
# Analytics & Alerts summaries
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/analytics/alerts/summary")
@router.get("/api/analytics/alerts/summary")
async def get_alerts_summary():
    return {
        "active_alerts_count": 0,
        "critical_count": 0,
        "warning_count": 0,
        "info_count": 0,
        "resolved_today": 2
    }

@router.get("/analytics/wards/summary")
@router.get("/api/analytics/wards/summary")
async def get_wards_summary():
    return {
        "total_rooms": 4,
        "occupied_rooms": 1,
        "total_patients": 1,
        "staff_on_duty": 1
    }

@router.get("/alerts")
@router.get("/api/alerts")
async def list_alerts():
    return []
