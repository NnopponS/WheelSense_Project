"""Simulator ↔ Godot game bridge service.

Responsibilities:
  * Maintain a single in-process hub for WebSocket clients — two client
    classes matter: `game` (Godot HTML5 export tab) and `dashboard`
    (`/admin/demo-control` tab). Messages are forwarded between them and
    optionally translated into WheelSense domain events.
  * Translate `character_enter_room` events from the game into
    `DemoActorPosition` updates so the dashboard map shows live positions.
  * Expose helpers for reading / writing per-character sensor mode.

Design notes:
  * Hub state is process-local. Multi-replica deployments are out of scope
    for simulator mode (thesis demo runs a single backend).
  * All DB writes go through a fresh `AsyncSessionLocal` so we never
    block on a single long-lived session.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable

from fastapi import WebSocket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.websockets import WebSocketDisconnect, WebSocketState

from app.db.session import AsyncSessionLocal
from app.models import (
    DemoActorPosition,
    Device,
    SimGameActorMap,
    SimGameRoomMap,
)
from app.models.sim_game import (
    SENSOR_MODE_MOCK,
    SENSOR_MODE_REAL,
)

logger = logging.getLogger(__name__)

CLIENT_TYPE_GAME = "game"
CLIENT_TYPE_DASHBOARD = "dashboard"

_VALID_CLIENT_TYPES = frozenset({CLIENT_TYPE_GAME, CLIENT_TYPE_DASHBOARD})


@dataclass
class _Client:
    websocket: WebSocket
    client_type: str
    workspace_id: int


@dataclass
class GameBridgeHub:
    """In-process pub/sub for the simulator ↔ game bridge.

    Keyed by workspace_id so multiple sim workspaces can coexist without
    cross-talk (even though in practice we only run one).
    """

    _clients_by_workspace: dict[int, list[_Client]] = field(default_factory=lambda: defaultdict(list))
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def register(self, ws: WebSocket, client_type: str, workspace_id: int) -> _Client:
        if client_type not in _VALID_CLIENT_TYPES:
            raise ValueError(f"Unknown client_type: {client_type}")
        client = _Client(websocket=ws, client_type=client_type, workspace_id=workspace_id)
        async with self._lock:
            self._clients_by_workspace[workspace_id].append(client)
        logger.info(
            "game-bridge: %s client connected (workspace=%s, total=%s)",
            client_type,
            workspace_id,
            len(self._clients_by_workspace[workspace_id]),
        )
        return client

    async def unregister(self, client: _Client) -> None:
        async with self._lock:
            bucket = self._clients_by_workspace.get(client.workspace_id, [])
            if client in bucket:
                bucket.remove(client)
        logger.info(
            "game-bridge: %s client disconnected (workspace=%s, remaining=%s)",
            client.client_type,
            client.workspace_id,
            len(self._clients_by_workspace.get(client.workspace_id, [])),
        )

    async def broadcast(
        self,
        workspace_id: int,
        message: dict[str, Any],
        *,
        only_to: Iterable[str] | None = None,
        exclude: _Client | None = None,
    ) -> None:
        """Send `message` to all clients in the workspace, optionally filtered."""
        payload = json.dumps(message, default=_json_default)
        targets: list[_Client] = []
        async with self._lock:
            for c in list(self._clients_by_workspace.get(workspace_id, [])):
                if exclude is not None and c is exclude:
                    continue
                if only_to is not None and c.client_type not in only_to:
                    continue
                targets.append(c)

        dead: list[_Client] = []
        for c in targets:
            try:
                if c.websocket.application_state != WebSocketState.CONNECTED:
                    dead.append(c)
                    continue
                await c.websocket.send_text(payload)
            except WebSocketDisconnect:
                dead.append(c)
            except Exception:  # noqa: BLE001 — best-effort fanout
                logger.exception("game-bridge: send failed; dropping client")
                dead.append(c)

        for c in dead:
            await self.unregister(c)

    def snapshot(self, workspace_id: int) -> dict[str, int]:
        bucket = self._clients_by_workspace.get(workspace_id, [])
        counts: dict[str, int] = {"game": 0, "dashboard": 0}
        for c in bucket:
            counts[c.client_type] = counts.get(c.client_type, 0) + 1
        return counts


# Singleton hub. Import this, don't instantiate.
hub = GameBridgeHub()


# ── Domain translation helpers ───────────────────────────────────────────────

async def handle_game_message(
    client: _Client, message: dict[str, Any]
) -> dict[str, Any] | None:
    """Translate a message coming from the game client into domain actions.

    Returns an optional broadcast payload that the caller should fan out to
    dashboards. Returning None means the message was handled but not worth
    broadcasting (e.g., an ack).
    """
    msg_type = message.get("type")
    if msg_type == "character_enter_room":
        return await _handle_enter_room(client.workspace_id, message)
    if msg_type == "character_event":
        # For now, we pass events straight through to dashboards. Alert
        # creation from a "fall" event lives in the main MQTT handler path
        # so behaviour matches real hardware.
        return {
            "type": "character_event",
            "character": message.get("character"),
            "event": message.get("event"),
            "ts": _now_iso(),
        }
    if msg_type == "world_tick":
        # Low-value noise; drop silently.
        return None
    logger.debug("game-bridge: unknown game message type=%s", msg_type)
    return None


async def handle_dashboard_message(
    client: _Client, message: dict[str, Any]
) -> dict[str, Any] | None:
    """Translate a dashboard → backend command.

    Most dashboard messages are commands to forward to the game (e.g.,
    `trigger_fall`, `teleport_to_room`). We accept any shape and let the
    game side filter; backend only cares about persistence-affecting
    commands like `set_sensor_mode`.
    """
    msg_type = message.get("type")
    if msg_type == "set_sensor_mode":
        character = str(message.get("character", ""))
        mode = str(message.get("mode", SENSOR_MODE_MOCK))
        device_id = message.get("device_id")
        await update_sensor_mode(
            client.workspace_id, character, mode, real_device_id=device_id
        )
        return {
            "type": "sensor_mode_updated",
            "character": character,
            "mode": mode,
            "device_id": device_id,
        }
    # Unknown dashboard messages are forwarded to the game untouched so the
    # game can define new commands without backend changes.
    return None


async def _handle_enter_room(
    workspace_id: int, message: dict[str, Any]
) -> dict[str, Any] | None:
    character_name = message.get("character")
    game_room_name = message.get("room")
    if not character_name or not game_room_name:
        return None

    async with AsyncSessionLocal() as session:
        actor, room_id = await _resolve_character_and_room(
            session, workspace_id, str(character_name), str(game_room_name)
        )
        if actor is None or room_id is None:
            logger.warning(
                "game-bridge: unknown character/room (char=%s room=%s ws=%s)",
                character_name,
                game_room_name,
                workspace_id,
            )
            return None

        # Write DemoActorPosition for dashboard consumers. The `source=game`
        # marker distinguishes these from manual moves made from the
        # /admin/demo-control UI (source=manual).
        if actor.patient_id is not None:
            await _upsert_demo_position(
                session,
                workspace_id=workspace_id,
                actor_type="patient",
                actor_id=actor.patient_id,
                room_id=room_id,
                source="game",
                note=f"game:{character_name}->{game_room_name}",
            )
        elif actor.caregiver_id is not None:
            await _upsert_demo_position(
                session,
                workspace_id=workspace_id,
                actor_type="caregiver",
                actor_id=actor.caregiver_id,
                room_id=room_id,
                source="game",
                note=f"game:{character_name}->{game_room_name}",
            )
        await session.commit()

    return {
        "type": "character_enter_room",
        "character": character_name,
        "room": game_room_name,
        "room_id": room_id,
        "ts": _now_iso(),
    }


async def _resolve_character_and_room(
    session: AsyncSession,
    workspace_id: int,
    character_name: str,
    game_room_name: str,
) -> tuple[SimGameActorMap | None, int | None]:
    actor = (
        await session.execute(
            select(SimGameActorMap).where(
                SimGameActorMap.workspace_id == workspace_id,
                SimGameActorMap.character_name == character_name,
            )
        )
    ).scalar_one_or_none()

    room_row = (
        await session.execute(
            select(SimGameRoomMap).where(
                SimGameRoomMap.workspace_id == workspace_id,
                SimGameRoomMap.game_room_name == game_room_name,
            )
        )
    ).scalar_one_or_none()

    return actor, (room_row.room_id if room_row else None)


async def _upsert_demo_position(
    session: AsyncSession,
    *,
    workspace_id: int,
    actor_type: str,
    actor_id: int,
    room_id: int,
    source: str,
    note: str,
) -> None:
    existing = (
        await session.execute(
            select(DemoActorPosition).where(
                DemoActorPosition.workspace_id == workspace_id,
                DemoActorPosition.actor_type == actor_type,
                DemoActorPosition.actor_id == actor_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        session.add(
            DemoActorPosition(
                workspace_id=workspace_id,
                actor_type=actor_type,
                actor_id=actor_id,
                room_id=room_id,
                source=source,
                note=note,
            )
        )
    else:
        existing.room_id = room_id
        existing.source = source
        existing.note = note


async def update_sensor_mode(
    workspace_id: int,
    character_name: str,
    mode: str,
    *,
    real_device_id: int | str | None = None,
) -> SimGameActorMap | None:
    """Persist a sensor-mode change for one character. Idempotent."""
    if mode not in (SENSOR_MODE_MOCK, SENSOR_MODE_REAL):
        raise ValueError(f"Invalid sensor_mode: {mode}")

    async with AsyncSessionLocal() as session:
        actor = (
            await session.execute(
                select(SimGameActorMap).where(
                    SimGameActorMap.workspace_id == workspace_id,
                    SimGameActorMap.character_name == character_name,
                )
            )
        ).scalar_one_or_none()
        if actor is None:
            return None

        actor.sensor_mode = mode
        if mode == SENSOR_MODE_REAL:
            actor.real_device_id = await _coerce_device_id(
                session, workspace_id, real_device_id
            )
        else:
            actor.real_device_id = None
        await session.commit()
        await session.refresh(actor)
        return actor


async def _coerce_device_id(
    session: AsyncSession, workspace_id: int, device_id: int | str | None
) -> int | None:
    """Accept either a Device.id (int) or Device.device_id (str) and return
    the integer PK, or None if the device can't be found.
    """
    if device_id is None:
        return None
    if isinstance(device_id, int):
        return device_id
    try:
        as_int = int(device_id)
        exists = await session.scalar(select(Device.id).where(Device.id == as_int))
        if exists is not None:
            return as_int
    except (TypeError, ValueError):
        pass
    dev = await session.scalar(
        select(Device).where(
            Device.workspace_id == workspace_id, Device.device_id == str(device_id)
        )
    )
    return dev.id if dev else None


async def is_rssi_from_real_device_character(
    session: AsyncSession, workspace_id: int, device_id_str: str
) -> bool:
    """Return True if the device with `device_id_str` is bound (via actor map)
    to a character whose `sensor_mode == real_device`. Used by the MQTT
    ingestion filter to drop BLE/RSSI in sim mode for real-device characters.
    """
    dev_pk = await session.scalar(
        select(Device.id).where(
            Device.workspace_id == workspace_id, Device.device_id == device_id_str
        )
    )
    if dev_pk is None:
        return False
    actor = await session.scalar(
        select(SimGameActorMap).where(
            SimGameActorMap.workspace_id == workspace_id,
            SimGameActorMap.real_device_id == dev_pk,
        )
    )
    return bool(actor and actor.sensor_mode == SENSOR_MODE_REAL)


# ── Utilities ────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_default(obj: Any) -> Any:
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Not JSON serializable: {type(obj).__name__}")
