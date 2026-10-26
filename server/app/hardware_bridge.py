from __future__ import annotations

"""Hardware Bridge for Physical 3D Smart Home Prototype.

Connects:
1. TsimCam-Controller (ESP32-CAM):
   - UDP Discovery on port 5555 ("WHEELSENSE_DISCOVER")
   - WebSocket video streaming on port 8765
   - Live JPEG frame endpoint at /api/video/{room_ref}
2. camera-service (YOLOv8 Wheelchair & Fall Detection):
   - WebSocket /camera-service on port 8765
   - Maps detections in the 4 physical rooms (livingroom -> Model Living Room,
     bedroom -> Model Bedroom, kitchen -> Model Kitchen, bathroom -> Model Bathroom)
     on Level 2 - Model Home directly to patient **Robert Chen**
     (while other patients remain in sim mode).
3. CucumberRS-Controller (ESP32-S2 4-Room Appliance Controller):
   - Publishes MQTT control commands to WheelSense/{room_key}/control on local Mosquitto
   - Responds to WheelSense/central/state_sync_request on WheelSense/{room_key}/state_sync
"""

import asyncio
import json
import logging
import os
import socket
import subprocess
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import aiomqtt
import websockets
from fastapi import APIRouter, HTTPException, Request, WebSocket
from fastapi.responses import Response as FastAPIResponse
from sqlalchemy import desc, select

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.activity import ActivityTimeline, Alert
from app.models.facility import Facility, Floor
from app.models.base import utcnow
from app.models.core import Device, Room, SmartDevice, Workspace
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.telemetry import PhotoRecord, RoomPrediction
from app.services.mqtt_publish import publish_alert_to_mqtt_background

logger = logging.getLogger("wheelsense.hardware_bridge")

video_router = APIRouter()

# Root directory for frame captures/recordings (bind-mounted to the host in compose).
CAPTURE_ROOT = Path(os.getenv("CAPTURE_ROOT") or "/app/captures")


def _safe_subdir(raw: Any) -> str:
    """Sanitize a user-chosen save subdirectory: relative path, no traversal."""
    text = str(raw or "").strip().replace("\\", "/").strip("/")
    if not text:
        return ""
    parts = [p for p in text.split("/") if p and p not in (".", "..")]
    return "/".join(parts)

PHYSICAL_ROOM_META: dict[str, dict[str, Any]] = {
    "livingroom": {
        "key": "livingroom",
        "facility_room_name": "Model Living Room",
        "name_th": "ห้องนั่งเล่น (โมเดล)",
        "default_node": "MODEL_NODE_01",
    },
    "bedroom": {
        "key": "bedroom",
        "facility_room_name": "Model Bedroom",
        "name_th": "ห้องนอน (โมเดล)",
        "default_node": "MODEL_NODE_02",
    },
    "kitchen": {
        "key": "kitchen",
        "facility_room_name": "Model Kitchen",
        "name_th": "ห้องครัว (โมเดล)",
        "default_node": "MODEL_NODE_03",
    },
    "bathroom": {
        "key": "bathroom",
        "facility_room_name": "Model Bathroom",
        "name_th": "ห้องน้ำ (โมเดล)",
        "default_node": "MODEL_NODE_04",
    },
}

ROOM_REF_ALIASES: dict[str, str] = {
    "livingroom": "livingroom",
    "living_room": "livingroom",
    "living": "livingroom",
    "room-401": "livingroom",
    "room401": "livingroom",
    "401": "livingroom",
    "1": "livingroom",
    "room-1": "livingroom",
    "bedroom": "bedroom",
    "bed": "bedroom",
    "room-402": "bedroom",
    "room402": "bedroom",
    "402": "bedroom",
    "2": "bedroom",
    "room-2": "bedroom",
    "kitchen": "kitchen",
    "dining": "kitchen",
    "diningroom": "kitchen",
    "dining_room": "kitchen",
    "8": "kitchen",
    "room-8": "kitchen",
    "bathroom": "bathroom",
    "bath": "bathroom",
    "bathroom_3d": "bathroom",
    "7": "bathroom",
    "room-7": "bathroom",
}


def normalize_physical_room_key(room_ref: Any) -> str:
    raw = str(room_ref or "").strip().lower()
    cleaned = raw.replace(" ", "").replace("_", "").replace("-", "")
    if raw in ROOM_REF_ALIASES:
        return ROOM_REF_ALIASES[raw]
    if cleaned in ROOM_REF_ALIASES:
        return ROOM_REF_ALIASES[cleaned]
    if "401" in raw or "living" in raw:
        return "livingroom"
    if "402" in raw or "bed" in raw:
        return "bedroom"
    if "dining" in raw or "kitchen" in raw:
        return "kitchen"
    if "bath" in raw:
        return "bathroom"
    return "bedroom"


def facility_room_name_to_physical_key(room_name: str | None) -> str | None:
    if not room_name:
        return None
    low = room_name.strip().lower()
    if low in ("model living room", "living room"):
        return "livingroom"
    if low in ("model bedroom", "bedroom"):
        return "bedroom"
    if low in ("model kitchen", "kitchen"):
        return "kitchen"
    if low in ("model bathroom",):
        return "bathroom"
    return None


def get_host_ip() -> str:
    env_ip = (os.getenv("HOST_IP") or "").strip()
    if env_ip and env_ip != "127.0.0.1":
        return env_ip

    try:
        resolved_host = socket.gethostbyname("host.docker.internal")
        if (
            resolved_host
            and not resolved_host.startswith("127.")
            and not resolved_host.startswith("172.")
            and not resolved_host.startswith("192.168.65.")
        ):
            return resolved_host
    except Exception:
        pass

    try:
        result = subprocess.run(
            ["ip", "route", "show", "default"],
            capture_output=True,
            text=True,
            timeout=2,
        )
        if result.returncode == 0:
            parts = result.stdout.split()
            if len(parts) >= 3 and parts[0] == "default" and parts[1] == "via":
                gw = parts[2]
                if not gw.startswith("172.") and not gw.startswith("127."):
                    return gw
    except Exception:
        pass

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("172.") and ip != "127.0.0.1":
            return ip
    except Exception:
        pass

    return "127.0.0.1"


