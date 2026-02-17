"""
Low-latency camera streaming hub.

This module receives camera frames from firmware via WebSocket and fans out
frames to dashboard clients per room.
"""

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Dict, Optional

from fastapi import WebSocket, WebSocketDisconnect


logger = logging.getLogger(__name__)


@dataclass
class DashboardClient:
    websocket: WebSocket
    queue: asyncio.Queue
    sender_task: asyncio.Task


class CameraStreamHub:
    """In-memory room stream fanout with small per-client queues."""

    def __init__(self):
        self._latest_frames: Dict[str, bytes] = {}
        self._room_clients: Dict[str, Dict[int, DashboardClient]] = {}
        self._camera_room_by_device: Dict[str, str] = {}
        self._camera_device_by_socket: Dict[int, str] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _normalize_room(
        room_id: Optional[str],
        room_name: Optional[str] = None,
        room_type: Optional[str] = None,
    ) -> str:
        room = (room_id or "").strip()
        if room:
            return room
        room = (room_name or "").strip()
        if room:
            return room
        room = (room_type or "").strip()
        if room:
            return room
        return "unknown"

    @staticmethod
    def _offer_frame(queue: asyncio.Queue, frame: bytes):
        # Keep queue tiny for low-latency delivery: drop oldest, keep newest.
        if queue.full():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            queue.put_nowait(frame)
        except asyncio.QueueFull:
            # Another producer filled queue in between; dropping is acceptable.
            pass

    async def _dashboard_sender(self, websocket: WebSocket, queue: asyncio.Queue):
        while True:
            frame = await queue.get()
            await websocket.send_bytes(frame)

    async def _remove_dashboard_client(self, room: str, socket_id: int):
        async with self._lock:
            room_clients = self._room_clients.get(room)
            if not room_clients:
                return
            room_clients.pop(socket_id, None)
            if not room_clients:
                self._room_clients.pop(room, None)

    async def _update_camera_mapping(self, socket_id: int, device_id: str, room: str):
        async with self._lock:
            previous_device = self._camera_device_by_socket.get(socket_id)
            if previous_device and previous_device != device_id:
                self._camera_room_by_device.pop(previous_device, None)

            self._camera_device_by_socket[socket_id] = device_id
            self._camera_room_by_device[device_id] = room

    async def _get_room_for_socket(self, socket_id: int) -> str:
        async with self._lock:
            device_id = self._camera_device_by_socket.get(socket_id)
            if not device_id:
                return "unknown"
            return self._camera_room_by_device.get(device_id, "unknown")

    async def _broadcast_frame(self, room: str, frame: bytes):
        async with self._lock:
            self._latest_frames[room] = frame
            clients = list(self._room_clients.get(room, {}).values())

        for client in clients:
            self._offer_frame(client.queue, frame)

    async def handle_camera_socket(self, websocket: WebSocket):
        await websocket.accept()
        socket_id = id(websocket)
        fallback_device_id = f"camera-{socket_id}"
        await self._update_camera_mapping(socket_id, fallback_device_id, "unknown")

        try:
            while True:
                message = await websocket.receive()
                msg_type = message.get("type")
                if msg_type == "websocket.disconnect":
                    break

                text = message.get("text")
                if text is not None:
                    await self._handle_camera_text(socket_id, fallback_device_id, text)
                    continue

                binary = message.get("bytes")
                if binary:
                    room = await self._get_room_for_socket(socket_id)
                    await self._broadcast_frame(room, binary)
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.warning("Camera socket error: %s", exc)
        finally:
            async with self._lock:
                device_id = self._camera_device_by_socket.pop(socket_id, None)
                if device_id:
                    self._camera_room_by_device.pop(device_id, None)

    async def _handle_camera_text(self, socket_id: int, fallback_device_id: str, text: str):
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return

        if not isinstance(data, dict):
            return

        message_type = data.get("type")
        if message_type == "ping":
            return

        device_id = str(data.get("device_id") or fallback_device_id).strip()
        room = self._normalize_room(
            room_id=data.get("room_id"),
            room_name=data.get("room_name") or data.get("room"),
            room_type=data.get("room_type"),
        )
        await self._update_camera_mapping(socket_id, device_id, room)

    async def handle_dashboard_socket(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        room = self._normalize_room(room_id)
        socket_id = id(websocket)
        queue: asyncio.Queue = asyncio.Queue(maxsize=2)
        sender_task = asyncio.create_task(self._dashboard_sender(websocket, queue))
        client = DashboardClient(websocket=websocket, queue=queue, sender_task=sender_task)

        async with self._lock:
            self._room_clients.setdefault(room, {})[socket_id] = client
            latest = self._latest_frames.get(room)

        if latest:
            self._offer_frame(queue, latest)

        try:
            while True:
                msg = await websocket.receive()
                msg_type = msg.get("type")
                if msg_type == "websocket.disconnect":
                    break
                text = msg.get("text")
                if text == "ping":
                    await websocket.send_text('{"type":"pong"}')
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.debug("Dashboard stream socket closed: %s", exc)
        finally:
            await self._remove_dashboard_client(room, socket_id)
            sender_task.cancel()
            try:
                await sender_task
            except asyncio.CancelledError:
                pass
            except Exception:
                # Sender exits on socket close; ignore noisy transport errors.
                pass


camera_stream_hub = CameraStreamHub()
