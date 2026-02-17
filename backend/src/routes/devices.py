"""
WheelSense v2.0 - Devices Routes
Device management (legacy compatibility + nodes)
Config sync for M5StickCPlus2 (rooms, nodes, 2-way config push)
"""

from datetime import datetime
import ipaddress
from typing import Optional, List, Literal
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..core.config import settings
from ..core.database import db
from ..core.identity import (
    id_candidates as _id_candidates,
    infer_device_type_from_id as _infer_device_type_from_id,
    normalize_device_id as _normalize_device_id,
)
from ..core.mqtt import mqtt_collector

router = APIRouter()


class DeviceConfigPush(BaseModel):
    """Config to push to device via MQTT"""
    device_id: Optional[str] = None
    node_id: Optional[str] = None
    room_id: Optional[str] = None
    room_name: Optional[str] = None
    room_type: Optional[str] = None
    wifi_ssid: Optional[str] = None
    wifi_password: Optional[str] = None
    backend_url: Optional[str] = None
    server_ip: Optional[str] = None
    mqtt_broker: Optional[str] = None
    mqtt_port: Optional[int] = None
    mqtt_user: Optional[str] = None
    mqtt_password: Optional[str] = None
    ws_enabled: Optional[bool] = None
    ws_path: Optional[str] = None
    orientation: Optional[int] = None
    rooms: Optional[List[dict]] = None
    nodes: Optional[List[dict]] = None


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    room_id: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    status: Optional[str] = None


class DeviceCommandRequest(BaseModel):
    mode: Literal["sync_config", "reboot", "config"]


def _split_host_port(host_value: str) -> tuple[str, Optional[int]]:
    host = (host_value or "").strip()
    if not host:
        return "", None

    # Trim IPv6 brackets if present.
    if host.startswith("[") and "]" in host:
        closing = host.find("]")
        host_only = host[1:closing]
        port_part = host[closing + 1 :]
        if port_part.startswith(":") and port_part[1:].isdigit():
            return host_only, int(port_part[1:])
        return host_only, None

    if host.count(":") == 1:
        host_only, maybe_port = host.rsplit(":", 1)
        if maybe_port.isdigit():
            return host_only, int(maybe_port)

    return host, None


def _is_private_ipv4(value: str) -> bool:
    try:
        parsed = ipaddress.ip_address(value)
    except ValueError:
        return False
    return isinstance(parsed, ipaddress.IPv4Address) and parsed.is_private


def _is_local_only_host(value: str) -> bool:
    lowered = (value or "").strip().lower()
    return lowered in {"", "localhost", "127.0.0.1", "0.0.0.0", "backend", "api"}


def _extract_host_from_url(raw_url: str) -> tuple[str, Optional[int], str]:
    value = (raw_url or "").strip()
    if not value:
        return "", None, "http"

    parsed = urlparse(value if "://" in value else f"http://{value}")
    host = (parsed.hostname or "").strip()
    scheme = (parsed.scheme or "http").strip().lower()
    port = parsed.port
    return host, port, scheme


def _same_private_subnet(ip_a: str, ip_b: str) -> Optional[bool]:
    try:
        a = ipaddress.ip_address(ip_a)
        b = ipaddress.ip_address(ip_b)
    except ValueError:
        return None

    if not (isinstance(a, ipaddress.IPv4Address) and isinstance(b, ipaddress.IPv4Address)):
        return None
    if not (a.is_private and b.is_private):
        return False

    a_octets = str(a).split(".")
    b_octets = str(b).split(".")
    return a_octets[:3] == b_octets[:3]


def _build_backend_url(scheme: str, host: str, port: Optional[int]) -> str:
    scheme_safe = scheme if scheme in {"http", "https"} else "http"
    if not host:
        return ""

    default_port = 443 if scheme_safe == "https" else 80
    if port and port != default_port:
        return f"{scheme_safe}://{host}:{port}"
    return f"{scheme_safe}://{host}"


