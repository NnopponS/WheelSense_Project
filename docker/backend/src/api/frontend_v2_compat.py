"""
Frontend V2 Compatibility API Router
Bridges the Next.js V2 Dashboard (origin/prototype/tesaIoT-hackathon) with the
WheelSense 3D Smart Home Hardware Backend (TsimCam-Controller ESP32-CAM,
CucumberRS-Controller ESP32-S2 4-Room LEDs, YOLOv8 camera-service, SQLite DB,
House Check Service, and EaseAI Command Parser).
"""

import base64
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException, Query, Request, Response
from fastapi.responses import Response as FastAPIResponse

from ..core.appliance_control import control_appliance_core
from ..core.websocket_handler import stream_handler
from ..dependencies import get_db, get_mqtt_handler
from ..services.command_parser import execute_command, parse_command

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Frontend V2 Compatibility"])

# ============================================================================
# WheelSense Full Architectural Floorplan Rooms Mapping
# Level 4 (Resident Wing) & Ground Level (Shared Care) from frontend/public/floorplans
# Plus 3D Smart Home Prototype Hardware Mapping (TSIM Camera & CucumberRS)
# ============================================================================

LEVEL4_ROOMS: List[Dict[str, Any]] = [
    {
        "id": 1,
        "key": "room-401",
        "name": "Room 401",
        "name_th": "ห้อง 401 (ห้องนอน/นั่งเล่น)",
        "label": "Room 401",
        "room_type": "resident",
        "floor_id": 4,
        "facility_id": 1,
        "capacity": 1,
        "default_node": "TSIM_001",
        "x": 465.6,
        "y": 315.6,
        "w": 996.9,
        "h": 465.6,
        "device_id": 1,
    },
    {
        "id": 2,
        "key": "room-402",
        "name": "Room 402",
        "name_th": "ห้อง 402",
        "label": "Room 402",
        "room_type": "resident",
        "floor_id": 4,
        "facility_id": 1,
        "capacity": 1,
        "default_node": "TSIM_002",
        "x": 465.6,
        "y": 803.1,
        "w": 996.9,
        "h": 465.6,
        "device_id": 2,
    },
    {
        "id": 3,
        "key": "room-403",
        "name": "Room 403",
        "name_th": "ห้อง 403",
        "label": "Room 403",
        "room_type": "resident",
        "floor_id": 4,
        "facility_id": 1,
        "capacity": 1,
        "default_node": "TSIM_003",
        "x": 465.6,
        "y": 1290.6,
        "w": 996.9,
        "h": 465.6,
        "device_id": 3,
    },
    {
        "id": 4,
        "key": "room-404",
        "name": "Room 404",
        "name_th": "ห้อง 404",
        "label": "Room 404",
        "room_type": "resident",
        "floor_id": 4,
        "facility_id": 1,
        "capacity": 1,
        "default_node": "TSIM_004",
        "x": 465.6,
        "y": 1778.1,
        "w": 996.9,
        "h": 465.6,
        "device_id": 4,
    },
    {
        "id": 5,
        "key": "room-405",
        "name": "Room 405",
        "name_th": "ห้อง 405",
        "label": "Room 405",
        "room_type": "resident",
        "floor_id": 4,
        "facility_id": 1,
        "capacity": 1,
        "default_node": "TSIM_005",
        "x": 465.6,
        "y": 2265.6,
        "w": 996.9,
        "h": 465.6,
        "device_id": 5,
    },
    {
        "id": 6,
        "key": "room-406",
        "name": "Room 406",
        "name_th": "ห้อง 406",
        "label": "Room 406",
        "room_type": "resident",
        "floor_id": 4,
        "facility_id": 1,
        "capacity": 1,
        "default_node": "TSIM_006",
        "x": 2437.5,
        "y": 321.9,
        "w": 1118.8,
        "h": 528.1,
        "device_id": 6,
    },
    {
        "id": 7,
        "key": "bathroom",
        "name": "Bathroom",
        "name_th": "ห้องน้ำ",
        "label": "Bathroom",
        "room_type": "bathroom",
        "floor_id": 4,
        "facility_id": 1,
        "capacity": 1,
        "default_node": "TSIM_004",
        "x": 2437.5,
        "y": 890.6,
        "w": 1118.8,
        "h": 518.8,
        "device_id": 7,
    },
    {
        "id": 8,
        "key": "dining",
        "name": "Dining Room",
        "name_th": "ห้องรับประทานอาหาร/ครัว",
        "label": "Dining Room",
        "room_type": "dining",
        "floor_id": 4,
        "facility_id": 1,
        "capacity": 4,
        "default_node": "TSIM_003",
        "x": 2437.5,
        "y": 1453.1,
        "w": 1118.8,
        "h": 615.6,
        "device_id": 8,
    },
]

GROUND_ROOMS: List[Dict[str, Any]] = [
    {"id": 101, "key": "restroom_nw", "name": "Accessible Restroom (NW)", "name_th": "ห้องน้ำผู้ใช้วีลแชร์ (ทิศเหนือ)", "label": "Accessible Restroom", "room_type": "bathroom", "floor_id": 1, "facility_id": 1, "capacity": 1, "x": 179.6, "y": 272.8, "w": 621.5, "h": 604.3, "device_id": 101, "default_node": "TSIM_101"},
    {"id": 102, "key": "utility", "name": "Utility / Laundry", "name_th": "ห้องซักรีดและอุปกรณ์", "label": "Utility / Laundry", "room_type": "utility", "floor_id": 1, "facility_id": 1, "capacity": 2, "x": 811.5, "y": 272.8, "w": 700.9, "h": 604.3, "device_id": 102, "default_node": "TSIM_102"},
    {"id": 103, "key": "shared_lounge", "name": "Shared Care Lounge", "name_th": "ห้องนั่งเล่นส่วนกลาง", "label": "Shared Care Lounge", "room_type": "lounge", "floor_id": 1, "facility_id": 1, "capacity": 6, "x": 186.5, "y": 877.1, "w": 1578.0, "h": 1743.8, "device_id": 103, "default_node": "TSIM_103"},
    {"id": 104, "key": "main_hall", "name": "Main Hall", "name_th": "โถงทางเดินหลัก", "label": "Main Hall", "room_type": "common_area", "floor_id": 1, "facility_id": 1, "capacity": 10, "x": 1688.5, "y": 276.2, "w": 1595.3, "h": 2859.1, "device_id": 104, "default_node": "TSIM_104"},
    {"id": 105, "key": "physiotherapy", "name": "Physiotherapy Room", "name_th": "ห้องกายภาพบำบัด", "label": "Physiotherapy Room", "room_type": "therapy", "floor_id": 1, "facility_id": 1, "capacity": 4, "x": 3301.1, "y": 269.3, "w": 1346.7, "h": 1215.5, "device_id": 105, "default_node": "TSIM_105"},
    {"id": 106, "key": "nurses_station", "name": "Nurses' Station", "name_th": "เคาน์เตอร์พยาบาล", "label": "Nurses' Station", "room_type": "staff", "floor_id": 1, "facility_id": 1, "capacity": 4, "x": 3304.6, "y": 1512.4, "w": 1350.1, "h": 997.9, "device_id": 106, "default_node": "TSIM_106"},
    {"id": 107, "key": "restroom_se", "name": "Accessible Restroom (SE)", "name_th": "ห้องน้ำผู้ใช้วีลแชร์ (ทิศใต้)", "label": "Accessible Restroom", "room_type": "bathroom", "floor_id": 1, "facility_id": 1, "capacity": 1, "x": 3636.0, "y": 2524.2, "w": 621.5, "h": 607.7, "device_id": 107, "default_node": "TSIM_107"},
    {"id": 108, "key": "treatment_room", "name": "Treatment Room", "name_th": "ห้องตรวจรักษา", "label": "Treatment Room", "room_type": "treatment", "floor_id": 1, "facility_id": 1, "capacity": 2, "x": 4268.0, "y": 2527.6, "w": 618.1, "h": 607.7, "device_id": 108, "default_node": "TSIM_108"},
    {"id": 109, "key": "entry_south", "name": "Main Entrance", "name_th": "ทางเข้าหลัก", "label": "Main Entrance", "room_type": "entry", "floor_id": 1, "facility_id": 1, "capacity": 4, "x": 2303.2, "y": 3273.5, "w": 631.9, "h": 372.9, "device_id": 109, "default_node": "TSIM_109"},
    {"id": 110, "key": "garden_southwest", "name": "Southwest Garden Edge", "name_th": "สวนหย่อมทิศตะวันตกเฉียงใต้", "label": "Southwest Garden Edge", "room_type": "outdoor", "floor_id": 1, "facility_id": 1, "capacity": 4, "x": 1315.6, "y": 3079.7, "w": 811.5, "h": 500.7, "device_id": 110, "default_node": "TSIM_110"},
    {"id": 111, "key": "garden_southeast", "name": "Southeast Garden Edge", "name_th": "สวนหย่อมทิศตะวันออกเฉียงใต้", "label": "Southeast Garden Edge", "room_type": "outdoor", "floor_id": 1, "facility_id": 1, "capacity": 4, "x": 2303.2, "y": 3273.5, "w": 811.5, "h": 500.7, "device_id": 111, "default_node": "TSIM_111"},
]

MODEL3D_ROOMS: List[Dict[str, Any]] = [
    {
        "id": 201,
        "key": "livingroom",
        "name": "Living Room (3D Model)",
        "name_th": "ห้องนั่งเล่น (โมเดล 3D)",
        "label": "Living Room",
        "room_type": "livingroom",
        "floor_id": 10,
        "facility_id": 2,
        "capacity": 2,
        "default_node": "TSIM_001",
        "x": 250,
        "y": 300,
        "w": 2100,
        "h": 2000,
        "device_id": 1,
    },
    {
        "id": 202,
        "key": "bedroom",
        "name": "Bedroom (3D Model)",
        "name_th": "ห้องนอน (โมเดล 3D)",
        "label": "Bedroom",
        "room_type": "bedroom",
        "floor_id": 10,
        "facility_id": 2,
        "capacity": 1,
        "default_node": "TSIM_002",
        "x": 2650,
        "y": 300,
        "w": 2100,
        "h": 2000,
        "device_id": 2,
    },
    {
        "id": 203,
        "key": "kitchen",
        "name": "Kitchen (3D Model)",
        "name_th": "ห้องครัว (โมเดล 3D)",
        "label": "Kitchen",
        "room_type": "kitchen",
        "floor_id": 10,
        "facility_id": 2,
        "capacity": 2,
        "default_node": "TSIM_003",
        "x": 250,
        "y": 2600,
        "w": 2100,
        "h": 2000,
        "device_id": 3,
    },
    {
        "id": 204,
        "key": "bathroom_3d",
        "name": "Bathroom (3D Model)",
        "name_th": "ห้องน้ำ (โมเดล 3D)",
        "label": "Bathroom",
        "room_type": "bathroom",
        "floor_id": 10,
        "facility_id": 2,
        "capacity": 1,
        "default_node": "TSIM_004",
        "x": 2650,
        "y": 2600,
        "w": 2100,
        "h": 2000,
        "device_id": 4,
    },
]