class HardwareBridge:
    """Manages UDP 5555 discovery, WS 8765 TsimCam + camera-service, and CucumberRS MQTT."""

    def __init__(self) -> None:
        self.camera_connections: dict[str, Any] = {}
        self.camera_service_connection: Any = None
        self.latest_frames: dict[str, bytes] = {}
        self.device_rooms: dict[str, str] = {}
        self.device_rotations: dict[str, int] = {}
        self.device_status: dict[str, dict[str, Any]] = {}
        self.last_forward_time: dict[str, float] = {}
        self.frame_counters: dict[str, int] = {}
        self.last_detected_room_key: str | None = None
        self.last_detection_ts: float = 0.0
        self.last_fall_alert_ts: float = 0.0
        self.last_house_check_alert_ts: float = 0.0
        self.detection_listeners: set[Any] = set()
        self.stream_subscribers: dict[str, set[Any]] = {}
        self.frame_recorders: dict[str, dict[str, Any]] = {}
        self.detection_threshold: float = 0.8
        self._tasks: list[asyncio.Task[Any]] = []
        self._ws_server: Any = None

    @property
    def local_mqtt_broker(self) -> str:
        return (os.getenv("LOCAL_MQTT_BROKER") or settings.mqtt_broker or "mosquitto").strip()

    @property
    def local_mqtt_port(self) -> int:
        return int(os.getenv("LOCAL_MQTT_PORT") or settings.mqtt_port or 1883)

    async def start(self) -> None:
        self._tasks.append(asyncio.create_task(self._run_udp_discovery_server()))
        self._tasks.append(asyncio.create_task(self._run_camera_ws_server()))
        self._tasks.append(asyncio.create_task(self._run_local_hardware_mqtt_listener()))
        logger.info(
            "HardwareBridge started (UDP 5555, WS 8765, Local MQTT %s:%d)",
            self.local_mqtt_broker,
            self.local_mqtt_port,
        )

    async def stop(self) -> None:
        for t in self._tasks:
            t.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        if self._ws_server is not None:
            self._ws_server.close()
            await self._ws_server.wait_closed()
            self._ws_server = None

    async def _run_udp_discovery_server(self) -> None:
        discovery_port = 5555
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        try:
            sock.bind(("0.0.0.0", discovery_port))
        except Exception as exc:
            logger.warning("Could not bind UDP discovery port %d: %s", discovery_port, exc)
            sock.close()
            return
        sock.setblocking(False)
        host_ip = get_host_ip()
        last_ip_check = time.monotonic()
        loop = asyncio.get_running_loop()
        logger.info("UDP Discovery server listening on port %d (Host IP: %s)", discovery_port, host_ip)

        try:
            while True:
                now = time.monotonic()
                if now - last_ip_check > 30.0:
                    host_ip = get_host_ip()
                    last_ip_check = now
                try:
                    data, addr = await loop.run_in_executor(None, lambda: sock.recvfrom(1024))
                    msg = data.decode(errors="replace").strip()
                    if msg == "WHEELSENSE_DISCOVER":
                        host_ip = get_host_ip()
                        reply = json.dumps(
                            {
                                "type": "WHEELSENSE_SERVER",
                                "ip": host_ip,
                                "websocket_port": 8765,
                                "mqtt_port": 1883,
                                "http_port": 8000,
                            }
                        )
                        sock.sendto(reply.encode("utf-8"), addr)
                        logger.info("UDP Discovery reply (%s) sent to %s", host_ip, addr[0])
                except BlockingIOError:
                    await asyncio.sleep(0.1)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.debug("UDP discovery error: %s", exc)
                    await asyncio.sleep(1.0)
        finally:
            sock.close()

    async def _run_camera_ws_server(self) -> None:
        port = 8765

        async def _handler(websocket: Any, path: str | None = None) -> None:
            req_path = path
            if req_path is None and hasattr(websocket, "request") and websocket.request is not None:
                req_path = getattr(websocket.request, "path", "/")
            await self.handle_ws_connection(websocket, req_path or "/")

        try:
            self._ws_server = await websockets.serve(
                _handler,
                "0.0.0.0",
                port,
                ping_interval=None,
                max_size=None,
                max_queue=16,
            )
            logger.info("WebSocket Camera & YOLOv8 server listening on port %d", port)
            await asyncio.Future()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Could not start WebSocket server on port %d: %s", port, exc)

    async def handle_ws_connection(self, websocket: Any, path: str) -> None:
        if path and "/camera-service" in path:
            await self._handle_camera_service(websocket)
            return

        device_id = "MODEL_NODE_01"
        room_key = "livingroom"
        try:
            try:
                first_msg = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                if isinstance(first_msg, str):
                    try:
                        data = json.loads(first_msg)
                        if data.get("type") == "register" and data.get("service") == "camera-service":
                            await self._handle_camera_service(websocket, initial_data=data)
                            return
                        device_id = str(data.get("device_id") or data.get("deviceId") or "MODEL_NODE_01")
                        room_key = normalize_physical_room_key(data.get("room") or data.get("r") or "livingroom")
                        self.camera_connections[device_id] = websocket
                        self.device_rooms[device_id] = room_key
                        await websocket.send(
                            json.dumps(
                                {
                                    "type": "connected",
                                    "status": "ok",
                                    "device_id": device_id,
                                    "room": room_key,
                                }
                            )
                        )
                        logger.info("TsimCam connected: %s (%s)", device_id, room_key)
                    except json.JSONDecodeError:
                        self.camera_connections[device_id] = websocket
                        self.device_rooms[device_id] = room_key
                elif isinstance(first_msg, bytes):
                    self.camera_connections[device_id] = websocket
                    self.device_rooms[device_id] = room_key
                    self.latest_frames[room_key] = first_msg
                    asyncio.create_task(self._forward_to_camera_service(room_key, first_msg, device_id))
            except asyncio.TimeoutError:
                self.camera_connections[device_id] = websocket
                self.device_rooms[device_id] = room_key

            async for message in websocket:
                if isinstance(message, bytes):
                    self.latest_frames[room_key] = message
                    self.device_status[device_id] = {
                        **self.device_status.get(device_id, {}),
                        "room": room_key,
                        "last_seen": utcnow(),
                        "online": True,
                    }
                    if self.stream_subscribers.get(room_key):
                        asyncio.create_task(self._fanout_stream_frame(room_key, message))
                    recorder = self.frame_recorders.get(room_key)
                    if recorder is not None:
                        self._record_frame(recorder, room_key, message)
                    asyncio.create_task(self._forward_to_camera_service(room_key, message, device_id))
                elif isinstance(message, str):
                    try:
                        data = json.loads(message)
                        mtype = data.get("type", "")
                        if mtype == "status":
                            self.device_status[device_id] = {
                                "type": "camera",
                                "room": normalize_physical_room_key(data.get("room") or room_key),
                                "ip": data.get("ip_address", ""),
                                "rssi": data.get("rssi", 0),
                                "frames_sent": data.get("frames_sent", 0),
                                "uptime": data.get("uptime_seconds", 0),
                                "last_seen": utcnow(),
                                "online": True,
                            }
                            asyncio.create_task(
                                self._touch_hardware_device(
                                    device_id,
                                    ip_address=data.get("ip_address", ""),
                                    room_key=room_key,
                                )
                            )
                        elif mtype == "connected":
                            new_id = data.get("device_id") or data.get("deviceId")
                            new_room = data.get("room") or data.get("r")
                            if new_id:
                                self.camera_connections.pop(device_id, None)
                                device_id = str(new_id)
                                self.camera_connections[device_id] = websocket
                            if new_room:
                                room_key = normalize_physical_room_key(new_room)
                                self.device_rooms[device_id] = room_key
                    except json.JSONDecodeError:
                        pass
        except Exception as exc:
            logger.debug("TsimCam connection closed (%s): %s", device_id, exc)
        finally:
            self.camera_connections.pop(device_id, None)
            if device_id in self.device_status:
                self.device_status[device_id]["online"] = False
                self.device_status[device_id]["last_seen"] = utcnow()

    async def _handle_camera_service(self, websocket: Any, initial_data: dict[str, Any] | None = None) -> None:
        try:
            if initial_data is None:
                raw = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                initial_data = json.loads(raw) if isinstance(raw, str) else {}
            if initial_data.get("type") == "register" and initial_data.get("service") == "camera-service":
                self.camera_service_connection = websocket
                await websocket.send(json.dumps({"type": "registered", "status": "ok"}))
                logger.info("camera-service (YOLOv8) connected to HardwareBridge")
            else:
                await websocket.close()
                return

            async for message in websocket:
                if isinstance(message, str):
                    try:
                        data = json.loads(message)
                        if data.get("type") == "detection":
                            await self.broadcast_detection_event(data)
                            await self._handle_yolo_detection(data)
                    except json.JSONDecodeError:
                        pass
        except Exception as exc:
            logger.info("camera-service disconnected: %s", exc)
        finally:
            if self.camera_service_connection is websocket:
                self.camera_service_connection = None

    async def _forward_to_camera_service(self, room_key: str, frame: bytes, device_id: str) -> None:
        conn = self.camera_service_connection
        if conn is None:
            return
        now = time.monotonic()
        if now - self.last_forward_time.get(room_key, 0.0) < 0.05:
            return
        if len(frame) < 100 or frame[0:2] != b"\xff\xd8":
            return
        self.last_forward_time[room_key] = now
        rotation = self.device_rotations.get(device_id, 0) or self.device_rotations.get(
            str(PHYSICAL_ROOM_META[room_key]["default_node"]), 0
        )
        meta = json.dumps(
            {
                "type": "video_frame",
                "device_id": device_id,
                "room": room_key,
                "rotation": rotation,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        try:
            if hasattr(conn, "send_text"):
                await conn.send_text(meta)
                await conn.send_bytes(frame)
            else:
                await conn.send(meta)
                await conn.send(frame)
        except Exception:
            self.camera_service_connection = None

    async def broadcast_detection_event(self, data: dict[str, Any]) -> None:
        """Fan out a raw camera-service detection to /api/ws listeners (detection-test page)."""
        if not self.detection_listeners:
            return
        room_key = normalize_physical_room_key(data.get("room", "livingroom"))
        msg = json.dumps(
            {
                "type": "wheelchair_detection",
                "room": room_key,
                "detected": bool(data.get("detected", False)),
                "confidence": float(data.get("confidence", 0.0) or 0.0),
                "bbox": data.get("bbox"),
                "detections": data.get("detections") or [],
                "method": data.get("method", "yolo"),
                "frame_size": data.get("frame_size"),
                "device_id": data.get("device_id"),
                "fall_detected": bool(data.get("fall_detected", False)),
                "timestamp": data.get("timestamp")
                or datetime.now(timezone.utc).isoformat(),
            }
        )
        dead: list[Any] = []
        for ws in list(self.detection_listeners):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.detection_listeners.discard(ws)

    async def _fanout_stream_frame(self, room_key: str, frame: bytes) -> None:
        dead: list[Any] = []
        for ws in list(self.stream_subscribers.get(room_key) or ()):
            try:
                await ws.send_bytes(frame)
            except Exception:
                dead.append(ws)
        for ws in dead:
            subs = self.stream_subscribers.get(room_key)
            if subs is not None:
                subs.discard(ws)

    async def handle_detection_listener(self, websocket: WebSocket) -> None:
        """FastAPI /api/ws — detection-test page listens for wheelchair_detection events."""
        await websocket.accept()
        self.detection_listeners.add(websocket)
        try:
            while True:
                await websocket.receive()
        except Exception:
            pass
        finally:
            self.detection_listeners.discard(websocket)

    async def handle_stream_subscriber(self, websocket: WebSocket, room_ref: str) -> None:
        """FastAPI /ws/stream/{room} — push latest JPEG frames to the detection-test page."""
        room_key = normalize_physical_room_key(room_ref)
        await websocket.accept()
        subs = self.stream_subscribers.setdefault(room_key, set())
        subs.add(websocket)
        frame = self.latest_frames.get(room_key)
        if frame:
            try:
                await websocket.send_bytes(frame)
            except Exception:
                pass
        try:
            while True:
                await websocket.receive()
        except Exception:
            pass
        finally:
            subs.discard(websocket)
            if not subs:
                self.stream_subscribers.pop(room_key, None)

    def _record_frame(self, rec: dict[str, Any], room_key: str, frame: bytes) -> None:
        """Write a captured frame to disk, throttled to the recorder's fps."""
        now = time.monotonic()
        if now - rec["last_ts"] < rec["interval"]:
            return
        if len(frame) < 100 or frame[0:2] != b"\xff\xd8":
            return
        rec["last_ts"] = now
        rec["count"] += 1
        n = rec["count"]
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")[:-3]
        try:
            (rec["dir"] / f"{room_key}_{ts}_{n:05d}.jpg").write_bytes(frame)
            mjpg = rec.get("mjpg")
            if mjpg is not None:
                mjpg.write(frame)
                if n % 50 == 0:
                    mjpg.flush()
        except Exception as exc:
            logger.warning("frame recorder write failed (%s): %s", room_key, exc)

    def start_recording(self, room_key: str, save_dir: str, fps: float) -> dict[str, Any]:
        if room_key in self.frame_recorders:
            raise HTTPException(status_code=409, detail=f"Already recording {room_key}")
        out_dir = CAPTURE_ROOT / save_dir / room_key if save_dir else CAPTURE_ROOT / room_key
        out_dir.mkdir(parents=True, exist_ok=True)
        mjpg = open(out_dir / f"{room_key}.mjpg", "ab")
        interval = 1.0 / fps if fps > 0 else 0.0
        rec = {
            "room": room_key,
            "dir": out_dir,
            "rel_dir": str(out_dir.relative_to(CAPTURE_ROOT)),
            "interval": interval,
            "count": 0,
            "last_ts": 0.0,
            "started": datetime.now(timezone.utc).isoformat(),
            "mjpg": mjpg,
        }
        self.frame_recorders[room_key] = rec
        logger.info("recording started for %s -> %s (fps=%.2f)", room_key, out_dir, fps)
        return {"recording": True, "room": room_key, "dir": rec["rel_dir"], "fps": fps}

    def stop_recording(self, room_key: str) -> dict[str, Any] | None:
        rec = self.frame_recorders.pop(room_key, None)
        if rec is None:
            return None
        try:
            rec["mjpg"].close()
        except Exception:
            pass
        logger.info("recording stopped for %s: %d frames in %s", room_key, rec["count"], rec["dir"])
        return {
            "recording": False,
            "room": room_key,
            "dir": rec["rel_dir"],
            "frames": rec["count"],
            "video": f"{rec['rel_dir']}/{room_key}.mjpg",
        }

    def recording_status(self) -> dict[str, Any]:
        return {
            room: {
                "recording": True,
                "dir": rec["rel_dir"],
                "frames": rec["count"],
                "interval": rec["interval"],
                "started": rec["started"],
            }
            for room, rec in self.frame_recorders.items()
        }

    async def handle_fastapi_camera_service(self, websocket: Any) -> None:
        await websocket.accept()
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            data = json.loads(raw)
            if data.get("type") == "register" and data.get("service") == "camera-service":
                self.camera_service_connection = websocket
                await websocket.send_text(json.dumps({"type": "registered", "status": "ok"}))
                logger.info("camera-service (YOLOv8) connected via FastAPI /ws/camera-service")
            else:
                await websocket.close()
                return

            while True:
                msg = await websocket.receive()
                if "text" in msg and msg["text"]:
                    try:
                        payload = json.loads(msg["text"])
                        if payload.get("type") == "detection":
                            await self.broadcast_detection_event(payload)
                            await self._handle_yolo_detection(payload)
                    except json.JSONDecodeError:
                        pass
        except Exception as exc:
            logger.info("FastAPI camera-service disconnected: %s", exc)
        finally:
            if self.camera_service_connection is websocket:
                self.camera_service_connection = None

    async def _handle_yolo_detection(self, detection: dict[str, Any]) -> None:
        """Process YOLOv8 wheelchair/fall detection and apply it to Robert Chen."""
        detected = bool(detection.get("detected", False))
        if not detected:
            return

        room_key = normalize_physical_room_key(detection.get("room", "livingroom"))
        confidence = float(detection.get("confidence", 0.9) or 0.9)
        fall_detected = bool(detection.get("fall_detected", False))
        # TsimCam data is recorded under the room's Model-Node id (Model-Node 1-4);
        # the raw camera-reported id is kept for traceability only.
        reported_device_id = str(detection.get("device_id") or "")
        device_id = str(PHYSICAL_ROOM_META[room_key]["default_node"])
        target_room_name = PHYSICAL_ROOM_META[room_key]["facility_room_name"]

        now_mono = time.monotonic()
        room_changed = self.last_detected_room_key != room_key
        if not room_changed and not fall_detected and (now_mono - self.last_detection_ts) < 2.0:
            return

        prev_room_key = self.last_detected_room_key
        self.last_detected_room_key = room_key
        self.last_detection_ts = now_mono

        async with AsyncSessionLocal() as session:
            # Find Robert Chen (prefer demo workspace)
            q_robert = await session.execute(
                select(Patient)
                .where(
                    Patient.first_name.ilike("Robert%"),
                    Patient.is_active.is_(True),
                )
                .order_by(Patient.id.asc())
            )
            robert = q_robert.scalars().first()
            if robert is None:
                return

            ws_id = robert.workspace_id
            q_room = await session.execute(
                select(Room).where(
                    Room.workspace_id == ws_id,
                    Room.name == target_room_name,
                )
            )
            target_room = q_room.scalars().first()
            if target_room is None:
                return

            # Find Robert's wheelchair device_id (e.g. SIM_WHEEL_02)
            q_assign = await session.execute(
                select(PatientDeviceAssignment)
                .where(
                    PatientDeviceAssignment.workspace_id == ws_id,
                    PatientDeviceAssignment.patient_id == robert.id,
                    PatientDeviceAssignment.is_active.is_(True),
                )
                .order_by(PatientDeviceAssignment.id.asc())
            )
            assignment = q_assign.scalars().first()
            wheelchair_dev_id = assignment.device_id if assignment else "SIM_WHEEL_02"

            now_dt = utcnow()
            session.add(
                RoomPrediction(
                    workspace_id=ws_id,
                    device_id=wheelchair_dev_id,
                    timestamp=now_dt,
                    predicted_room_id=target_room.id,
                    predicted_room_name=target_room.name,
                    confidence=confidence,
                    model_type="yolov8",
                    rssi_vector={device_id: -35},
                )
            )

            # Save latest frame as a PhotoRecord on room change or fall so floorplan thumbnail stays fresh
            if (room_changed or fall_detected) and room_key in self.latest_frames:
                await self.save_room_snapshot_if_available(
                    session,
                    ws_id=ws_id,
                    room_key=room_key,
                    device_id=target_room.node_device_id or device_id,
                )

            if room_changed and prev_room_key is not None:
                prev_room_name = PHYSICAL_ROOM_META[prev_room_key]["facility_room_name"]
                q_prev = await session.execute(
                    select(Room).where(Room.workspace_id == ws_id, Room.name == prev_room_name)
                )
                prev_room = q_prev.scalars().first()
                if prev_room is not None:
                    session.add(
                        ActivityTimeline(
                            workspace_id=ws_id,
                            patient_id=robert.id,
                            timestamp=now_dt,
                            event_type="room_exit",
                            room_id=prev_room.id,
                            room_name=prev_room.name,
                            description=f"Left {prev_room.name}",
                            data={"source": "tsimcam_yolo", "destination": target_room.name},
                            source="auto",
                        )
                    )
                    # House Check: check if any appliance was left ON in prev_room
                    if (now_mono - self.last_house_check_alert_ts) >= 20.0:
                        q_smart = await session.execute(
                            select(SmartDevice).where(
                                SmartDevice.workspace_id == ws_id,
                                SmartDevice.room_id == prev_room.id,
                                SmartDevice.is_active.is_(True),
                            )
                        )
                        left_on = [
                            sd.name
                            for sd in q_smart.scalars().all()
                            if (sd.state or "off").lower() not in ("off", "unknown", "unavailable")
                        ]
                        if left_on:
                            self.last_house_check_alert_ts = now_mono
                            hc_alert = Alert(
                                workspace_id=ws_id,
                                patient_id=robert.id,
                                device_id=wheelchair_dev_id,
                                timestamp=now_dt,
                                alert_type="zone_violation",
                                severity="warning",
                                title=f"Appliance Left ON in {prev_room.name}",
                                description=(
                                    f"Robert Chen moved to {target_room.name} while "
                                    f"{', '.join(left_on)} remained ON in {prev_room.name}."
                                ),
                                data={
                                    "room_id": prev_room.id,
                                    "room_name": prev_room.name,
                                    "devices_left_on": left_on,
                                    "source": "house_check",
                                },
                                status="active",
                            )
                            session.add(hc_alert)

                session.add(
                    ActivityTimeline(
                        workspace_id=ws_id,
                        patient_id=robert.id,
                        timestamp=now_dt + timedelta(milliseconds=200),
                        event_type="room_enter",
                        room_id=target_room.id,
                        room_name=target_room.name,
                        description=f"Entered {target_room.name}",
                        data={
                            "source": "tsimcam_yolo",
                            "confidence": round(confidence, 2),
                            "camera_device_id": device_id,
                            "reported_device_id": reported_device_id,
                        },
                        source="auto",
                    )
                )
                logger.info(
                    "TsimCam YOLOv8 moved Robert Chen -> %s (confidence=%.2f)",
                    target_room.name,
                    confidence,
                )

            if fall_detected and (now_mono - self.last_fall_alert_ts) >= 30.0:
                self.last_fall_alert_ts = now_mono
                q_loc = await session.execute(
                    select(Floor.name, Facility.name)
                    .join(Facility, Facility.id == Floor.facility_id)
                    .where(Floor.id == target_room.floor_id)
                )
                floor_name, facility_name = q_loc.one_or_none() or ("", "")
                location_line = ", ".join(
                    part for part in (target_room.name, floor_name or "", facility_name or "") if part
                )
                fall_alert = Alert(
                    workspace_id=ws_id,
                    patient_id=robert.id,
                    device_id=wheelchair_dev_id,
                    timestamp=now_dt,
                    alert_type="fall",
                    severity="critical",
                    title=f"Fall Detected: Robert Chen in {target_room.name}",
                    description=(
                        f"Wheelchair fall detected for Robert Chen — "
                        f"location: {location_line or target_room.name}."
                    ),
                    data={
                        "room_id": target_room.id,
                        "room_name": target_room.name,
                        "camera_device_id": device_id,
                        "reported_device_id": reported_device_id,
                        "confidence": confidence,
                        "source": "tsimcam_yolo",
                    },
                    status="active",
                )
                session.add(fall_alert)
                await session.flush()
                publish_alert_to_mqtt_background(fall_alert)
                logger.warning("TsimCam YOLOv8 FALL ALERT created for Robert Chen in %s", target_room.name)

            await session.commit()

    async def save_room_snapshot_if_available(
        self,
        session: Any,
        *,
        ws_id: int,
        room_key: str,
        device_id: str,
    ) -> PhotoRecord | None:
        frame = self.latest_frames.get(room_key)
        if not frame:
            for v in self.latest_frames.values():
                if v:
                    frame = v
                    break
        if not frame:
            return None

        photo_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "photos"))
        os.makedirs(photo_dir, exist_ok=True)
        photo_id = f"tsim_{room_key}_{int(time.time() * 1000)}"
        filepath = os.path.join(photo_dir, f"{photo_id}.jpg")
        try:
            with open(filepath, "wb") as f:
                f.write(frame)
        except OSError:
            return None

        record = PhotoRecord(
            workspace_id=ws_id,
            device_id=device_id,
            photo_id=photo_id,
            filepath=filepath,
            file_size=len(frame),
            timestamp=utcnow(),
        )
        session.add(record)
        await session.flush()
        return record

    async def _touch_hardware_device(
        self,
        device_id: str,
        *,
        ip_address: str = "",
        room_key: str = "",
    ) -> None:
        try:
            async with AsyncSessionLocal() as session:
                q = await session.execute(select(Device).where(Device.device_id == device_id))
                for dev in q.scalars().all():
                    dev.last_seen = utcnow()
                    if ip_address:
                        dev.ip_address = ip_address
                    cfg = dict(dev.config or {})
                    if room_key:
                        cfg["room_key"] = room_key
                    dev.config = cfg
                await session.commit()
        except Exception:
            pass

    async def _run_local_hardware_mqtt_listener(self) -> None:
        """Listen on local Mosquitto for CucumberRS state_sync_request and TsimCam/CucumberRS status."""
        client_id = f"wheelsense-hw-bridge-{uuid.uuid4().hex[:8]}"
        while True:
            try:
                async with aiomqtt.Client(
                    hostname=self.local_mqtt_broker,
                    port=self.local_mqtt_port,
                    identifier=client_id,
                ) as client:
                    await client.subscribe("WheelSense/central/state_sync_request")
                    await client.subscribe("WheelSense/central/status")
                    await client.subscribe("WheelSense/+/registration")
                    await client.subscribe("WheelSense/+/status")
                    await client.subscribe("WheelSense/config/all")
                    logger.info(
                        "HardwareBridge connected to local MQTT %s:%d",
                        self.local_mqtt_broker,
                        self.local_mqtt_port,
                    )
                    async for message in client.messages:
                        topic = str(message.topic)
                        try:
                            if topic == "WheelSense/central/state_sync_request":
                                await self._handle_cucumber_state_sync_request(client)
                            elif topic == "WheelSense/central/status":
                                await self._touch_hardware_device("CucumberRS", ip_address="MQTT:1883")
                            elif topic == "WheelSense/config/all":
                                data = json.loads(message.payload)
                                url = str(data.get("portal_base_url") or "").strip()
                                if url and url != settings.portal_base_url:
                                    settings.portal_base_url = url
                                    logger.info("Updated settings.portal_base_url from MQTT: %s", url)
                            elif topic.endswith("/registration") or topic.endswith("/status"):
                                parts = topic.split("/")
                                if len(parts) >= 3 and parts[1] in PHYSICAL_ROOM_META:
                                    data = json.loads(message.payload)
                                    did = PHYSICAL_ROOM_META[parts[1]]["default_node"]
                                    await self._touch_hardware_device(
                                        did,
                                        ip_address=str(data.get("ip_address") or ""),
                                        room_key=parts[1],
                                    )
                        except Exception as exc:
                            logger.debug("Hardware MQTT message error on %s: %s", topic, exc)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.debug("Local hardware MQTT reconnect in 5s (%s)", exc)
                await asyncio.sleep(5.0)

    async def _handle_cucumber_state_sync_request(self, client: aiomqtt.Client) -> None:
        """Send current SmartDevice states for all 4 rooms to CucumberRS."""
        room_states: dict[str, dict[str, bool]] = {
            "livingroom": {},
            "bedroom": {},
            "kitchen": {},
            "bathroom": {},
        }
        async with AsyncSessionLocal() as session:
            q = await session.execute(select(SmartDevice).where(SmartDevice.is_active.is_(True)))
            for sd in q.scalars().all():
                cfg = sd.config if isinstance(sd.config, dict) else {}
                rkey = cfg.get("room_key")
                app_name = cfg.get("appliance")
                if not rkey or not app_name or rkey not in room_states:
                    continue
                norm_key = "AC" if str(app_name).upper() == "AC" else str(app_name).lower()
                is_on = (sd.state or "off").lower() not in ("off", "unknown", "unavailable")
                room_states[rkey][norm_key] = is_on

        for rkey, appliances in room_states.items():
            if not appliances:
                continue
            payload = {
                "type": "state_sync",
                "room": rkey,
                "appliances": appliances,
            }
            await client.publish(
                f"WheelSense/{rkey}/state_sync",
                json.dumps(payload).encode("utf-8"),
                qos=1,
            )
        logger.info("Sent CucumberRS state_sync for 4 rooms")

    async def publish_cucumber_control(
        self,
        *,
        room_key: str,
        appliance: str,
        state: bool,
        value: int | float | None = None,
    ) -> bool:
        norm_room = normalize_physical_room_key(room_key)
        norm_app = "AC" if str(appliance).upper() == "AC" else str(appliance).lower()
        cmd: dict[str, Any] = {
            "type": "control",
            "room": norm_room,
            "appliance": norm_app,
            "state": bool(state),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if value is not None:
            cmd["value"] = int(round(float(value)))

        topic = f"WheelSense/{norm_room}/control"
        try:
            async with aiomqtt.Client(
                hostname=self.local_mqtt_broker,
                port=self.local_mqtt_port,
                identifier=f"wheelsense-ctrl-{uuid.uuid4().hex[:8]}",
            ) as client:
                await client.publish(topic, json.dumps(cmd).encode("utf-8"), qos=1)
            logger.info(
                "CucumberRS MQTT control sent: %s -> %s=%s",
                topic,
                norm_app,
                "ON" if state else "OFF",
            )
            return True
        except Exception as exc:
            logger.warning("Failed to publish CucumberRS control to %s: %s", topic, exc)
            return False


hardware_bridge = HardwareBridge()


@video_router.get("/video/{room_ref}")
async def get_live_video_frame(room_ref: str, request: Request) -> FastAPIResponse:
    """Serve the latest live JPEG frame from TsimCam or a live status SVG preview."""
    rkey = normalize_physical_room_key(room_ref)
    meta = PHYSICAL_ROOM_META[rkey]

    frame_bytes = hardware_bridge.latest_frames.get(rkey)
    if not frame_bytes:
        for v in hardware_bridge.latest_frames.values():
            if v:
                frame_bytes = v
                break

    if frame_bytes:
        return FastAPIResponse(
            content=frame_bytes,
            media_type="image/jpeg",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
        )

    is_robert_here = (hardware_bridge.last_detected_room_key or "bedroom") == rkey
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
      <circle cx="52" cy="54" r="8" fill="{'#22c55e' if is_robert_here else '#38bdf8'}"/>
      <text x="70" y="60" fill="#f8fafc" font-family="sans-serif" font-size="19" font-weight="bold">
        {meta['facility_room_name']} ({meta['name_th']}) — {meta['default_node']}
      </text>
      <text x="515" y="58" fill="#94a3b8" font-family="monospace" font-size="15">{now_str}</text>
      <rect x="44" y="96" width="552" height="170" rx="12" fill="#090d16" stroke="#1e293b"/>
      <text x="320" y="165" text-anchor="middle" fill="#e2e8f0" font-family="sans-serif" font-size="21" font-weight="bold">
        {'Robert Chen Detected in ' + meta['facility_room_name'] if is_robert_here else 'Waiting for TsimCam Stream (WS Port 8765)'}
      </text>
      <text x="320" y="205" text-anchor="middle" fill="#38bdf8" font-family="sans-serif" font-size="16">
        TsimCam + YOLOv8 Linked to Patient: Robert Chen
      </text>
      <text x="320" y="308" text-anchor="middle" fill="#64748b" font-family="sans-serif" font-size="14">
        WheelSense Hybrid Hardware + Simulator Stack • CucumberRS MQTT Ready
      </text>
    </svg>"""
    return FastAPIResponse(
        content=svg.encode("utf-8"),
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


@video_router.websocket("/ws")
async def detection_events_ws(websocket: WebSocket) -> None:
    """Public detection broadcast for the detection-test page (was /ws on the old backend)."""
    await hardware_bridge.handle_detection_listener(websocket)


@video_router.get("/map/devices")
async def list_map_devices() -> dict[str, Any]:
    """Camera devices for the detection-test page, one tile per physical room.

    Cameras report their own device_id (e.g. TSIM_003); every live connection
    is folded into the canonical MODEL_NODE_* slot for its room so the same
    physical camera can never appear as a second tile.
    """
    room_connections: dict[str, list[str]] = {}
    for did, room in hardware_bridge.device_rooms.items():
        room_connections.setdefault(normalize_physical_room_key(room), []).append(did)

    devices: list[dict[str, Any]] = []
    for key, meta in PHYSICAL_ROOM_META.items():
        did = str(meta["default_node"])
        reported_ids = room_connections.get(key, [])
        st = hardware_bridge.device_status.get(did, {})
        online = did in hardware_bridge.camera_connections or bool(st.get("online"))
        ip = str(st.get("ip", "") or "")
        rotation = hardware_bridge.device_rotations.get(did, 0)
        for reported in reported_ids:
            if reported == did:
                continue
            rst = hardware_bridge.device_status.get(reported, {})
            if reported in hardware_bridge.camera_connections or rst.get("online"):
                online = True
            if not ip:
                ip = str(rst.get("ip", "") or "")
            if not rotation:
                rotation = hardware_bridge.device_rotations.get(reported, 0)
        devices.append(
            {
                "id": did,
                "deviceId": did,
                "name": f"TsimCam {did}",
                "type": "camera",
                "room": key,
                "roomType": key,
                "rotation": rotation,
                "online": online,
                "ip": ip,
                "reported_device_ids": reported_ids,
            }
        )
    return {"devices": devices}


@video_router.post("/nodes/{device_id}/rotate")
async def rotate_map_device(device_id: str, degrees: int = 90) -> dict[str, Any]:
    """Set camera rotation applied server-side before YOLO detection."""
    rotate_deg = degrees % 360
    if rotate_deg not in (0, 90, 180, 270):
        rotate_deg = round(rotate_deg / 90) * 90 % 360
    # A canonical MODEL_NODE_* id stands in for whatever camera is connected to
    # that room (frames are forwarded under the reported id, e.g. TSIM_003), so
    # apply the rotation to both namespaces to keep them in sync.
    canonical_ids = {
        str(meta["default_node"]): key for key, meta in PHYSICAL_ROOM_META.items()
    }
    targets = {device_id}
    room_key = canonical_ids.get(device_id)
    if room_key is None and device_id in hardware_bridge.device_rooms:
        room_key = normalize_physical_room_key(hardware_bridge.device_rooms[device_id])
        canonical = PHYSICAL_ROOM_META[room_key]["default_node"]
        targets.add(str(canonical))
    if room_key is not None:
        for did, room in hardware_bridge.device_rooms.items():
            if normalize_physical_room_key(room) == room_key:
                targets.add(did)
    for did in targets:
        hardware_bridge.device_rotations[did] = rotate_deg
    return {
        "status": "success",
        "device_id": device_id,
        "rotation": rotate_deg,
    }


@video_router.post("/detection/threshold")
async def set_detection_threshold(request: Request) -> dict[str, Any]:
    data = await request.json()
    hardware_bridge.detection_threshold = float(data.get("threshold", 0.8))
    return {"status": "ok", "threshold": hardware_bridge.detection_threshold}


@video_router.post("/detection/notify")
async def detection_notify(request: Request) -> dict[str, Any]:
    """Forward a detection confirmed on the test page into the position pipeline."""
    data = await request.json()
    if data.get("detected"):
        await hardware_bridge._handle_yolo_detection(
            {
                "type": "detection",
                "room": data.get("room"),
                "detected": True,
                "confidence": float(data.get("confidence", 0.9) or 0.9),
                "bbox": data.get("bbox"),
                "device_id": data.get("device_id"),
                "fall_detected": data.get("fall_detected", False),
                "fall_reason": data.get("fall_reason"),
            }
        )
    return {"status": "ok"}


@video_router.get("/capture/config")
async def capture_config() -> dict[str, Any]:
    """Save root + active recordings for the detection-test capture UI."""
    return {
        "root": str(CAPTURE_ROOT),
        "recording": hardware_bridge.recording_status(),
    }


@video_router.get("/capture/browse")
async def capture_browse(path: str = "") -> dict[str, Any]:
    """List subdirectories under CAPTURE_ROOT for the folder picker."""
    rel = _safe_subdir(path)
    root = CAPTURE_ROOT.resolve()
    target = (root / rel).resolve() if rel else root
    if target != root and root not in target.parents:
        raise HTTPException(status_code=400, detail="Path outside capture root")
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"Folder not found: {rel or '/'}")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Not a folder")
    dirs = sorted(
        p.name for p in target.iterdir() if p.is_dir() and not p.name.startswith(".")
    )
    parent = rel.rsplit("/", 1)[0] if "/" in rel else ""
    return {
        "path": rel,
        "parent": parent if rel else None,
        "dirs": dirs,
        "root": str(root),
    }


@video_router.post("/capture/mkdir")
async def capture_mkdir(request: Request) -> dict[str, Any]:
    """Create a folder under CAPTURE_ROOT from the folder picker."""
    data = await request.json()
    rel = _safe_subdir(data.get("path"))
    if not rel:
        raise HTTPException(status_code=400, detail="Invalid folder name")
    target = (CAPTURE_ROOT / rel).resolve()
    root = CAPTURE_ROOT.resolve()
    if root not in target.parents:
        raise HTTPException(status_code=400, detail="Path outside capture root")
    target.mkdir(parents=True, exist_ok=True)
    return {"status": "ok", "path": rel}


@video_router.post("/capture/{room_ref}/snapshot")
async def capture_snapshot(room_ref: str, request: Request) -> dict[str, Any]:
    """Save the latest JPEG frame for one camera to disk."""
    room_key = normalize_physical_room_key(room_ref)
    try:
        data = await request.json()
    except Exception:
        data = {}
    save_dir = _safe_subdir(data.get("save_dir")) or "snapshots"
    frame = hardware_bridge.latest_frames.get(room_key)
    if not frame or len(frame) < 100 or frame[0:2] != b"\xff\xd8":
        raise HTTPException(status_code=404, detail=f"No frame available for {room_key}")
    out_dir = CAPTURE_ROOT / save_dir / room_key
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")[:-3]
    path = out_dir / f"{room_key}_{ts}.jpg"
    path.write_bytes(frame)
    return {
        "status": "ok",
        "room": room_key,
        "file": str(path.relative_to(CAPTURE_ROOT)),
        "bytes": len(frame),
    }


@video_router.get("/record/status")
async def record_status() -> dict[str, Any]:
    return {"recording": hardware_bridge.recording_status()}


@video_router.post("/record/{room_ref}/start")
async def record_start(room_ref: str, request: Request) -> dict[str, Any]:
    """Start saving frames for one camera: JPEG sequence + .mjpg video."""
    room_key = normalize_physical_room_key(room_ref)
    try:
        data = await request.json()
    except Exception:
        data = {}
    save_dir = _safe_subdir(data.get("save_dir"))
    fps = float(data.get("fps", 5) or 5)
    fps = min(max(fps, 0.2), 15.0)
    return hardware_bridge.start_recording(room_key, save_dir, fps)


@video_router.post("/record/{room_ref}/stop")
async def record_stop(room_ref: str) -> dict[str, Any]:
    room_key = normalize_physical_room_key(room_ref)
    result = hardware_bridge.stop_recording(room_key)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Not recording {room_key}")
    return result