def _extract_client_ip(request: Request) -> str:
    forwarded_for = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded_for:
        first = forwarded_for.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else ""


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


@router.put("/{device_id}")
async def update_device(device_id: str, payload: DeviceUpdate):
    """Legacy-compatible update endpoint used by frontend device editing."""
    if device_id == "GW-01":
        return {"message": "Gateway device is virtual and cannot be updated"}

    existing = await db.fetch_one("SELECT * FROM nodes WHERE id = $1", (device_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Device not found")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        set_parts = []
        values = []
        for idx, (key, value) in enumerate(updates.items(), 1):
            set_parts.append(f"{key} = ${idx}")
            values.append(value)
        values.append(device_id)
        set_clause = ", ".join(set_parts)
        arg_pos = len(values)
        await db.execute(
            f"UPDATE nodes SET {set_clause}, updated_at = NOW() WHERE id = ${arg_pos}",
            tuple(values),
        )

    if payload.room_id is not None:
        await db.execute("UPDATE rooms SET node_id = NULL WHERE node_id = $1", (device_id,))
        if payload.room_id:
            await db.execute(
                "UPDATE rooms SET node_id = $1 WHERE id = $2",
                (device_id, payload.room_id),
            )

    return {"message": "Device updated successfully"}


@router.get("/{device_id}/config")
async def get_device_config(
    device_id: str,
    request: Request,
    device_ip: Optional[str] = None,
    wifi_ssid: Optional[str] = None,
    device_type: Optional[str] = None,
):
    """Return config + rooms + nodes + MQTT defaults for device sync."""
    requested_type = (device_type or "").strip().lower()
    if requested_type not in {"camera", "wheelchair"}:
        requested_type = _infer_device_type_from_id(device_id)
    canonical_device_id = _normalize_device_id(device_id, device_type=requested_type)

    rooms = await db.fetch_all(
        "SELECT id, name FROM rooms ORDER BY name"
    )
    nodes = await db.fetch_all(
        "SELECT id, room_id, name FROM nodes ORDER BY id"
    )
    camera = await db.fetch_one(
        "SELECT device_id, room_id, room_name FROM camera_nodes WHERE device_id = $1",
        (canonical_device_id,),
    )
    room_id = camera["room_id"] if camera and camera.get("room_id") else None
    room_name = camera["room_name"] if camera and camera.get("room_name") else None
    if not room_id:
        mapped_node = await db.fetch_one(
            "SELECT room_id FROM nodes WHERE id = $1",
            (canonical_device_id,),
        )
        if mapped_node and mapped_node.get("room_id"):
            room_id = mapped_node["room_id"]
    if room_id and not room_name:
        mapped_room = await db.fetch_one(
            "SELECT name FROM rooms WHERE id = $1",
            (room_id,),
        )
        if mapped_room and mapped_room.get("name"):
            room_name = mapped_room["name"]

    forwarded_proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    scheme = forwarded_proto if forwarded_proto else request.url.scheme
    forwarded_host = (request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    raw_host = forwarded_host or request.headers.get("host") or (request.url.hostname or "")
    request_host, request_port = _split_host_port(raw_host)
    if not request_host:
        request_host = request.url.hostname or ""
    if request_port is None:
        request_port = request.url.port

    observed_device_ip = (device_ip or "").strip() or _extract_client_ip(request)

    configured_backend_url = (settings.DEVICE_BACKEND_URL or "").strip().rstrip("/")
    configured_server_ip = (settings.DEVICE_SERVER_IP or "").strip()
    configured_host, configured_port, configured_scheme = _extract_host_from_url(configured_backend_url)

    resolved_server_ip = ""
    resolved_scheme = scheme if scheme in {"http", "https"} else "http"
    resolved_port = request_port or settings.API_PORT

    if configured_server_ip and not _is_local_only_host(configured_server_ip):
        resolved_server_ip = configured_server_ip
    elif configured_host and not _is_local_only_host(configured_host):
        resolved_server_ip = configured_host
        if configured_port:
            resolved_port = configured_port
        if configured_scheme in {"http", "https"}:
            resolved_scheme = configured_scheme
    elif request_host and not _is_local_only_host(request_host):
        resolved_server_ip = request_host

    subnet_match = _same_private_subnet(observed_device_ip, resolved_server_ip) if resolved_server_ip else None
    network_check_known = subnet_match is not None
    same_wifi = bool(subnet_match) if network_check_known else (True if not resolved_server_ip else False)
    features_limited = bool(network_check_known and not same_wifi)
    warning_message = (
        "Different WiFi network detected. LAN-only features (local HTTP/WebSocket control and auto-discovery) "
        "are limited."
        if features_limited
        else ""
    )

    if configured_backend_url:
        base_url = configured_backend_url
    elif resolved_server_ip and not _is_local_only_host(resolved_server_ip):
        base_url = _build_backend_url(resolved_scheme, resolved_server_ip, resolved_port)
    else:
        base_url = ""

    normalized_device_type = requested_type
    ws_enabled_default = bool(
        normalized_device_type == "camera"
        and not features_limited
        and resolved_server_ip
        and not _is_local_only_host(resolved_server_ip)
    )

    await db.execute(
        """
        INSERT INTO device_sync_status (
            device_id, device_type, device_ip, wifi_ssid,
            request_host, server_ip, same_wifi, features_limited,
            warning_message, last_seen, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (device_id) DO UPDATE SET
            device_type = COALESCE(NULLIF(EXCLUDED.device_type, ''), device_sync_status.device_type),
            device_ip = COALESCE(NULLIF(EXCLUDED.device_ip, ''), device_sync_status.device_ip),
            wifi_ssid = COALESCE(NULLIF(EXCLUDED.wifi_ssid, ''), device_sync_status.wifi_ssid),
            request_host = COALESCE(NULLIF(EXCLUDED.request_host, ''), device_sync_status.request_host),
            server_ip = COALESCE(NULLIF(EXCLUDED.server_ip, ''), device_sync_status.server_ip),
            same_wifi = EXCLUDED.same_wifi,
            features_limited = EXCLUDED.features_limited,
            warning_message = EXCLUDED.warning_message,
            last_seen = NOW(),
            updated_at = NOW()
        """,
        (
            canonical_device_id,
            normalized_device_type,
            observed_device_ip,
            (wifi_ssid or "").strip(),
            request_host,
            resolved_server_ip,
            same_wifi,
            features_limited,
            warning_message,
        ),
    )

    payload = {
        "device_id": canonical_device_id,
        # Unified identity: camera node_id follows device_id.
        "node_id": canonical_device_id,
        "backend_url": base_url,
        "server_ip": resolved_server_ip,
        "ws_enabled": ws_enabled_default,
        "mqtt_broker": settings.MQTT_BROKER,
        "mqtt_port": settings.MQTT_PORT,
        "mqtt_user": settings.MQTT_USER or "",
        "mqtt_password": settings.MQTT_PASSWORD or "",
        "ws_path": "/api/ws/camera",
        "rooms": [{"id": r["id"], "name": r["name"]} for r in rooms],
        "nodes": [{"id": n["id"], "room_id": n["room_id"], "name": n["name"]} for n in nodes],
        "timestamp": datetime.now().isoformat(),
        "network_status": {
            "checked": network_check_known,
            "same_wifi": same_wifi,
            "features_limited": features_limited,
            "device_ip": observed_device_ip,
            "server_ip": resolved_server_ip,
            "warning": warning_message,
        },
    }
    if warning_message:
        payload["network_warning"] = warning_message
    if room_id:
        payload["room_id"] = room_id
    if room_name:
        payload["room_name"] = room_name
        payload["room_type"] = room_name

    return payload


@router.post("/{device_id}/config")
async def push_device_config(device_id: str, config: DeviceConfigPush):
    """Push configuration to device via MQTT"""
    import json
    requested_type = _infer_device_type_from_id(device_id)
    canonical_device_id = _normalize_device_id(device_id, device_type=requested_type)
    topic = f"WheelSense/config/{canonical_device_id}"
    payload = config.model_dump(exclude_none=True)

    configured_backend_url = (settings.DEVICE_BACKEND_URL or "").strip().rstrip("/")
    configured_server_ip = (settings.DEVICE_SERVER_IP or "").strip()

    payload.setdefault("device_id", canonical_device_id)
    payload.setdefault("node_id", canonical_device_id)
    payload.setdefault("mqtt_broker", settings.MQTT_BROKER)
    payload.setdefault("mqtt_port", settings.MQTT_PORT)
    payload.setdefault("mqtt_user", settings.MQTT_USER or "")
    payload.setdefault("mqtt_password", settings.MQTT_PASSWORD or "")
    payload.setdefault("ws_path", "/api/ws/camera")
    payload.setdefault("sync_only", False)
    if payload.get("room_name") and not payload.get("room_type"):
        payload["room_type"] = payload["room_name"]

    if requested_type == "camera":
        sync_row = await db.fetch_one(
            """
            SELECT server_ip, device_ip, same_wifi, features_limited
            FROM device_sync_status
            WHERE device_id = $1
            """,
            (canonical_device_id,),
        )

        if not payload.get("backend_url") and configured_backend_url:
            payload["backend_url"] = configured_backend_url

        backend_host, _, _ = _extract_host_from_url(str(payload.get("backend_url") or ""))
        server_ip = str(payload.get("server_ip") or "").strip()

        if not server_ip and configured_server_ip and not _is_local_only_host(configured_server_ip):
            server_ip = configured_server_ip
        if not server_ip and backend_host and not _is_local_only_host(backend_host):
            server_ip = backend_host
        if not server_ip and sync_row:
            sync_server_ip = str(sync_row.get("server_ip") or "").strip()
            if sync_server_ip and not _is_local_only_host(sync_server_ip):
                server_ip = sync_server_ip

        if server_ip:
            payload["server_ip"] = server_ip
            if not payload.get("backend_url"):
                payload["backend_url"] = _build_backend_url("http", server_ip, settings.API_PORT)

        same_wifi = bool(sync_row.get("same_wifi")) if sync_row else True
        features_limited = bool(sync_row.get("features_limited")) if sync_row else False
        device_ip_hint = str(sync_row.get("device_ip") or "") if sync_row else ""
        if server_ip and device_ip_hint:
            subnet_match = _same_private_subnet(device_ip_hint, server_ip)
            if subnet_match is not None:
                same_wifi = bool(subnet_match)
                features_limited = not same_wifi

        payload.setdefault(
            "network_status",
            {
                "checked": bool(server_ip and device_ip_hint),
                "same_wifi": same_wifi,
                "features_limited": features_limited,
                "device_ip": device_ip_hint,
                "server_ip": server_ip,
                "warning": (
                    "Different WiFi network detected. LAN-only features are limited."
                    if features_limited
                    else ""
                ),
            },
        )
        payload.setdefault("ws_enabled", bool(server_ip and not features_limited))
    else:
        payload.setdefault("ws_enabled", False)

    room_id = payload.get("room_id")
    room_name = payload.get("room_name")
    if requested_type == "camera" and (room_id or room_name):
        await db.execute(
            """
            INSERT INTO camera_nodes (
                device_id, node_id, room_id, room_name, room_binding_last_updated, updated_at
            )
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            ON CONFLICT (device_id) DO UPDATE SET
                node_id = COALESCE(NULLIF(EXCLUDED.node_id, ''), camera_nodes.node_id),
                room_id = COALESCE(NULLIF(EXCLUDED.room_id, ''), camera_nodes.room_id),
                room_name = COALESCE(NULLIF(EXCLUDED.room_name, ''), camera_nodes.room_name),
                room_binding_last_updated = NOW(),
                updated_at = NOW()
            """,
            (
                canonical_device_id,
                payload.get("node_id") or canonical_device_id,
                room_id or None,
                room_name or None,
            ),
        )

    ok = await mqtt_collector.publish(topic, json.dumps(payload, ensure_ascii=False))
    if not ok:
        raise HTTPException(status_code=503, detail="MQTT publish failed")
    return {"message": "Config pushed to device"}


@router.post("/{device_id}/command")
async def send_device_command(device_id: str, body: DeviceCommandRequest):
    """Send MQTT control command to M5/Tsim board."""
    import json

    if not mqtt_collector.connected:
        raise HTTPException(status_code=503, detail="MQTT broker is not connected")

    requested_type = _infer_device_type_from_id(device_id)
    canonical_device_id = _normalize_device_id(device_id, device_type=requested_type)
    command_map = {
        "sync_config": "sync_config",
        "reboot": "reboot",
        "config": "enter_config_mode",
    }
    command = command_map[body.mode]
    topic = f"WheelSense/{canonical_device_id}/control"
    payload = json.dumps(
        {
            "command": command,
            "requested_at": datetime.utcnow().isoformat(),
            "source": "admin_devices",
        }
    )
    ok = await mqtt_collector.publish(topic, payload)
    if not ok:
        raise HTTPException(status_code=503, detail="MQTT publish failed")

    return {
        "message": "Command published",
        "device_id": canonical_device_id,
        "mode": body.mode,
        "command": command,
        "topic": topic,
    }


@router.delete("/{device_id}")
async def delete_device(device_id: str):
    """Remove device records from system tables (camera/node/wheelchair sync state)."""
    requested_type = _infer_device_type_from_id(device_id)
    canonical_device_id = _normalize_device_id(device_id, device_type=requested_type)
    candidates = _id_candidates(device_id, device_type=requested_type)

    node_row = await db.fetch_one(
        "SELECT id FROM nodes WHERE id = ANY($1::text[]) LIMIT 1",
        (candidates,),
    )
    camera_row = await db.fetch_one(
        "SELECT device_id FROM camera_nodes WHERE device_id = ANY($1::text[]) OR node_id = ANY($1::text[]) LIMIT 1",
        (candidates,),
    )
    wheelchair_row = await db.fetch_one(
        "SELECT id FROM wheelchairs WHERE mac_address = ANY($1::text[]) LIMIT 1",
        (candidates,),
    )

    deleted = {
        "node": bool(node_row),
        "camera": bool(camera_row),
        "wheelchair": bool(wheelchair_row),
        "sync_status": False,
    }

    if node_row:
        node_id = str(node_row["id"])
        await db.execute("UPDATE rooms SET node_id = NULL WHERE node_id = $1", (node_id,))
        await db.execute("DELETE FROM nodes WHERE id = $1", (node_id,))

    if camera_row:
        await db.execute(
            "DELETE FROM camera_nodes WHERE device_id = ANY($1::text[]) OR node_id = ANY($1::text[])",
            (candidates,),
        )

    if wheelchair_row:
        await db.execute("DELETE FROM wheelchairs WHERE mac_address = ANY($1::text[])", (candidates,))

    sync_row = await db.fetch_one(
        "SELECT device_id FROM device_sync_status WHERE device_id = ANY($1::text[]) LIMIT 1",
        (candidates,),
    )
    if sync_row:
        await db.execute("DELETE FROM device_sync_status WHERE device_id = ANY($1::text[])", (candidates,))
        deleted["sync_status"] = True

    if not any(deleted.values()):
        raise HTTPException(status_code=404, detail="Device not found")

    return {"message": "Device removed", "device_id": canonical_device_id, "deleted": deleted}
