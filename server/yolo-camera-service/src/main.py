from __future__ import annotations

import base64
import json
import logging
import time
from dataclasses import asdict
from typing import Any

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from .config import settings
from .detector import DetectionResult, YoloFallDetector

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("wheelsense.yolo_camera")

app = FastAPI(title="WheelSense Physical Model YOLO Camera Service", version="1.0.0")
detector = YoloFallDetector(
    model_path=settings.yolo_model_path,
    confidence_threshold=settings.yolo_confidence_threshold,
    device=settings.yolo_device,
)
last_alert_by_room: dict[str, float] = {}
stats: dict[str, Any] = {
    "frames_seen": 0,
    "detections": 0,
    "alerts_sent": 0,
    "last_room": None,
    "last_error": None,
}


class JsonDetectRequest(BaseModel):
    image_base64: str = Field(min_length=1)
    room: str = "livingroom"
    device_id: str | None = None
    force: bool = False


def room_to_alias(room: str | None) -> str:
    normalized = (room or "livingroom").strip().lower().replace("_", " ").replace("-", " ")
    aliases = {
        "bedroom": "Bedroom",
        "room 401": "Bedroom",
        "livingroom": "Living Room",
        "living room": "Living Room",
        "room 402": "Living Room",
        "bathroom": "Bathroom",
        "kitchen": "Kitchen / Dining",
        "dining": "Kitchen / Dining",
        "dining room": "Kitchen / Dining",
        "kitchen dining": "Kitchen / Dining",
        "kitchen / dining": "Kitchen / Dining",
    }
    return aliases.get(normalized, room or "Living Room")


@app.on_event("startup")
def load_model() -> None:
    try:
        detector.load()
        stats["model_loaded"] = True
    except Exception as exc:
        stats["model_loaded"] = False
        stats["last_error"] = str(exc)
        logger.exception("Failed to load YOLO model")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok" if detector.model_loaded else "model_unavailable",
        "model_loaded": detector.model_loaded,
        "model_path": str(detector.model_path),
        "device": detector.device,
        "stats": stats,
    }


@app.post("/detect")
async def detect_upload(
    file: UploadFile = File(...),
    room: str = Form("livingroom"),
    device_id: str | None = Form(None),
    force: bool = Form(False),
) -> dict[str, Any]:
    image_bytes = await file.read()
    result = detector.detect_jpeg(image_bytes)
    return await handle_detection(result, room=room, device_id=device_id, force=force)


@app.post("/detect-json")
async def detect_json(payload: JsonDetectRequest) -> dict[str, Any]:
    try:
        image_bytes = base64.b64decode(payload.image_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="image_base64 must be valid base64") from exc
    result = detector.detect_jpeg(image_bytes)
    return await handle_detection(result, room=payload.room, device_id=payload.device_id, force=payload.force)


@app.websocket("/ws/camera/{room}")
async def camera_ws(websocket: WebSocket, room: str) -> None:
    await camera_ws_session(websocket, room)


@app.websocket("/")
async def legacy_camera_ws_root(websocket: WebSocket) -> None:
    await camera_ws_session(websocket, "livingroom")


@app.websocket("/ws")
async def legacy_camera_ws(websocket: WebSocket) -> None:
    await camera_ws_session(websocket, "livingroom")


async def camera_ws_session(websocket: WebSocket, room: str) -> None:
    await websocket.accept()
    meta: dict[str, Any] = {"room": room, "device_id": settings.device_id, "force": False}
    await websocket.send_json({"type": "connected", "service": "wheelsense-yolo-camera", "room": room})
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if "text" in message and message["text"] is not None:
                await _handle_ws_text(websocket, meta, message["text"])
            elif "bytes" in message and message["bytes"] is not None:
                result = detector.detect_jpeg(message["bytes"])
                response = await handle_detection(
                    result,
                    room=str(meta.get("room") or room),
                    device_id=str(meta.get("device_id") or settings.device_id),
                    force=bool(meta.get("force")),
                )
                await websocket.send_json({"type": "detection", **response})
    except WebSocketDisconnect:
        logger.info("Camera websocket disconnected for room=%s", room)
    except Exception as exc:
        stats["last_error"] = str(exc)
        logger.exception("Camera websocket error")
        await websocket.close(code=1011, reason=str(exc)[:120])


async def _handle_ws_text(websocket: WebSocket, meta: dict[str, Any], text: str) -> None:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        await websocket.send_json({"type": "error", "detail": "Text messages must be JSON metadata"})
        return

    if isinstance(data, dict):
        for key in ("room", "device_id", "force"):
            if key in data:
                meta[key] = data[key]
        image_base64 = data.get("image_base64") or data.get("frame")
        if isinstance(image_base64, str) and image_base64:
            image_bytes = base64.b64decode(image_base64, validate=True)
            result = detector.detect_jpeg(image_bytes)
            response = await handle_detection(
                result,
                room=str(meta.get("room") or "livingroom"),
                device_id=str(meta.get("device_id") or settings.device_id),
                force=bool(meta.get("force")),
            )
            await websocket.send_json({"type": "detection", **response})
        else:
            await websocket.send_json({"type": "metadata_updated", "metadata": meta})


async def handle_detection(
    result: DetectionResult,
    *,
    room: str,
    device_id: str | None,
    force: bool,
) -> dict[str, Any]:
    stats["frames_seen"] += 1
    stats["last_room"] = room
    if result.detected:
        stats["detections"] += 1

    alert_response: dict[str, Any] | None = None
    cooldown_reason: str | None = None
    room_alias = room_to_alias(room)
    if result.detected:
        now = time.monotonic()
        last_alert = last_alert_by_room.get(room_alias, 0)
        elapsed = now - last_alert
        if force or elapsed >= settings.yolo_fall_cooldown_seconds:
            alert_response = await post_fall_event(
                result,
                room_alias=room_alias,
                device_id=device_id,
                force=force,
            )
            last_alert_by_room[room_alias] = now
            stats["alerts_sent"] += 1
        else:
            remaining = settings.yolo_fall_cooldown_seconds - elapsed
            cooldown_reason = f"cooldown {remaining:.0f}s"

    return {
        "room": room,
        "room_alias": room_alias,
        "detection": asdict(result),
        "alert": alert_response,
        "cooldown_reason": cooldown_reason,
    }


async def post_fall_event(
    result: DetectionResult,
    *,
    room_alias: str,
    device_id: str | None,
    force: bool,
) -> dict[str, Any]:
    if not settings.wheelsense_internal_secret:
        raise RuntimeError("WHEELSENSE_INTERNAL_SECRET is required")

    payload = {
        "room_alias": room_alias,
        "patient_name": settings.patient_name,
        "detected": result.detected,
        "confidence": result.confidence,
        "source": settings.source,
        "device_id": device_id or settings.device_id,
        "method": result.method,
        "bbox": result.bbox,
        "frame_size": result.frame_size,
        "force": force,
    }
    params: dict[str, Any] = {}
    if settings.wheelsense_workspace_id is not None:
        params["workspace_id"] = settings.wheelsense_workspace_id
    elif settings.wheelsense_workspace_name:
        params["workspace_name"] = settings.wheelsense_workspace_name

    url = f"{settings.wheelsense_api_base_url.rstrip('/')}/api/demo/physical-model/yolo-fall-events/internal"
    headers = {"X-WheelSense-Internal-Secret": settings.wheelsense_internal_secret}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(url, params=params, json=payload, headers=headers)
    if response.status_code >= 400:
        raise RuntimeError(f"WheelSense backend returned {response.status_code}: {response.text}")
    return response.json()