CanonicalRooms: List[Dict[str, Any]] = LEVEL4_ROOMS + GROUND_ROOMS + MODEL3D_ROOMS
ROOM_KEY_TO_META: Dict[str, Dict[str, Any]] = {r["key"]: r for r in CanonicalRooms}
ROOM_ID_TO_META: Dict[int, Dict[str, Any]] = {r["id"]: r for r in CanonicalRooms}


def resolve_room_meta(room_ref: Any) -> Dict[str, Any]:
    """Resolve room metadata from int ID, string ID ('room-1', 'room-401'), or name ('Room 401', 'Living Room')."""
    if isinstance(room_ref, int) and room_ref in ROOM_ID_TO_META:
        return ROOM_ID_TO_META[room_ref]
    raw = str(room_ref or "").strip().lower()
    if raw.isdigit() and int(raw) in ROOM_ID_TO_META:
        return ROOM_ID_TO_META[int(raw)]
    if raw.startswith("room-") and raw[5:].isdigit() and int(raw[5:]) in ROOM_ID_TO_META:
        return ROOM_ID_TO_META[int(raw[5:])]
    cleaned = raw.replace(" ", "").replace("_", "").replace("-", "")
    aliases = {
        "room401": "room-401", "401": "room-401", "livingroom": "room-401", "living": "room-401", "ห้องนั่งเล่น": "room-401",
        "room402": "room-402", "402": "room-402", "bedroom": "room-402", "bed": "room-402", "ห้องนอน": "room-402",
        "room403": "room-403", "403": "room-403",
        "room404": "room-404", "404": "room-404",
        "room405": "room-405", "405": "room-405",
        "room406": "room-406", "406": "room-406",
        "bathroom": "bathroom", "bath": "bathroom", "ห้องน้ำ": "bathroom", "bathroom3d": "bathroom",
        "dining": "dining", "diningroom": "dining", "kitchen": "dining", "ห้องครัว": "dining", "ครัว": "dining",
    }
    key = aliases.get(cleaned, aliases.get(raw, "room-401"))
    return ROOM_KEY_TO_META.get(key, LEVEL4_ROOMS[0])


# ============================================================================
# In-Memory State Synced with Hardware & SQLite DB
# ============================================================================

_FACILITIES: List[Dict[str, Any]] = [
    {
        "id": 1,
        "name": "WheelSense Care Facility",
        "address": "100 WheelSense Care Blvd, Level 4 & Ground Level",
        "description": "Smart Care Facility with interactive architectural floorplans, fall detection & IoT controls",
        "is_active": True,
        "floor_count": 2,
        "room_count": 19,
    },
    {
        "id": 2,
        "name": "WheelSense Smart Home (3D Model)",
        "address": "3D Miniature Smart Home Prototype (4 Rooms)",
        "description": "Connected to physical ESP32-CAM (TSIM) & ESP32-S2 (CucumberRS) hardware",
        "is_active": True,
        "floor_count": 1,
        "room_count": 4,
    },
]

_FLOORS: List[Dict[str, Any]] = [
    {
        "id": 4,
        "facility_id": 1,
        "floor_number": 4,
        "name": "Level 4 - Resident Wing",
        "room_count": 8,
        "map_data": {
            "wheelsense_background": {
                "url": "/floorplans/wheelsense_floorplan_level4.svg",
                "x": 0,
                "y": 0,
                "width": 5000,
                "height": 3125,
                "opacity": 0.8,
                "reference": True,
            }
        },
    },
    {
        "id": 1,
        "facility_id": 1,
        "floor_number": 1,
        "name": "Ground Level - Shared Care",
        "room_count": 11,
        "map_data": {
            "wheelsense_background": {
                "url": "/floorplans/wheelsense_shared_care_ground_level.svg",
                "x": 0,
                "y": 0,
                "width": 5000,
                "height": 3750,
                "opacity": 0.8,
                "reference": True,
            }
        },
    },
    {
        "id": 10,
        "facility_id": 2,
        "floor_number": 1,
        "name": "1st Floor — 3D Smart Home (4 Rooms)",
        "room_count": 4,
        "map_data": {},
    },
]

_FLOORPLAN_LAYOUTS: Dict[int, Dict[str, Any]] = {
    4: {
        "version": 3,
        "canvas": {"aspectRatio": "16:10"},
        "background": {
            "url": "/floorplans/wheelsense_floorplan_level4.svg",
            "x": 0,
            "y": 0,
            "width": 5000,
            "height": 3125,
            "opacity": 0.8,
            "reference": True,
        },
        "rooms": [
            {
                "id": f"room-{r['id']}",
                "room_id": r["id"],
                "label": r["label"],
                "name": r["name"],
                "room_type": r["room_type"],
                "x": r["x"],
                "y": r["y"],
                "w": r["w"],
                "h": r["h"],
                "device_id": r["device_id"],
                "node_device_id": r["default_node"],
                "power_kw": 0.12,
                "points": None,
                "locked": False,
            }
            for r in LEVEL4_ROOMS
        ],
    },
    1: {
        "version": 3,
        "canvas": {"aspectRatio": "4:3"},
        "background": {
            "url": "/floorplans/wheelsense_shared_care_ground_level.svg",
            "x": 0,
            "y": 0,
            "width": 5000,
            "height": 3750,
            "opacity": 0.8,
            "reference": True,
        },
        "rooms": [
            {
                "id": f"room-{r['id']}",
                "room_id": r["id"],
                "label": r["label"],
                "name": r["name"],
                "room_type": r["room_type"],
                "x": r["x"],
                "y": r["y"],
                "w": r["w"],
                "h": r["h"],
                "device_id": r["device_id"],
                "node_device_id": r["default_node"],
                "power_kw": 0.08,
                "points": None,
                "locked": False,
            }
            for r in GROUND_ROOMS
        ],
    },
    10: {
        "version": 3,
        "canvas": {"aspectRatio": "16:10"},
        "rooms": [
            {
                "id": f"room-{r['id']}",
                "room_id": r["id"],
                "label": r["label"],
                "name": r["name"],
                "room_type": r["room_type"],
                "x": r["x"],
                "y": r["y"],
                "w": r["w"],
                "h": r["h"],
                "device_id": r["device_id"],
                "node_device_id": r["default_node"],
                "power_kw": 0.12,
                "points": None,
                "locked": False,
            }
            for r in MODEL3D_ROOMS
        ],
    },
}

_FLOORPLAN_LAYOUT: Dict[str, Any] = _FLOORPLAN_LAYOUTS[4]

_V2_ALERTS: List[Dict[str, Any]] = []
_NEXT_ALERT_ID: int = 1
_LAST_AUTO_FALL_TS: float = 0.0

_DEVICE_ACTIVITY: List[Dict[str, Any]] = [
    {
        "id": "act-init-1",
        "category": "smart_control",
        "action": "system_ready",
        "actor_role": "system",
        "actor_user_id": 1,
        "device_id": "CucumberRS",
        "ha_device_id": 1,
        "entity_id": "light.livingroom_light",
        "room_id": 1,
        "patient_id": 1,
        "status": "success",
        "message": "3D Smart Home hardware bridge initialized (4 rooms ready)",
        "details": {"rooms": ["Living Room", "Bedroom", "Kitchen", "Bathroom"]},
        "occurred_at": datetime.utcnow().isoformat() + "Z",
    }
]

_CHAT_CONVERSATIONS: Dict[str, Dict[str, Any]] = {}
_CHAT_MESSAGES: Dict[str, List[Dict[str, Any]]] = {}
_CHAT_ACTIONS: Dict[str, Dict[str, Any]] = {}


