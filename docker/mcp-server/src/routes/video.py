"""
Video APIs - Video streaming and node status endpoints
"""

import asyncio
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import Response
from pydantic import BaseModel

from ..dependencies import get_stream_handler

router = APIRouter(tags=["Video"])


# ==================== Health & Node Status ====================

@router.get("/health")
async def health_check(request: Request):
    """Health check endpoint."""
    db = getattr(request.app.state, 'db', None)
    mqtt_handler = getattr(request.app.state, 'mqtt_handler', None)
    ai_service = getattr(request.app.state, 'ai_service', None)
    
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "database": db.is_connected if db else False,
            "mqtt": mqtt_handler.is_connected if mqtt_handler else False,
            "ai": ai_service is not None
        }
    }


@router.get("/nodes/live-status")
async def get_nodes_live_status(request: Request):
    """Get real-time online/offline status of all connected camera nodes."""
    stream_handler = get_stream_handler(request)
    
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

from ..translation_service import translate_with_cache


class TranslationRequest(BaseModel):
    text: str
    from_lang: str = "en"
    to_lang: str = "th"


@router.post("/translate")
async def translate_text(request_body: TranslationRequest):
    """Translate text using transformer model."""
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        if request_body.from_lang == request_body.to_lang:
            return {
                "translated": request_body.text,
                "from": request_body.from_lang,
                "to": request_body.to_lang
            }
        
        translated = translate_with_cache(
            request_body.text,
            source_lang=request_body.from_lang,
            target_lang=request_body.to_lang
        )
        
        return {
            "translated": translated,
            "from": request_body.from_lang,
            "to": request_body.to_lang
        }
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return {
            "translated": request_body.text,
            "from": request_body.from_lang,
            "to": request_body.to_lang,
            "error": str(e)
        }


# ==================== Video Streaming ====================

@router.get("/stream-url/{room_id}")
async def get_stream_url(room_id: str, request: Request):
    """Get WebSocket stream URL for a room."""
    stream_handler = get_stream_handler(request)
    
    available = stream_handler.is_room_available(room_id) if stream_handler else False
    cameras = stream_handler.get_connected_cameras() if stream_handler else []
    
    return {
        "room_id": room_id,
        "ws_url": f"ws://localhost:8000/ws/stream/{room_id}",
        "available": available,
        "connected_cameras": cameras
    }


@router.get("/api/video/{room_id}")
async def get_video_frame(room_id: str, request: Request):
    """Get latest video frame as JPEG (polling endpoint for fallback)."""
    stream_handler = get_stream_handler(request)
    
    if not stream_handler or room_id not in stream_handler.latest_frames:
        placeholder = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xdb\x00\x00\x00\x00IEND\xaeB`\x82'
        return Response(content=placeholder, media_type="image/png")
    
    frame = stream_handler.latest_frames[room_id]
    return Response(content=frame, media_type="image/jpeg")