def _log_device_activity(
    category: str,
    action: str,
    message: str,
    device_id: Optional[str] = None,
    ha_device_id: Optional[int] = None,
    entity_id: Optional[str] = None,
    room_id: Optional[int] = 1,
    status: str = "success",
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    entry = {
        "id": f"act-{int(time.time() * 1000)}-{len(_DEVICE_ACTIVITY) + 1}",
        "category": category,
        "action": action,
        "actor_role": "admin",
        "actor_user_id": 1,
        "device_id": device_id,
        "ha_device_id": ha_device_id,
        "entity_id": entity_id,
        "room_id": room_id,
        "patient_id": 1,
        "status": status,
        "message": message,
        "details": details or {},
        "occurred_at": datetime.utcnow().isoformat() + "Z",
    }
    _DEVICE_ACTIVITY.insert(0, entry)
    del _DEVICE_ACTIVITY[100:]
    return entry


def create_v2_alert_internal(
    alert_type: str = "fall",
    severity: str = "critical",
    title: Optional[str] = None,
    description: Optional[str] = None,
    room_ref: Any = "livingroom",
    patient_id: Optional[int] = 1,
    device_id: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a V2 Alert and store it in _V2_ALERTS so it shows on /admin, /admin/alerts, and Floorplan."""
    global _NEXT_ALERT_ID
    room_meta = resolve_room_meta(room_ref)
    now_iso = datetime.utcnow().isoformat() + "Z"
    alert_id = _NEXT_ALERT_ID
    _NEXT_ALERT_ID += 1

    default_titles = {
        "fall": f"⚠️ Fall Detected in {room_meta['name']} ({room_meta['name_th']})",
        "emergency_sos": f"🆘 Emergency SOS in {room_meta['name']}",
        "sos": f"🆘 Emergency SOS in {room_meta['name']}",
        "appliance_left_on": f"💡 Forgotten Appliance in {room_meta['name']}",
        "abnormal_hr": f"❤️ Abnormal Heart Rate in {room_meta['name']}",
        "low_battery": "🔋 Low Battery Warning",
        "device_offline": "📡 Device Offline Warning",
        "manual_test": f"🧪 Demo Alert in {room_meta['name']}",
    }
    resolved_title = title or default_titles.get(alert_type, f"Alert: {alert_type} in {room_meta['name']}")
    resolved_desc = description or f"Detected {alert_type} event in {room_meta['name']} ({room_meta['name_th']})."

    alert_obj: Dict[str, Any] = {
        "id": alert_id,
        "workspace_id": 1,
        "patient_id": patient_id,
        "patient_name": "Somchai Sukjai" if patient_id else None,
        "device_id": device_id or room_meta["default_node"],
        "room_id": room_meta["id"],
        "room_name": room_meta["name"],
        "alert_type": alert_type,
        "severity": severity if severity in ("critical", "warning", "info") else "critical",
        "status": "active",
        "title": resolved_title,
        "description": resolved_desc,
        "data": {
            **(data or {}),
            "room_id": room_meta["id"],
            "room_key": room_meta["key"],
            "room_name": room_meta["name"],
            "snapshot_url": f"/api/video/{room_meta['key']}?t={int(time.time())}",
        },
        "timestamp": now_iso,
        "created_at": now_iso,
        "triggered_at": now_iso,
        "acknowledged_by": None,
        "acknowledged_at": None,
        "resolved_at": None,
        "resolution_note": "",
    }
    _V2_ALERTS.insert(0, alert_obj)
    _log_device_activity(
        category="alert",
        action=f"alert_{alert_type}",
        message=resolved_title,
        device_id=alert_obj["device_id"],
        room_id=room_meta["id"],
        status="warning" if severity != "info" else "info",
        details={"alert_id": alert_id, "severity": severity, "alert_type": alert_type},
    )
    return alert_obj


# ============================================================================
# JWT & Auth Users
# ============================================================================

MOCK_USERS: Dict[str, Dict[str, Any]] = {
    "eleanor.price": {
        "id": 1,
        "username": "eleanor.price",
        "email": "eleanor.price@wheelsense.local",
        "phone": "+1 555 401 0101",
        "role": "patient",
        "is_active": True,
        "caregiver_id": None,
        "patient_id": 1,
        "first_name": "Eleanor",
        "last_name": "Price",
        "profile_image_url": None,
    },
    "nina.patel": {
        "id": 2,
        "username": "nina.patel",
        "email": "nina.patel@wheelsense.local",
        "phone": "+1 555 401 0103",
        "role": "caregiver",
        "is_active": True,
        "caregiver_id": 1,
        "patient_id": None,
        "first_name": "Nina",
        "last_name": "Patel",
        "profile_image_url": None,
    },
    "admin": {
        "id": 3,
        "username": "admin",
        "email": "admin@wheelsense.local",
        "phone": "+1 555 401 0100",
        "role": "admin",
        "is_active": True,
        "caregiver_id": None,
        "patient_id": 1,
        "first_name": "System",
        "last_name": "Admin",
        "profile_image_url": None,
    },
}

USER_ALIASES: Dict[str, str] = {
    "patient": "eleanor.price",
    "somchai": "eleanor.price",
    "eleanor": "eleanor.price",
    "eleanor.price": "eleanor.price",
    "caregiver": "nina.patel",
    "nurse_joy": "nina.patel",
    "somsri": "nina.patel",
    "nina": "nina.patel",
    "nina.patel": "nina.patel",
    "head_nurse": "nina.patel",
    "admin": "admin",
}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _make_jwt(user: Dict[str, Any]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": str(user["id"]),
        "username": user["username"],
        "role": user["role"],
        "patient_id": user.get("patient_id"),
        "caregiver_id": user.get("caregiver_id"),
        "sid": f"sess-{user['id']}",
        "exp": int(time.time()) + 86400 * 7,
    }
    h_enc = _b64url(json.dumps(header).encode("utf-8"))
    p_enc = _b64url(json.dumps(payload).encode("utf-8"))
    sig = _b64url(b"wheelsense-v2-signature")
    return f"{h_enc}.{p_enc}.{sig}"


def _user_from_request(request: Request) -> Dict[str, Any]:
    auth = request.headers.get("authorization") or ""
    token = ""
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    elif "ws_token" in request.cookies:
        token = request.cookies["ws_token"]
    if token and "." in token:
        try:
            parts = token.split(".")
            padded = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
            uname = payload.get("username")
            if uname:
                target_uname = USER_ALIASES.get(uname.lower(), uname)
                if target_uname in MOCK_USERS:
                    return MOCK_USERS[target_uname]
        except Exception:
            pass
    return MOCK_USERS["admin"]


# ============================================================================
# 1. System Health
# ============================================================================


@router.get("/health")
async def v2_health_check(request: Request):
    db = getattr(request.app.state, "db", None)
    mqtt_handler = getattr(request.app.state, "mqtt_handler", None)
    db_ok = bool(db and getattr(db, "is_connected", False))
    mqtt_ok = bool(mqtt_handler and getattr(mqtt_handler, "is_connected", False))
    return {
        "status": "ok",
        "healthy": True,
        "model_ready": True,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "services": {
            "api": "online",
            "database": "online" if db_ok else "offline",
            "mqtt": "online" if mqtt_ok else "offline",
            "automation": "online",
        },
    }


# ============================================================================
# 2. Authentication & Profile
# ============================================================================


@router.get("/auth/session")
@router.get("/api/auth/session")
async def get_session(request: Request):
    auth = request.headers.get("authorization") or ""
    token = ""
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    elif "ws_token" in request.cookies:
        token = request.cookies["ws_token"]

    if token and "." in token:
        try:
            parts = token.split(".")
            padded = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
            uname = payload.get("username")
            user = MOCK_USERS.get(uname, MOCK_USERS["admin"])
            return {
                "authenticated": True,
                "user": user,
            }
        except Exception:
            pass

    return {
        "authenticated": False,
        "user": None,
    }


@router.post("/auth/login")
@router.post("/api/auth/login")
async def login(request: Request, response: Response):
    from urllib.parse import parse_qs

    username = "admin"
    ctype = (request.headers.get("content-type") or "").lower()
    try:
        if "application/json" in ctype:
            payload = await request.json()
            username = str(payload.get("username", "admin")).strip()
        else:
            raw_bytes = await request.body()
            raw_str = raw_bytes.decode("utf-8", errors="ignore")
            parsed = parse_qs(raw_str)
            if "username" in parsed and parsed["username"]:
                username = str(parsed["username"][0]).strip()
            elif raw_str.strip().startswith("{"):
                payload = json.loads(raw_str)
                username = str(payload.get("username", "admin")).strip()
    except Exception:
        username = "admin"

    canonical_user = USER_ALIASES.get(username.lower(), username)
    user = MOCK_USERS.get(canonical_user, MOCK_USERS.get("admin"))
    token = _make_jwt(user)
    response.set_cookie(
        key="ws_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
        max_age=86400 * 7,
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "session_id": f"sess-{user['id']}",
        "user": user,
    }


@router.get("/auth/me")
async def get_me(request: Request):
    return _user_from_request(request)


@router.get("/auth/me/profile")
async def get_me_profile(request: Request):
    user = _user_from_request(request)
    return {
        "user": user,
        "linked_caregiver": {
            "id": 1,
            "first_name": "Nina",
            "last_name": "Patel",
            "department": "Smart Home Care",
            "employee_code": "CG-001",
            "specialty": "Elderly & Wheelchair Care",
            "license_number": "RN-10293",
            "emergency_contact_name": "Control Center",
            "emergency_contact_phone": "1669",
            "photo_url": None,
        }
        if user.get("caregiver_id")
        else None,
        "linked_patient": {
            "id": 1,
            "first_name": "Eleanor",
            "last_name": "Price",
            "nickname": "Chai",
            "date_of_birth": "1955-04-12",
            "gender": "male",
            "height_cm": 168,
            "weight_kg": 65,
            "blood_type": "O",
            "allergies": [],
            "notes": "Uses wheelchair in 4-room Smart Home",
            "photo_url": "",
            "is_active": True,
        }
        if user.get("patient_id")
        else None,
    }


@router.patch("/auth/me/profile")
async def update_me_profile(request: Request, payload: Dict[str, Any] = Body(default={})):
    user = _user_from_request(request)
    for k in ("email", "phone", "profile_image_url"):
        if k in payload:
            user[k] = payload[k]
    return await get_me_profile(request)


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("ws_token", path="/")
    return {"status": "ok"}


@router.get("/auth/sessions")
async def list_sessions(request: Request):
    user = _user_from_request(request)
    return [
        {
            "id": f"sess-{user['id']}",
            "user_id": user["id"],
            "device_info": "WheelSense Dashboard Browser",
            "ip_address": "127.0.0.1",
            "created_at": datetime.utcnow().isoformat() + "Z",
            "last_seen_at": datetime.utcnow().isoformat() + "Z",
            "is_current": True,
        }
    ]


@router.delete("/auth/sessions/{session_id}")
async def delete_session(session_id: str):
    return {"status": "deleted", "id": session_id}


@router.post("/auth/impersonate/start")
async def impersonate_start(response: Response, payload: Dict[str, Any] = Body(default={})):
    target_id = payload.get("user_id", 1)
    target_user = next((u for u in MOCK_USERS.values() if u["id"] == target_id), None)
    if not target_user:
        target_user = MOCK_USERS.get("eleanor.price", MOCK_USERS["admin"])
    token = _make_jwt(target_user)
    response.set_cookie(key="ws_token", value=token, httponly=True, samesite="lax", secure=False, path="/")
    return {"access_token": token, "token_type": "bearer", "user": target_user}


@router.post("/auth/impersonate/stop")
async def impersonate_stop(response: Response):
    token = _make_jwt(MOCK_USERS["admin"])
    response.set_cookie(key="ws_token", value=token, httponly=True, samesite="lax", secure=False, path="/")
    return {"access_token": token, "token_type": "bearer", "user": MOCK_USERS["admin"]}


@router.get("/users")
async def list_users():
    return list(MOCK_USERS.values())


@router.get("/users/search")
async def search_users(
    roles: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=100),
):
    users = list(MOCK_USERS.values())
    if roles:
        requested = {r.strip().lower() for r in roles.split(",") if r.strip()}
        if "head_nurse" in requested or "supervisor" in requested:
            requested.add("head_caregiver")
            requested.add("caregiver")
        users = [u for u in users if str(u.get("role", "")).lower() in requested]
    if q:
        ql = q.strip().lower()
        users = [
            u
            for u in users
            if ql in str(u.get("username", "")).lower()
            or ql in str(u.get("email", "")).lower()
            or ql in str(u.get("role", "")).lower()
        ]
    return users[:limit]


@router.post("/users")
async def create_user(payload: Dict[str, Any] = Body(...)):
    uname = payload.get("username", f"user_{len(MOCK_USERS) + 1}")
    new_user = {
        "id": len(MOCK_USERS) + 1,
        "username": uname,
        "email": payload.get("email", f"{uname}@wheelsense.local"),
        "phone": payload.get("phone", ""),
        "role": payload.get("role", "caregiver"),
        "is_active": payload.get("is_active", True),
        "caregiver_id": payload.get("caregiver_id"),
        "patient_id": payload.get("patient_id"),
    }
    MOCK_USERS[uname] = new_user
    return new_user


@router.patch("/users/{user_id}")
async def update_user(user_id: int, payload: Dict[str, Any] = Body(...)):
    for u in MOCK_USERS.values():
        if u["id"] == user_id:
            u.update(payload)
            return u
    raise HTTPException(status_code=404, detail="User not found")


# ============================================================================
# 3. Caregivers, Shifts, Tasks & Schedules
# ============================================================================

_CAREGIVERS = [
    {
        "id": 1,
        "first_name": "Nina",
        "last_name": "Patel",
        "role": "caregiver",
        "department": "Smart Home Care",
        "employee_code": "CG-001",
        "specialty": "Elderly & Wheelchair Care",
        "phone": "+1 555 401 0103",
        "email": "nina.patel@wheelsense.local",
        "is_active": True,
        "photo_url": None,
    },
]


@router.get("/caregivers")
async def list_caregivers():
    return _CAREGIVERS


@router.get("/caregivers/{caregiver_id}")
async def get_caregiver(caregiver_id: int):
    for c in _CAREGIVERS:
        if c["id"] == caregiver_id:
            return c
    return _CAREGIVERS[0]


@router.get("/caregivers/{caregiver_id}/shifts")
async def list_caregiver_shifts(caregiver_id: int):
    today = datetime.utcnow().date().isoformat()
    return [
        {
            "id": 1,
            "caregiver_id": caregiver_id,
            "shift_date": today,
            "start_time": "08:00:00",
            "end_time": "16:00:00",
            "shift_type": "regular",
            "status": "active",
        }
    ]


@router.get("/tasks")
@router.get("/tasks/")
async def list_tasks(request: Request):
    return [
        {
            "id": 1,
            "title": "Check 3D Smart Home Room Appliances",
            "description": "Verify Living Room, Bedroom, Kitchen, and Bathroom LEDs respond to MQTT control",
            "priority": "high",
            "status": "pending",
            "assigned_role": "caregiver",
            "assigned_user_id": 3,
            "patient_id": 1,
            "room_id": 1,
            "due_at": (datetime.utcnow() + timedelta(hours=2)).isoformat() + "Z",
            "created_at": datetime.utcnow().isoformat() + "Z",
        },
        {
            "id": 2,
            "title": "Monitor Wheelchair Room Transitions",
            "description": "Verify camera YOLO tracking & House Check alert when leaving lights on",
            "priority": "normal",
            "status": "in_progress",
            "assigned_role": "head_caregiver",
            "assigned_user_id": 2,
            "patient_id": 1,
            "room_id": 4,
            "due_at": (datetime.utcnow() + timedelta(hours=4)).isoformat() + "Z",
            "created_at": datetime.utcnow().isoformat() + "Z",
        },
    ]


@router.get("/schedules")
async def list_schedules(request: Request):
    now = datetime.utcnow()
    return [
        {
            "id": 1,
            "title": "Morning Physical Therapy & Wheelchair Check",
            "description": "Daily mobility check in Living Room",
            "schedule_type": "therapy",
            "status": "scheduled",
            "patient_id": 1,
            "room_id": 1,
            "assigned_role": "caregiver",
            "assigned_user_id": 3,
            "starts_at": (now + timedelta(hours=1)).isoformat() + "Z",
            "ends_at": (now + timedelta(hours=2)).isoformat() + "Z",
            "recurrence_rule": "DAILY",
        }
    ]


# ============================================================================
# 4. Facilities, Floors, Rooms & 2D Floorplan Layout (3D House 4 Rooms)
# ============================================================================


@router.get("/facilities")
async def list_facilities():
    return _FACILITIES


@router.post("/facilities")
async def create_facility(payload: Dict[str, Any] = Body(...)):
    new_f = {
        "id": len(_FACILITIES) + 1,
        "name": payload.get("name", "New Facility"),
        "address": payload.get("address", ""),
        "description": payload.get("description", ""),
        "is_active": payload.get("is_active", True),
        "floor_count": 0,
        "room_count": 0,
    }
    _FACILITIES.append(new_f)
    return new_f


@router.patch("/facilities/{facility_id}")
async def update_facility(facility_id: int, payload: Dict[str, Any] = Body(...)):
    for f in _FACILITIES:
        if f["id"] == facility_id:
            f.update(payload)
            return f
    raise HTTPException(status_code=404, detail="Facility not found")


@router.delete("/facilities/{facility_id}")
async def delete_facility(facility_id: int):
    return {"status": "deleted", "id": facility_id}


@router.get("/facilities/{facility_id}/floors")
async def list_facility_floors(facility_id: int):
    return [fl for fl in _FLOORS if fl["facility_id"] == facility_id]


@router.post("/facilities/{facility_id}/floors")
async def create_facility_floor(facility_id: int, payload: Dict[str, Any] = Body(...)):
    new_fl = {
        "id": len(_FLOORS) + 1,
        "facility_id": facility_id,
        "floor_number": payload.get("floor_number", len(_FLOORS) + 1),
        "name": payload.get("name", f"Floor {len(_FLOORS) + 1}"),
        "room_count": 0,
        "map_data": payload.get("map_data", {}),
    }
    _FLOORS.append(new_fl)
    return new_fl


@router.patch("/facilities/{facility_id}/floors/{floor_id}")
async def update_facility_floor(facility_id: int, floor_id: int, payload: Dict[str, Any] = Body(...)):
    for fl in _FLOORS:
        if fl["id"] == floor_id:
            fl.update(payload)
            return fl
    raise HTTPException(status_code=404, detail="Floor not found")


@router.delete("/facilities/{facility_id}/floors/{floor_id}")
async def delete_facility_floor(facility_id: int, floor_id: int):
    return {"status": "deleted", "id": floor_id}


def _build_v2_rooms_list() -> List[Dict[str, Any]]:
    """Build the V2 Room[] array for the 4 rooms of the 3D house, linking live TSIM cameras."""
    # Check if any live TSIM camera is connected to a room in stream_handler
    live_room_to_device: Dict[str, str] = {}
    if stream_handler and hasattr(stream_handler, "device_rooms"):
        for dev_id, rm in stream_handler.device_rooms.items():
            rm_meta = resolve_room_meta(rm)
            live_room_to_device[rm_meta["key"]] = dev_id

    out: List[Dict[str, Any]] = []
    for r in CanonicalRooms:
        node_id = live_room_to_device.get(r["key"], r["default_node"])
        out.append(
            {
                "id": r["id"],
                "name": r["name"],
                "floor_id": r["floor_id"],
                "facility_id": r["facility_id"],
                "room_type": r["room_type"],
                "capacity": r["capacity"],
                "node_device_id": node_id,
                "adjacent_rooms": [x["id"] for x in CanonicalRooms if x["id"] != r["id"] and x.get("floor_id") == r.get("floor_id")],
                "is_active": True,
            }
        )
    return out


@router.get("/rooms")
async def list_v2_rooms(floor_id: Optional[int] = Query(default=None)):
    rooms = _build_v2_rooms_list()
    if floor_id is not None:
        return [r for r in rooms if r["floor_id"] == floor_id]
    return rooms


@router.get("/rooms/{room_id}")
async def get_v2_room(room_id: str, request: Request):
    meta = resolve_room_meta(room_id)
    for r in _build_v2_rooms_list():
        if r["id"] == meta["id"]:
            return r
    raise HTTPException(status_code=404, detail="Room not found")


@router.patch("/rooms/{room_id}")
async def patch_v2_room(room_id: str, payload: Dict[str, Any] = Body(...)):
    meta = resolve_room_meta(room_id)
    if "name" in payload and payload["name"]:
        meta["name"] = str(payload["name"])
    if "node_device_id" in payload and payload["node_device_id"]:
        meta["default_node"] = str(payload["node_device_id"])
    for r in _build_v2_rooms_list():
        if r["id"] == meta["id"]:
            return r
    return _build_v2_rooms_list()[0]


@router.post("/rooms")
async def create_v2_room(payload: Dict[str, Any] = Body(...)):
    meta = resolve_room_meta(payload.get("name") or payload.get("room_type") or 1)
    for r in _build_v2_rooms_list():
        if r["id"] == meta["id"]:
            return r
    return _build_v2_rooms_list()[0]


@router.get("/floorplans/layout")
async def get_floorplan_layout(
    facility_id: int = Query(default=1),
    floor_id: int = Query(default=4),
):
    layout = _FLOORPLAN_LAYOUTS.get(floor_id) or _FLOORPLAN_LAYOUT
    return {
        "facility_id": facility_id,
        "floor_id": floor_id,
        "version": layout.get("version", 1),
        "layout_json": layout,
    }


@router.put("/floorplans/layout")
async def put_floorplan_layout(payload: Dict[str, Any] = Body(...)):
    global _FLOORPLAN_LAYOUT
    layout = payload.get("layout")
    fl_id = payload.get("floor_id", 4)
    fac_id = payload.get("facility_id", 1)
    if isinstance(layout, dict) and isinstance(layout.get("rooms"), list):
        _FLOORPLAN_LAYOUT = layout
        _FLOORPLAN_LAYOUTS[fl_id] = layout
    current = _FLOORPLAN_LAYOUTS.get(fl_id, _FLOORPLAN_LAYOUT)
    return {
        "facility_id": fac_id,
        "floor_id": fl_id,
        "version": current.get("version", 1) if isinstance(current, dict) else 1,
        "layout_json": current,
    }


# ============================================================================
# 5. Smart Home Appliances (CucumberRS 4-Room LEDs + HA Compatibility)
# ============================================================================

_APPLIANCE_TEMPS: Dict[int, float] = {5: 25.0, 8: 25.0}
_CUSTOM_HA_DEVICES: List[Dict[str, Any]] = []
_DELETED_HA_DEVICE_IDS: set = set()
_HA_DEVICE_OVERRIDES: Dict[int, Dict[str, Any]] = {}

_CUCUMBER_EXTRA_APPLIANCES = [
    {
        "id": 5,
        "room_key": "livingroom",
        "appliance": "AC",
        "device_type": "climate",
        "name": "Living Room AC (แอร์ห้องนั่งเล่น)",
        "ha_entity_id": "climate.livingroom_ac",
        "gpio": 4,
    },
    {
        "id": 6,
        "room_key": "livingroom",
        "appliance": "fan",
        "device_type": "fan",
        "name": "Living Room Fan (พัดลมห้องนั่งเล่น)",
        "ha_entity_id": "fan.livingroom_fan",
        "gpio": 20,
    },
    {
        "id": 7,
        "room_key": "livingroom",
        "appliance": "tv",
        "device_type": "switch",
        "name": "Living Room TV (ทีวีห้องนั่งเล่น)",
        "ha_entity_id": "switch.livingroom_tv",
        "gpio": 1,
    },
    {
        "id": 8,
        "room_key": "bedroom",
        "appliance": "AC",
        "device_type": "climate",
        "name": "Bedroom AC (แอร์ห้องนอน)",
        "ha_entity_id": "climate.bedroom_ac",
        "gpio": 34,
    },
    {
        "id": 9,
        "room_key": "bedroom",
        "appliance": "tv",
        "device_type": "switch",
        "name": "Bedroom TV (ทีวีห้องนอน)",
        "ha_entity_id": "switch.bedroom_tv",
        "gpio": 18,
    },
    {
        "id": 10,
        "room_key": "bedroom",
        "appliance": "alarm",
        "device_type": "switch",
        "name": "Bedroom Alarm (สัญญาณเตือนห้องนอน)",
        "ha_entity_id": "switch.bedroom_alarm",
        "gpio": 38,
    },
    {
        "id": 11,
        "room_key": "kitchen",
        "appliance": "alarm",
        "device_type": "switch",
        "name": "Kitchen Alarm (สัญญาณเตือนห้องครัว)",
        "ha_entity_id": "switch.kitchen_alarm",
        "gpio": 7,
    },
]

_CUCUMBER_LIGHT_GPIOS = {"livingroom": 21, "bedroom": 17, "kitchen": 5, "bathroom": 14}


async def _get_merged_smart_devices(db) -> List[Dict[str, Any]]:
    """
    Return the 4 canonical room lights of the 3D Smart Home (IDs 1..4) plus all
    physical CucumberRS appliances (IDs 5..11), synced with SQLite device_states.
    """
    state_map: Dict[tuple, bool] = {}

    if db:
        try:
            appliances = await db.db.appliances.find().to_list(length=100)
            for app in appliances:
                rm_meta = resolve_room_meta(app.get("room", "livingroom"))
                app_type = str(app.get("type", "light")).lower()
                if app_type == "av":
                    app_type = "ac"
                is_on = bool(app.get("state", False) or app.get("isOn", False))
                state_map[(rm_meta["key"], app_type)] = is_on
        except Exception as e:
            logger.debug(f"Could not read db.appliances: {e}")

        # Single source of truth: device_states overrides legacy appliances collection
        try:
            dev_states = await db.get_all_device_states()
            for rm_key, states_dict in (dev_states or {}).items():
                meta = resolve_room_meta(rm_key)
                if isinstance(states_dict, dict):
                    for app_name, st in states_dict.items():
                        norm_app = str(app_name).lower()
                        if norm_app == "av":
                            norm_app = "ac"
                        state_map[(meta["key"], norm_app)] = bool(st)
        except Exception as e:
            logger.debug(f"Could not read get_all_device_states: {e}")

    now_iso = datetime.utcnow().isoformat() + "Z"
    devices_out: List[Dict[str, Any]] = []

    # 1. Always include the 4 physical room LEDs on CucumberRS-Controller as IDs 1..4
    for r in CanonicalRooms:
        if r["id"] in _DELETED_HA_DEVICE_IDS:
            continue
        is_on = state_map.get((r["key"], "light"), False)
        item = {
            "id": r["id"],
            "room_id": r["id"],
            "room_name": r["name"],
            "name": f"{r['name']} Light ({r['name_th']})",
            "device_type": "light",
            "ha_entity_id": f"light.{r['key']}_light",
            "state": "on" if is_on else "off",
            "is_active": True,
            "config": {
                "room_key": r["key"],
                "appliance": "light",
                "pin_board": "CucumberRS",
                "gpio": _CUCUMBER_LIGHT_GPIOS.get(r["key"]),
            },
            "last_Changed": now_iso,
            "updated_at": now_iso,
        }
        if r["id"] in _HA_DEVICE_OVERRIDES:
            item.update(_HA_DEVICE_OVERRIDES[r["id"]])
        devices_out.append(item)

    # 2. Include all additional physical appliances wired on CucumberRS as IDs 5..11
    for ext in _CUCUMBER_EXTRA_APPLIANCES:
        did = ext["id"]
        if did in _DELETED_HA_DEVICE_IDS:
            continue
        rm = resolve_room_meta(ext["room_key"])
        app_key = ext["appliance"].lower()
        is_on = state_map.get((rm["key"], app_key), False)
        cfg: Dict[str, Any] = {
            "room_key": rm["key"],
            "appliance": ext["appliance"],
            "pin_board": "CucumberRS",
            "gpio": ext["gpio"],
        }
        if ext["device_type"] == "climate":
            cfg["temperature"] = _APPLIANCE_TEMPS.get(did, 25.0)
        item = {
            "id": did,
            "room_id": rm["id"],
            "room_name": rm["name"],
            "name": ext["name"],
            "device_type": ext["device_type"],
            "ha_entity_id": ext["ha_entity_id"],
            "state": "on" if is_on else "off",
            "is_active": True,
            "config": cfg,
            "last_Changed": now_iso,
            "updated_at": now_iso,
        }
        if did in _HA_DEVICE_OVERRIDES:
            item.update(_HA_DEVICE_OVERRIDES[did])
        devices_out.append(item)

    # 3. Append any user-created smart devices
    for custom in _CUSTOM_HA_DEVICES:
        if custom["id"] not in _DELETED_HA_DEVICE_IDS:
            devices_out.append(custom)

    return devices_out


@router.get("/ha/devices")
async def list_ha_devices(request: Request, room_id: Optional[int] = Query(default=None)):
    db = get_db(request)
    devices = await _get_merged_smart_devices(db)
    if room_id is not None:
        return [d for d in devices if d["room_id"] == room_id]
    return devices


@router.post("/ha/devices")
async def create_ha_device(request: Request, payload: Dict[str, Any] = Body(...)):
    db = get_db(request)
    devices = await _get_merged_smart_devices(db)
    new_id = max([d["id"] for d in devices] + [11]) + 1
    rm = resolve_room_meta(payload.get("room_id") or 1)
    now_iso = datetime.utcnow().isoformat() + "Z"
    dtype = str(payload.get("device_type") or "switch").lower()
    new_dev = {
        "id": new_id,
        "room_id": rm["id"],
        "room_name": rm["name"],
        "name": str(payload.get("name") or f"{rm['name']} Device"),
        "device_type": dtype,
        "ha_entity_id": str(payload.get("ha_entity_id") or f"{dtype}.{rm['key']}_{new_id}"),
        "state": "off",
        "is_active": bool(payload.get("is_active", True)),
        "config": payload.get("config") or {"room_key": rm["key"], "appliance": "light"},
        "last_Changed": now_iso,
        "updated_at": now_iso,
    }
    _CUSTOM_HA_DEVICES.append(new_dev)
    return new_dev


@router.patch("/ha/devices/{device_id}")
async def update_ha_device(device_id: int, request: Request, payload: Dict[str, Any] = Body(default={})):
    db = get_db(request)
    for custom in _CUSTOM_HA_DEVICES:
        if custom["id"] == device_id:
            for k in ("name", "device_type", "ha_entity_id", "is_active", "room_id", "config"):
                if k in payload and payload[k] is not None:
                    custom[k] = payload[k]
            custom["updated_at"] = datetime.utcnow().isoformat() + "Z"
            return custom

    overrides = _HA_DEVICE_OVERRIDES.setdefault(device_id, {})
    for k in ("name", "device_type", "ha_entity_id", "is_active", "room_id", "config"):
        if k in payload and payload[k] is not None:
            overrides[k] = payload[k]
    devices = await _get_merged_smart_devices(db)
    target = next((d for d in devices if d["id"] == device_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Smart device not found")
    return target


@router.delete("/ha/devices/{device_id}")
async def delete_ha_device(device_id: int):
    _DELETED_HA_DEVICE_IDS.add(device_id)
    return {"status": "deleted", "id": device_id}


@router.get("/ha/devices/{device_id}/state")
async def get_ha_device_state(device_id: int, request: Request):
    db = get_db(request)
    devices = await _get_merged_smart_devices(db)
    target = next((d for d in devices if d["id"] == device_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Smart device not found")
    return {
        "status": "success",
        "message": f"{target['name']} is {target['state'].upper()}",
        "data": {
            "entity_id": target["ha_entity_id"],
            "state": target["state"],
            "attributes": target.get("config", {}),
        },
    }


@router.post("/ha/devices/{device_id}/control")
async def control_ha_device(device_id: int, request: Request, payload: Dict[str, Any] = Body(default={})):
    db = get_db(request)
    mqtt_handler = get_mqtt_handler(request)
    devices = await _get_merged_smart_devices(db)
    target = next((d for d in devices if d["id"] == device_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Smart device not found")

    action = str(payload.get("action", "toggle")).lower().strip()
    params = payload.get("parameters") if isinstance(payload.get("parameters"), dict) else {}
    current_is_on = target["state"] == "on"
    value_arg: Optional[int] = None

    if action in ("turn_on", "on", "enable"):
        new_state = True
    elif action in ("turn_off", "off", "disable"):
        new_state = False
    elif action == "set_temperature":
        new_state = True
        raw_temp = params.get("temperature") or payload.get("temperature") or 25
        try:
            temp_val = float(raw_temp)
            _APPLIANCE_TEMPS[device_id] = temp_val
            value_arg = int(round(temp_val))
        except Exception:
            value_arg = 25
    elif action == "toggle":
        new_state = not current_is_on
    else:
        new_state = not current_is_on if "state" not in payload else bool(payload["state"])

    cfg = dict(target.get("config", {}))
    if device_id in _APPLIANCE_TEMPS:
        cfg["temperature"] = _APPLIANCE_TEMPS[device_id]
    room_key = cfg.get("room_key", "livingroom")
    appliance_name = cfg.get("appliance", "light")

    result = await control_appliance_core(
        db=db,
        mqtt_handler=mqtt_handler,
        room=room_key,
        appliance=appliance_name,
        state=new_state,
        value=value_arg,
    )

    state_str = "on" if new_state else "off"
    _log_device_activity(
        category="smart_control",
        action=action if action == "set_temperature" else f"turn_{state_str}",
        message=f"Controlled {target['name']} -> {state_str.upper()} via Dashboard",
        device_id="CucumberRS",
        ha_device_id=device_id,
        entity_id=target["ha_entity_id"],
        room_id=target["room_id"],
        status="success" if result.get("success", True) else "error",
        details={"room": room_key, "appliance": appliance_name, "state": new_state, "value": value_arg},
    )

    return {
        "status": "success",
        "message": f"{target['name']} turned {state_str.upper()}",
        "state": state_str,
        "device_id": device_id,
        "data": {
            "entity_id": target["ha_entity_id"],
            "state": state_str,
            "attributes": cfg,
        },
    }


# ============================================================================
# 6. Floorplan Live Presence & Camera Snapshot / Capture
# ============================================================================


async def _get_current_occupied_room_meta(db) -> Dict[str, Any]:
    """Determine which of the 4 rooms the patient/wheelchair is currently in."""
    if db:
        try:
            user_info = await db.get_user_info()
            loc = user_info.get("current_location")
            if loc:
                return resolve_room_meta(loc)
        except Exception:
            pass
        try:
            rooms = await db.get_all_rooms()
            for r in rooms:
                if r.get("isOccupied") or r.get("status", {}).get("user_detected"):
                    return resolve_room_meta(r.get("roomType") or r.get("id") or r.get("nameEn"))
        except Exception:
            pass
    return CanonicalRooms[0]


@router.get("/floorplans/presence")
async def get_floorplan_presence(
    request: Request,
    facility_id: int = Query(default=1),
    floor_id: int = Query(default=4),
):
    db = get_db(request)
    occupied_meta = await _get_current_occupied_room_meta(db)
    smart_devices = await _get_merged_smart_devices(db)
    v2_rooms = _build_v2_rooms_list()
    v2_by_id = {r["id"]: r for r in v2_rooms}
    active_alerts = [a for a in _V2_ALERTS if a["status"] != "resolved"]

    ts_sec = int(time.time())
    now_iso = datetime.utcnow().isoformat() + "Z"
    rooms_out: List[Dict[str, Any]] = []

    target_canonical = [
        r for r in CanonicalRooms
        if r.get("floor_id") == floor_id and r.get("facility_id") == facility_id
    ]
    if not target_canonical:
        target_canonical = [r for r in CanonicalRooms if r.get("floor_id") == floor_id]
    if not target_canonical:
        target_canonical = CanonicalRooms

    for r_meta in target_canonical:
        rid = r_meta["id"]
        rkey = r_meta["key"]
        r_fl = r_meta.get("floor_id", floor_id)
        r_fac = r_meta.get("facility_id", facility_id)
        r_v2 = v2_by_id.get(rid, {"node_device_id": r_meta.get("default_node", "TSIM_001")})
        is_patient_here = (occupied_meta["id"] == rid) or (occupied_meta["key"] == rkey)

        occupants = []
        if is_patient_here:
            occupants.append(
                {
                    "actor_type": "patient",
                    "actor_id": 1,
                    "display_name": "Eleanor Price (Wheelchair)",
                    "name": "Eleanor Price",
                    "subtitle": "Wheelchair • YOLOv8 Tracked",
                    "role": "patient",
                    "patient_id": 1,
                    "room_id": rid,
                    "source": "yolo_camera",
                    "care_level": "high",
                    "mobility_type": "wheelchair",
                    "updated_at": now_iso,
                    "photo_url": None,
                }
            )

        is_caregiver_here = (r_fl == 1 and rid == 106) or (r_fl == 4 and rid == 8) or (r_fl == 10 and rid == 201)
        if is_caregiver_here:
            occupants.append(
                {
                    "actor_type": "staff",
                    "actor_id": 1,
                    "display_name": "Nina Patel (Caregiver)",
                    "name": "Nina Patel",
                    "subtitle": "Caregiver • On Shift",
                    "role": "caregiver",
                    "caregiver_id": 1,
                    "room_id": rid,
                    "source": "manual",
                    "updated_at": now_iso,
                    "photo_url": None,
                }
            )

        room_smart = [d for d in smart_devices if d["room_id"] == rid]
        room_alerts = [a for a in active_alerts if a.get("room_id") == rid]

        rooms_out.append(
            {
                "room_id": rid,
                "room_name": r_meta["name"],
                "room_type": r_meta["room_type"],
                "floor_id": r_fl,
                "facility_id": r_fac,
                "node_device_id": r_v2["node_device_id"],
                "node_status": "online",
                "staleness_seconds": 2,
                "computed_at": now_iso,
                "occupants": occupants,
                "patient_hint": {
                    "patient_id": 1,
                    "first_name": "Eleanor",
                    "last_name": "Price",
                    "source": "yolo_camera",
                    "photo_url": None,
                }
                if is_patient_here
                else None,
                "prediction_hint": {
                    "device_id": r_v2["node_device_id"],
                    "predicted_room_id": rid,
                    "predicted_room_name": r_meta["name"],
                    "confidence": 0.96,
                    "model_type": "yolov8",
                    "computed_at": now_iso,
                }
                if is_patient_here
                else None,
                "patient_count": len([o for o in occupants if o["actor_type"] == "patient"]),
                "staff_count": len([o for o in occupants if o["actor_type"] == "staff"]),
                "alert_count": len(room_alerts),
                "smart_devices_summary": room_smart,
                "ha_devices": room_smart,
                "camera_summary": {
                    "device_id": r_v2["node_device_id"],
                    "camera_device_id": r_v2["node_device_id"],
                    "has_camera": True,
                    "online": True,
                    "capture_available": True,
                    "latest_photo_id": rid,
                    "latest_photo_url": f"/api/video/{rkey}?t={ts_sec}",
                    "captured_at": now_iso,
                },
            }
        )

    return {
        "facility_id": facility_id,
        "floor_id": floor_id,
        "rooms": rooms_out,
        "computed_at": now_iso,
        "timestamp": now_iso,
    }


@router.post("/floorplans/rooms/{room_id}/capture")
async def capture_floorplan_room(room_id: str, request: Request):
    meta = resolve_room_meta(room_id)
    ts_ms = int(time.time() * 1000)
    now_iso = datetime.utcnow().isoformat() + "Z"
    url = f"/api/video/{meta['key']}?t={ts_ms}"
    _log_device_activity(
        category="camera",
        action="snapshot_capture",
        message=f"Captured live camera frame for {meta['name']}",
        device_id=meta["default_node"],
        room_id=meta["id"],
        status="success",
        details={"url": url},
    )
    return {
        "status": "success",
        "message": f"Captured live frame from {meta['default_node']} ({meta['name']})",
        "room_id": meta["id"],
        "latest_photo": {
            "url": url,
            "captured_at": now_iso,
        },
    }


@router.get("/video/{room_id}")
async def get_v2_video_frame(room_id: str, request: Request):
    """
    Serve the latest JPEG frame from TsimCam-Controller (via stream_handler.latest_frames).
    If only one physical TSIM camera is connected (e.g. in bathroom or livingroom),
    falls back to the active camera stream or renders a live SVG status preview card.
    """
    meta = resolve_room_meta(room_id)
    rkey = meta["key"]

    frame_bytes: Optional[bytes] = None
    if stream_handler and hasattr(stream_handler, "latest_frames"):
        frame_bytes = stream_handler.latest_frames.get(rkey)
        if not frame_bytes:
            # If the user only has 1 physical TSIM camera board connected, show its live feed
            for k, v in stream_handler.latest_frames.items():
                if v:
                    frame_bytes = v
                    break

    if frame_bytes:
        return FastAPIResponse(
            content=frame_bytes,
            media_type="image/jpeg",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
        )

    # Render an informative SVG live-status card when waiting for ESP32-CAM WebSocket frames
    db = getattr(request.app.state, "db", None)
    occupied = await _get_current_occupied_room_meta(db)
    smart = await _get_merged_smart_devices(db)
    room_light = next((d for d in smart if d["room_id"] == meta["id"] and d["device_type"] == "light"), None)
    light_on = room_light and room_light["state"] == "on"
    is_occ = occupied["id"] == meta["id"]
    now_str = datetime.now().strftime("%H:%M:%S")

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#1e293b"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#bg)"/>
      <rect x="20" y="20" width="600" height="320" rx="16" fill="none" stroke="#334155" stroke-width="2"/>
      <circle cx="52" cy="54" r="8" fill="{'#22c55e' if is_occ else '#38bdf8'}"/>
      <text x="70" y="60" fill="#f8fafc" font-family="sans-serif" font-size="20" font-weight="bold">
        {meta['name']} ({meta['name_th']}) — Camera {meta['default_node']}
      </text>
      <text x="500" y="58" fill="#94a3b8" font-family="monospace" font-size="15">{now_str}</text>
      <rect x="44" y="96" width="552" height="170" rx="12" fill="#090d16" stroke="#1e293b"/>
      <text x="320" y="165" text-anchor="middle" fill="#e2e8f0" font-family="sans-serif" font-size="22" font-weight="bold">
        {'🦽 Wheelchair Present in ' + meta['name'] if is_occ else '📹 Waiting for TSIM Camera Stream (Port 8765)'}
      </text>
      <text x="320" y="205" text-anchor="middle" fill="{'#facc15' if light_on else '#94a3b8'}" font-family="sans-serif" font-size="17">
        💡 Room Light: {'ON (เปิดไฟอยู่)' if light_on else 'OFF (ปิดไฟ)'}
      </text>
      <text x="320" y="308" text-anchor="middle" fill="#64748b" font-family="sans-serif" font-size="14">
        WheelSense 3D Smart Home • YOLOv8 Wheelchair &amp; Fall Detection Active
      </text>
    </svg>"""
    return FastAPIResponse(
        content=svg.encode("utf-8"),
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


# ============================================================================
# 7. Hardware Devices Fleet (/devices, /devices/{id}, /devices/activity)
# ============================================================================


async def _build_v2_hardware_devices(request: Request) -> List[Dict[str, Any]]:
    db = get_db(request)
    mqtt_handler = get_mqtt_handler(request)
    occupied = await _get_current_occupied_room_meta(db)

    live_nodes = stream_handler.get_all_device_status() if stream_handler else []
    live_by_id = {d.get("device_id"): d for d in live_nodes if d.get("device_id")}
    now_iso = datetime.utcnow().isoformat() + "Z"

    out: List[Dict[str, Any]] = []

    # 1. Camera nodes (TSIM_001..004 for the 4 rooms)
    configured_cams = [
        {"device_id": "TSIM_001", "room": "livingroom", "name": "ESP32-CAM TSIM_001 (Living Room)"},
        {"device_id": "TSIM_002", "room": "bathroom", "name": "ESP32-CAM TSIM_002 (Bathroom)"},
        {"device_id": "TSIM_003", "room": "bedroom", "name": "ESP32-CAM TSIM_003 (Bedroom)"},
        {"device_id": "TSIM_004", "room": "kitchen", "name": "ESP32-CAM TSIM_004 (Kitchen)"},
    ]

    seen_cam_ids = set()
    for n in live_nodes:
        did = n.get("device_id")
        if not did:
            continue
        seen_cam_ids.add(did)
        rm_meta = resolve_room_meta(n.get("room") or "bathroom")
        out.append(
            {
                "id": len(out) + 1,
                "workspace_id": 1,
                "device_id": did,
                "name": f"ESP32-CAM {did} ({rm_meta['name']})",
                "display_name": f"ESP32-CAM {did} ({rm_meta['name']})",
                "device_type": "camera_node",
                "hardware_type": "node",
                "type": "camera_node",
                "status": "online" if n.get("online", True) else "offline",
                "room_id": rm_meta["id"],
                "room_name": rm_meta["name"],
                "assigned_patient_id": None,
                "assigned_patient_name": None,
                "battery_percent": 100,
                "battery_level": 100,
                "firmware_version": "v2.4-TSIM-OV2640",
                "ip_address": n.get("ip") or "Auto-UDP-5555",
                "last_seen": n.get("last_seen") or now_iso,
                "last_heartbeat_at": n.get("last_seen") or now_iso,
                "camera_Working": True,
                "camera_working": True,
                "config": {"stream_port": 8765, "room": rm_meta["key"]},
            }
        )

    for cfg_cam in configured_cams:
        if cfg_cam["device_id"] not in seen_cam_ids:
            rm_meta = resolve_room_meta(cfg_cam["room"])
            out.append(
                {
                    "id": len(out) + 1,
                    "workspace_id": 1,
                    "device_id": cfg_cam["device_id"],
                    "name": cfg_cam["name"],
                    "display_name": cfg_cam["name"],
                    "device_type": "camera_node",
                    "hardware_type": "node",
                    "type": "camera_node",
                    "status": "standby",
                    "room_id": rm_meta["id"],
                    "room_name": rm_meta["name"],
                    "assigned_patient_id": None,
                    "assigned_patient_name": None,
                    "battery_percent": 100,
                    "battery_level": 100,
                    "firmware_version": "v2.4-TSIM-OV2640",
                    "ip_address": "Auto-UDP-5555",
                    "last_seen": now_iso,
                    "last_heartbeat_at": now_iso,
                    "camera_Working": True,
                    "camera_working": True,
                    "config": {"stream_port": 8765, "room": rm_meta["key"]},
                }
            )

    # 2. CucumberRS ESP32-S2 4-Room Appliance Controller
    mqtt_online = bool(mqtt_handler and getattr(mqtt_handler, "is_connected", False))
    out.append(
        {
            "id": len(out) + 1,
            "workspace_id": 1,
            "device_id": "CucumberRS",
            "name": "CucumberRS ESP32-S2 (4-Room LED Controller)",
            "display_name": "CucumberRS ESP32-S2 (4-Room LED Controller)",
            "device_type": "room_node",
            "hardware_type": "node",
            "type": "room_node",
            "status": "online" if mqtt_online else "offline",
            "room_id": 1,
            "room_name": "Living Room",
            "assigned_patient_id": None,
            "assigned_patient_name": None,
            "battery_percent": 100,
            "battery_level": 100,
            "firmware_version": "v2.1-ESP32S2-MQTT",
            "ip_address": "MQTT:1883",
            "last_seen": now_iso,
            "last_heartbeat_at": now_iso,
            "camera_Working": None,
            "camera_working": None,
            "config": {"pins": {"livingroom": 18, "bedroom": 17, "kitchen": 8, "bathroom": 37}},
        }
    )

    # 3. 3D Miniature Wheelchair Tracker
    out.append(
        {
            "id": len(out) + 1,
            "workspace_id": 1,
            "device_id": "WHEELCHAIR_01",
            "name": "3D Wheelchair Model (YOLOv8 Tracked)",
            "display_name": "3D Wheelchair Model (YOLOv8 Tracked)",
            "device_type": "wheelchair_node",
            "hardware_type": "wheelchair",
            "type": "wheelchair_node",
            "status": "online",
            "room_id": occupied["id"],
            "room_name": occupied["name"],
            "assigned_patient_id": 1,
            "assigned_patient_name": "Somchai Sukjai",
            "battery_percent": 94,
            "battery_level": 94,
            "firmware_version": "v1.0-YOLOv8",
            "ip_address": "Camera-AI",
            "last_seen": now_iso,
            "last_heartbeat_at": now_iso,
            "camera_Working": None,
            "camera_working": None,
            "config": {"model": "yolov8-best3.pt", "classes": ["WheelChair"]},
        }
    )

    return out


@router.get("/devices")
async def list_v2_devices(request: Request):
    return await _build_v2_hardware_devices(request)


@router.get("/devices/activity")
async def list_devices_activity(limit: int = Query(default=25)):
    return _DEVICE_ACTIVITY[:limit]


@router.get("/devices/{device_id}")
async def get_v2_device_detail(device_id: str, request: Request):
    devices = await _build_v2_hardware_devices(request)
    target = next((d for d in devices if d["device_id"] == device_id or str(d["id"]) == device_id), devices[0])
    rm_meta = resolve_room_meta(target.get("room_id") or 4)
    ts_sec = int(time.time())
    return {
        **target,
        "room": {
            "id": rm_meta["id"],
            "name": rm_meta["name"],
            "room_type": rm_meta["room_type"],
            "floor_id": 1,
            "facility_id": 1,
        },
        "assigned_patient": {
            "id": 1,
            "first_name": "Eleanor",
            "last_name": "Price",
            "room_id": rm_meta["id"],
        }
        if target.get("assigned_patient_id")
        else None,
        "latest_photo": {
            "url": f"/api/video/{rm_meta['key']}?t={ts_sec}",
            "captured_at": datetime.utcnow().isoformat() + "Z",
        },
    }


@router.patch("/devices/{device_id}")
async def patch_v2_device(device_id: str, request: Request, payload: Dict[str, Any] = Body(default={})):
    return await get_v2_device_detail(device_id, request)


@router.get("/devices/{device_id}/history")
async def get_v2_device_history(device_id: str, request: Request):
    detail = await get_v2_device_detail(device_id, request)
    events = [a for a in _DEVICE_ACTIVITY if a.get("device_id") == device_id] or _DEVICE_ACTIVITY[:10]
    return {
        "device": detail,
        "events": events,
        "total": len(events),
    }


@router.post("/devices/{device_id}/camera/check")
async def check_v2_device_camera(device_id: str, request: Request):
    detail = await get_v2_device_detail(device_id, request)
    rm_meta = resolve_room_meta(detail.get("room_id") or 4)
    url = f"/api/video/{rm_meta['key']}?t={int(time.time() * 1000)}"
    return {
        "device_id": device_id,
        "status": "online",
        "camera_working": True,
        "checked_at": datetime.utcnow().isoformat() + "Z",
        "latest_photo": {
            "url": url,
            "captured_at": datetime.utcnow().isoformat() + "Z",
        },
    }


# ============================================================================
# 8. Patients, Vitals & Health Analysis
# ============================================================================


@router.get("/patients")
async def list_v2_patients(request: Request):
    db = get_db(request)
    occupied = await _get_current_occupied_room_meta(db)
    return [
        {
            "id": 1,
            "first_name": "Eleanor",
            "last_name": "Price",
            "nickname": "Chai",
            "date_of_birth": "1955-04-12",
            "gender": "male",
            "care_level": "high",
            "mobility_type": "wheelchair",
            "current_mode": "wheelchair",
            "room_id": occupied["id"],
            "room_name": occupied["name"],
            "medical_conditions": ["Mobility impairment (Wheelchair user)", "Hypertension"],
            "allergies": [],
            "blood_type": "O",
            "height_cm": 168,
            "weight_kg": 65,
            "notes": "Lives in 4-room Smart Home; monitored via YOLOv8 camera & smart appliances.",
            "is_active": True,
            "photo_url": None,
        }
    ]


@router.get("/patients/{patient_id}")
async def get_v2_patient(patient_id: int, request: Request):
    pts = await list_v2_patients(request)
    return pts[0]


@router.patch("/patients/{patient_id}")
async def patch_v2_patient(patient_id: int, request: Request, payload: Dict[str, Any] = Body(default={})):
    pts = await list_v2_patients(request)
    p = pts[0]
    p.update(payload)
    return p


@router.get("/patients/{patient_id}/contacts")
async def get_patient_contacts(patient_id: int):
    return [
        {
            "id": 1,
            "patient_id": patient_id,
            "name": "Somsri Sukjai",
            "relationship": "Daughter",
            "phone": "081-555-1234",
            "is_primary": True,
        }
    ]


@router.get("/patients/{patient_id}/devices")
async def get_patient_devices(patient_id: int, request: Request):
    devs = await _build_v2_hardware_devices(request)
    return [d for d in devs if d.get("assigned_patient_id") == patient_id]


@router.get("/patients/{patient_id}/health-analysis")
async def get_patient_health_analysis(patient_id: int, request: Request):
    db = get_db(request)
    occupied = await _get_current_occupied_room_meta(db)
    return {
        "patient_id": patient_id,
        "status": "stable",
        "risk_level": "low" if not any(a["status"] == "active" for a in _V2_ALERTS) else "high",
        "summary": f"Patient Somchai Sukjai is currently in {occupied['name']} ({occupied['name_th']}). Wheelchair tracking and smart room lighting are active.",
        "recommendations": [
            "Ensure Bathroom and Bedroom lights are turned off when unoccupied (House Check active).",
            "Keep camera view unobstructed for real-time wheelchair & fall detection.",
        ],
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/vitals/readings")
async def list_vitals_readings(patient_id: Optional[int] = Query(default=1), limit: int = Query(default=20)):
    now = datetime.utcnow()
    return [
        {
            "id": i + 1,
            "patient_id": patient_id or 1,
            "device_id": "WHEELCHAIR_01",
            "heart_rate_bpm": 74 + (i % 5),
            "spo2_percent": 98,
            "skin_temp_c": 36.6,
            "source": "ble",
            "recorded_at": (now - timedelta(minutes=i * 15)).isoformat() + "Z",
        }
        for i in range(min(limit, 12))
    ]


@router.get("/analytics/vitals/averages")
async def get_vitals_averages():
    return {
        "avg_heart_rate_bpm": 76.0,
        "avg_spo2_percent": 98.0,
        "avg_skin_temp_c": 36.6,
        "sample_count": 24,
    }


@router.get("/analytics/devices/health")
async def get_devices_health(request: Request):
    devs = await _build_v2_hardware_devices(request)
    online = sum(1 for d in devs if d["status"] == "online")
    return {
        "total": len(devs),
        "online": online,
        "offline": len(devs) - online,
        "low_battery": 0,
        "by_type": {"camera_node": 1, "room_node": 1, "wheelchair_node": 1},
    }


@router.get("/analytics/occupancy")
async def get_occupancy_analytics(request: Request):
    db = get_db(request)
    occupied = await _get_current_occupied_room_meta(db)
    return {
        "total_patients": 1,
        "occupied_rooms": 1,
        "current_room": occupied["name"],
        "by_room": [
            {"room_id": r["id"], "room_name": r["name"], "count": 1 if r["id"] == occupied["id"] else 0}
            for r in CanonicalRooms
        ],
    }


# ============================================================================
# 9. Unified Alerts & Fall Detection Endpoints
# ============================================================================


@router.get("/alerts")
async def list_v2_alerts(
    request: Request,
    status: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    limit: int = Query(default=50),
):
    # Sync any active legacy emergencies from SQLite if _V2_ALERTS is empty
    db = get_db(request)
    if db and not _V2_ALERTS:
        try:
            active_em = await db.get_active_emergencies()
            for em in active_em:
                create_v2_alert_internal(
                    alert_type=str(em.get("eventType") or "fall"),
                    severity=str(em.get("severity") or "critical"),
                    title=em.get("message") or f"Emergency in {em.get('room', 'Living Room')}",
                    room_ref=em.get("room") or "livingroom",
                )
        except Exception:
            pass

    items = list(_V2_ALERTS)
    if status:
        items = [a for a in items if a["status"] == status]
    if severity:
        items = [a for a in items if a["severity"] == severity]
    return items[:limit]


@router.post("/alerts")
async def create_v2_alert(request: Request, payload: Dict[str, Any] = Body(...)):
    db = get_db(request)
    occupied = await _get_current_occupied_room_meta(db)
    data_dict = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    room_ref = (
        payload.get("room_id")
        or payload.get("room")
        or data_dict.get("room_id")
        or data_dict.get("room")
        or occupied["id"]
    )
    alert_type = str(payload.get("alert_type", "fall")).strip()
    severity = str(payload.get("severity", "critical")).strip()

    alert_obj = create_v2_alert_internal(
        alert_type=alert_type,
        severity=severity,
        title=payload.get("title"),
        description=payload.get("description"),
        room_ref=room_ref,
        patient_id=payload.get("patient_id", 1),
        device_id=payload.get("device_id"),
        data=data_dict,
    )

    # Also broadcast to legacy WebSocket / MQTT if available
    mqtt_handler = get_mqtt_handler(request)
    if mqtt_handler and hasattr(mqtt_handler, "_broadcast_ws"):
        try:
            await mqtt_handler._broadcast_ws(
                {
                    "type": "emergency_alert",
                    "alert": alert_obj,
                    "room": resolve_room_meta(room_ref)["key"],
                    "event_type": alert_type,
                    "severity": severity,
                }
            )
        except Exception:
            pass

    return alert_obj


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_v2_alert(alert_id: int, request: Request):
    user = _user_from_request(request)
    for a in _V2_ALERTS:
        if a["id"] == alert_id:
            a["status"] = "acknowledged"
            a["acknowledged_by"] = user["id"]
            a["acknowledged_at"] = datetime.utcnow().isoformat() + "Z"
            return a
    raise HTTPException(status_code=404, detail="Alert not found")


@router.post("/alerts/{alert_id}/resolve")
async def resolve_v2_alert(alert_id: int, request: Request, payload: Dict[str, Any] = Body(default={})):
    for a in _V2_ALERTS:
        if a["id"] == alert_id:
            a["status"] = "resolved"
            a["resolved_at"] = datetime.utcnow().isoformat() + "Z"
            a["resolution_note"] = payload.get("resolution_note", "Resolved via Dashboard")
            return a
    raise HTTPException(status_code=404, detail="Alert not found")


@router.get("/analytics/alerts/summary")
async def get_alerts_summary():
    active = [a for a in _V2_ALERTS if a["status"] == "active"]
    ack = [a for a in _V2_ALERTS if a["status"] == "acknowledged"]
    res = [a for a in _V2_ALERTS if a["status"] == "resolved"]
    return {
        "active": len(active),
        "acknowledged": len(ack),
        "resolved": len(res),
        "by_severity": {
            "critical": sum(1 for a in active if a["severity"] == "critical"),
            "warning": sum(1 for a in active if a["severity"] == "warning"),
            "info": sum(1 for a in active if a["severity"] == "info"),
        },
        "by_type": {
            "fall": sum(1 for a in active if a["alert_type"] == "fall"),
        },
    }


# ============================================================================
# 10. Demo Control & Actor Movement (Synced with House Check & 3D Rooms)
# ============================================================================


@router.get("/demo/simulator/status")
async def get_demo_simulator_status():
    return {
        "env_mode": "3d_hardware_live",
        "is_simulator": True,
        "workspace_exists": True,
        "workspace_id": 1,
    }


@router.post("/demo/actors/{actor_type}/{actor_id}/move")
async def move_demo_actor(
    actor_type: str,
    actor_id: int,
    request: Request,
    payload: Dict[str, Any] = Body(...),
):
    db = get_db(request)
    mqtt_handler = get_mqtt_handler(request)
    target_meta = resolve_room_meta(payload.get("room_id") or payload.get("room") or 1)

    previous_meta = await _get_current_occupied_room_meta(db)
    previous_location = previous_meta["name"]
    new_location = target_meta["name"]

    if db:
        try:
            await db.update_room_status(
                target_meta["key"],
                {
                    "user_detected": True,
                    "detection_confidence": 0.99,
                    "timestamp": datetime.utcnow().isoformat(),
                },
            )
            async def _bcast(msg):
                if mqtt_handler:
                    await mqtt_handler._broadcast_ws(msg)
            await db.sync_location_to_user_info(new_location, _bcast)
        except Exception as e:
            logger.warning(f"Failed to update room status on move: {e}")

    # Run House Check Service (notifies if light/AC was left ON in previous room)
    house_check_service = getattr(request.app.state, "house_check_service", None)
    hc_result = None
    if house_check_service and previous_location != new_location:
        try:
            hc_result = await house_check_service.run_house_check(previous_location, new_location)
            if hc_result and hc_result.get("notified") and hc_result.get("devices"):
                request.app.state.recent_notification = {
                    "devices": hc_result.get("devices", []),
                    "message": hc_result.get("message", ""),
                    "type": "house_check_notification",
                }
                create_v2_alert_internal(
                    alert_type="appliance_left_on",
                    severity="warning",
                    title=f"💡 Forgotten Appliance in {previous_location}",
                    description=hc_result.get("message")
                    or f"Moved from {previous_location} to {new_location} while appliance was left ON.",
                    room_ref=previous_meta["id"],
                )
        except Exception as e:
            logger.warning(f"House check on demo move failed: {e}")

    _log_device_activity(
        category="movement",
        action="room_transition",
        message=f"Moved {actor_type} #{actor_id} from {previous_location} to {new_location}",
        device_id="WHEELCHAIR_01",
        room_id=target_meta["id"],
        status="success",
        details={"from_room": previous_location, "to_room": new_location, "house_check": hc_result},
    )

    return {
        "status": "success",
        "actor_type": actor_type,
        "actor_id": actor_id,
        "from_room": previous_location,
        "to_room": new_location,
        "room_id": target_meta["id"],
        "house_check": hc_result,
    }


@router.post("/demo/reset")
async def reset_demo_workspace(request: Request):
    global _V2_ALERTS
    _V2_ALERTS.clear()
    db = get_db(request)
    mqtt_handler = get_mqtt_handler(request)

    # Turn off all 4 room lights on reset
    for r in CanonicalRooms:
        try:
            await control_appliance_core(
                db=db,
                mqtt_handler=mqtt_handler,
                room=r["key"],
                appliance="light",
                state=False,
            )
        except Exception:
            pass

    if db:
        try:
            await db.sync_location_to_user_info("Living Room", None)
        except Exception:
            pass

    _log_device_activity(
        category="system",
        action="demo_reset",
        message="Reset 3D Smart Home demo state (cleared alerts, turned off all 4 room lights)",
        device_id="CucumberRS",
        room_id=1,
        status="success",
    )
    return {"status": "ok", "message": "Demo workspace reset"}


# ============================================================================
# 11. EaseAI Chat V2 Compatibility (Connected to Thai/English Command Parser)
# ============================================================================


def _ensure_conversation(conv_id: Optional[str] = None) -> Dict[str, Any]:
    cid = conv_id or "conv-default-3d"
    if cid not in _CHAT_CONVERSATIONS:
        now_iso = datetime.utcnow().isoformat() + "Z"
        _CHAT_CONVERSATIONS[cid] = {
            "id": cid,
            "title": "3D Smart Home Assistant",
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        _CHAT_MESSAGES[cid] = [
            {
                "id": "msg-welcome",
                "conversation_id": cid,
                "role": "assistant",
                "content": (
                    "สวัสดีครับ! ระบบผู้ช่วยบ้านอัจฉริยะ WheelSense พร้อมทำงานแล้วครับ 🏠🦽\n"
                    "สามารถสั่งเปิด-ปิดไฟทั้ง 4 ห้อง (ห้องนั่งเล่น, ห้องนอน, ห้องครัว, ห้องน้ำ) หรือเช็คสถานะบ้านได้เลยครับ เช่น:\n"
                    "• \"เปิดไฟห้องนั่งเล่น\" / \"Turn on living room light\"\n"
                    "• \"ปิดไฟทุกห้อง\" / \"Turn off all lights\"\n"
                    "• \"สถานะบ้าน\" / \"ฉันอยู่ห้องไหน\""
                ),
                "created_at": now_iso,
            }
        ]
    return _CHAT_CONVERSATIONS[cid]


@router.get("/chat/conversations")
async def list_chat_conversations():
    _ensure_conversation()
    return list(_CHAT_CONVERSATIONS.values())


@router.post("/chat/conversations")
async def create_chat_conversation(payload: Dict[str, Any] = Body(default={})):
    cid = f"conv-{int(time.time() * 1000)}"
    conv = _ensure_conversation(cid)
    if payload.get("title"):
        conv["title"] = str(payload["title"])
    return conv


@router.get("/chat/conversations/{conv_id}/messages")
async def list_chat_messages(conv_id: str):
    _ensure_conversation(conv_id)
    return _CHAT_MESSAGES.get(conv_id, [])


@router.delete("/chat/conversations/{conv_id}")
async def delete_chat_conversation(conv_id: str):
    _CHAT_CONVERSATIONS.pop(conv_id, None)
    _CHAT_MESSAGES.pop(conv_id, None)
    return {"status": "deleted"}


async def _execute_smart_home_chat(user_text: str, request: Request) -> str:
    """Execute Thai/English smart home command via command_parser and return assistant reply."""
    db = get_db(request)
    mqtt_handler = get_mqtt_handler(request)
    recent_notification = getattr(request.app.state, "recent_notification", None)

    occupied = await _get_current_occupied_room_meta(db)
    current_room = occupied["key"]

    try:
        parsed = parse_command(user_text)
        cmd_res = await execute_command(
            parsed=parsed,
            db=db,
            mqtt_handler=mqtt_handler,
            current_room=current_room,
            app=request.app,
            recent_notification=recent_notification,
        )
        if cmd_res.get("handled"):
            if recent_notification:
                tr = cmd_res.get("tool_result", {}) or {}
                if tr.get("devices_turned_off") or tr.get("action") == "no_action":
                    request.app.state.recent_notification = None
            return cmd_res.get("message") or "ดำเนินการเรียบร้อยแล้วครับ"
    except Exception as e:
        logger.warning(f"Command parser error in V2 chat: {e}")

    # Helpful smart home summary fallback if command wasn't a direct parser match
    devices = await _get_merged_smart_devices(db)
    lights_on = [d["room_name"] for d in devices if d["device_type"] == "light" and d["state"] == "on"]
    lights_summary = ", ".join(lights_on) if lights_on else "ปิดอยู่ทุกห้อง (All OFF)"
    active_alerts = [a for a in _V2_ALERTS if a["status"] != "resolved"]

    return (
        f"📍 ตำแหน่งรถเข็นปัจจุบัน: **{occupied['name']} ({occupied['name_th']})**\n"
        f"💡 สถานะไฟที่เปิดอยู่: **{lights_summary}**\n"
        f"🚨 การแจ้งเตือนฉุกเฉิน: **{len(active_alerts)} รายการ**\n\n"
        f"(พิมพ์สั่งงานได้ทันที เช่น \"เปิดไฟห้องนั่งเล่น\", \"ปิดไฟห้องน้ำ\", \"เปิดไฟทุกห้อง\", หรือ \"ปิดไฟทั้งหมด\")"
    )


@router.post("/chat/actions/propose")
async def propose_chat_action(request: Request, payload: Dict[str, Any] = Body(...)):
    user_msg = str(payload.get("message", "")).strip()
    conv_id = str(payload.get("conversation_id") or "conv-default-3d")
    _ensure_conversation(conv_id)

    now_iso = datetime.utcnow().isoformat() + "Z"
    _CHAT_MESSAGES[conv_id].append(
        {
            "id": f"msg-u-{int(time.time() * 1000)}",
            "conversation_id": conv_id,
            "role": "user",
            "content": user_msg,
            "created_at": now_iso,
        }
    )

    reply = await _execute_smart_home_chat(user_msg, request)
    _CHAT_MESSAGES[conv_id].append(
        {
            "id": f"msg-a-{int(time.time() * 1000) + 1}",
            "conversation_id": conv_id,
            "role": "assistant",
            "content": reply,
            "created_at": datetime.utcnow().isoformat() + "Z",
        }
    )
    _CHAT_CONVERSATIONS[conv_id]["updated_at"] = datetime.utcnow().isoformat() + "Z"

    return {
        "conversation_id": conv_id,
        "assistant_message": reply,
        "requires_confirmation": False,
        "proposal": None,
    }


@router.post("/chat/actions/{action_id}/confirm")
async def confirm_chat_action(action_id: str):
    return {"id": action_id, "status": "confirmed"}


@router.post("/chat/actions/{action_id}/execute")
async def execute_chat_action(action_id: str):
    return {"id": action_id, "status": "executed", "result": {"message": "Action executed"}}


@router.post("/chat/stream")
async def stream_chat_v2(request: Request, payload: Dict[str, Any] = Body(...)):
    user_msg = str(payload.get("message", "")).strip()
    conv_id = str(payload.get("conversation_id") or "conv-default-3d")
    res = await propose_chat_action(request, {"message": user_msg, "conversation_id": conv_id})
    reply = res["assistant_message"]
    sse = (
        f"event: meta\ndata: {json.dumps({'conversation_id': conv_id})}\n\n"
        f"event: delta\ndata: {json.dumps({'delta': reply})}\n\n"
        f"event: done\ndata: {{}}\n\n"
    )
    return FastAPIResponse(content=sse, media_type="text/event-stream")
