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
    ActivityTimeline,
    Alert,
    DemoActorPosition,
    Device,
    Patient,
    Room,
    SimGameActorMap,
    SimGameRoomMap,
    SmartDevice,
    User,
)
from app.models.sim_game import (
    SENSOR_MODE_MOCK,
    SENSOR_MODE_REAL,
)
from app.sim.services.sim_clock import sim_clock

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

async def _get_patient_id_for_character(
    session: AsyncSession, workspace_id: int, character_name: str
) -> int | None:
    """Map a game character name to a patient_id via SimGameActorMap."""
    result = await session.execute(
        select(SimGameActorMap).where(
            SimGameActorMap.workspace_id == workspace_id,
            SimGameActorMap.character_name == character_name,
        )
    )
    mapping = result.scalar_one_or_none()
    return mapping.patient_id if mapping else None


async def _create_fall_alert(
    workspace_id: int, patient_id: int, character_name: str
) -> Alert | None:
    """Create a fall alert for a patient and return the alert or None."""
    async with AsyncSessionLocal() as session:
        async with session.begin():
            patient = await session.get(Patient, patient_id)
            if patient is None or patient.workspace_id != workspace_id:
                logger.warning(
                    "game-bridge: patient %s not found in workspace %s",
                    patient_id,
                    workspace_id,
                )
                return None

            room = await session.get(Room, patient.room_id) if patient.room_id else None
            alert = Alert(
                workspace_id=workspace_id,
                patient_id=patient.id,
                alert_type="fall",
                severity="critical",
                title=f"Fall detected: {character_name}",
                description=f"Fall event triggered by game character '{character_name}'",
                data={
                    "room_id": patient.room_id,
                    "room_name": room.name if room else "",
                    "source": "game",
                    "character": character_name,
                },
                status="active",
            )
            session.add(alert)
            await session.flush()
            await session.refresh(alert)
            logger.info(
                "game-bridge: created fall alert %s for patient %s (character=%s)",
                alert.id,
                patient_id,
                character_name,
            )
            return alert


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
    if msg_type == "room_device_state":
        return await _handle_room_device_state(client.workspace_id, message)
    if msg_type == "distress_signal":
        # Godot sends this when a patient signals distress (new dispatch flow).
        # Normalise to a character_event/fall so the same pipeline fires.
        message = dict(message)
        message["type"] = "character_event"
        message["event"] = message.get("event_type", "fall")
        msg_type = "character_event"
    if msg_type == "character_event":
        event_type = message.get("event")
        character = message.get("character", "")

        # Handle fall events by creating an Alert
        if event_type == "fall":
            async with AsyncSessionLocal() as session:
                patient_id = await _get_patient_id_for_character(
                    session, client.workspace_id, character
                )

            if patient_id:
                alert = await _create_fall_alert(
                    client.workspace_id, patient_id, character
                )
                if alert:
                    # Auto-dispatch request: pick any on-shift observer for
                    # demo purposes; mobile clients will listen for this and
                    # buzz+ring the Accept/Decline choice.
                    try:
                        assigned_user_id = await _pick_dispatch_observer(
                            client.workspace_id
                        )
                    except Exception:  # noqa: BLE001
                        assigned_user_id = None
                    room_hint = ""
                    patient_obj = None
                    async with AsyncSessionLocal() as _s:
                        patient_obj = await _s.get(Patient, patient_id)
                        if patient_obj and patient_obj.room_id:
                            r = await _s.get(Room, patient_obj.room_id)
                            room_hint = r.name if r else ""
                    await broadcast_dispatch_request(
                        client.workspace_id,
                        alert_id=alert.id,
                        character=character,
                        room=room_hint,
                        assigned_user_id=assigned_user_id,
                        reason="fall_detected",
                    )
                    return {
                        "type": "character_event",
                        "character": character,
                        "event": event_type,
                        "alert_id": alert.id,
                        "patient_id": patient_id,
                        "ts": _now_iso(),
                    }
            else:
                logger.warning(
                    "game-bridge: no patient mapping for character '%s' in workspace %s",
                    character,
                    client.workspace_id,
                )

        # Pass through all character events to dashboards
        return {
            "type": "character_event",
            "character": character,
            "event": event_type,
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
    if msg_type == "room_device_command":
        # Persist the requested state so REST consumers (patient room
        # controls, floorplan summaries, MCP tool reads) stay in sync even
        # before the game acks back.
        await _upsert_sim_room_device(
            client.workspace_id,
            room_name=str(message.get("room", "")),
            device_kind=str(message.get("device", "")),
            state=bool(message.get("state")),
        )
        return None
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
            # Record on the patient activity timeline so EaseAI "past hour"
            # lookups (get_patient_timeline) can answer grounded questions
            # during a demo.
            session.add(
                ActivityTimeline(
                    workspace_id=workspace_id,
                    patient_id=actor.patient_id,
                    timestamp=sim_clock.now(),
                    event_type="room_enter",
                    room_id=room_id,
                    room_name=game_room_name,
                    description=f"{character_name} entered {game_room_name}",
                    data={"source": "game", "character": character_name},
                    source="auto",
                )
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


# ── Room appliance (lamp / AC) bridge ────────────────────────────────────────

# Conventional HA entity IDs used inside the simulator workspace for the
# Godot lamp/ac props so the existing SmartDevice-consuming surfaces (patient
# room controls, floorplan `smart_devices_summary`, MCP
# `control_room_smart_device` tool) work without a new table.
_DEVICE_KIND_TYPES: dict[str, str] = {
    "lamp": "light",
    "ac": "climate",
}


def _sim_entity_id(room_name: str, device_kind: str) -> str:
    return f"sim.{device_kind}.{room_name.lower()}"


async def _upsert_sim_room_device(
    workspace_id: int, *, room_name: str, device_kind: str, state: bool
) -> SmartDevice | None:
    """Persist lamp/AC state for a (room, device_kind) pair.

    Creates the SmartDevice row on first touch so no migration is needed —
    the sim workspace owns these rows and the rest of the backend treats them
    like any other SmartDevice.
    """
    device_kind = device_kind.lower()
    if device_kind not in _DEVICE_KIND_TYPES:
        logger.warning("game-bridge: unsupported device_kind=%s", device_kind)
        return None
    entity_id = _sim_entity_id(room_name, device_kind)
    device_type = _DEVICE_KIND_TYPES[device_kind]
    state_str = "on" if state else "off"

    async with AsyncSessionLocal() as session:
        async with session.begin():
            # Resolve room_id (optional — sim game may toggle appliances in
            # rooms that exist in the game but not in the workspace, which we
            # log and ignore gracefully).
            room = await session.scalar(
                select(Room).where(
                    Room.workspace_id == workspace_id, Room.name == room_name
                )
            )
            sd = await session.scalar(
                select(SmartDevice).where(
                    SmartDevice.workspace_id == workspace_id,
                    SmartDevice.ha_entity_id == entity_id,
                )
            )
            if sd is None:
                sd = SmartDevice(
                    workspace_id=workspace_id,
                    room_id=room.id if room else None,
                    name=f"{device_kind.upper()} {room_name}",
                    ha_entity_id=entity_id,
                    device_type=device_type,
                    state=state_str,
                    is_active=True,
                    config={"source": "sim_game"},
                )
                session.add(sd)
            else:
                sd.state = state_str
                sd.is_active = True
                if room and sd.room_id != room.id:
                    sd.room_id = room.id
            await session.flush()
            return sd


async def _handle_room_device_state(
    workspace_id: int, message: dict[str, Any]
) -> dict[str, Any] | None:
    """Handle a `room_device_state` message coming from the game client.

    Persist the new state and rebroadcast to dashboards so the patient room
    controls UI stays in lock-step with what the demo operator sees on screen.
    """
    room = str(message.get("room", ""))
    device = str(message.get("device", ""))
    state = bool(message.get("state"))
    if not room or device not in _DEVICE_KIND_TYPES:
        return None
    await _upsert_sim_room_device(
        workspace_id, room_name=room, device_kind=device, state=state
    )
    return {
        "type": "room_device_state",
        "room": room,
        "device": device,
        "state": state,
        "ts": _now_iso(),
    }


async def broadcast_room_device_command(
    workspace_id: int, *, room_name: str, device_kind: str, state: bool
) -> None:
    """External entry used by REST + MCP tools to flip a sim lamp/AC.

    Updates persistent state and pushes the command to every connected game
    tab so the prop animates.
    """
    await _upsert_sim_room_device(
        workspace_id, room_name=room_name, device_kind=device_kind, state=state
    )
    await hub.broadcast(
        workspace_id,
        {
            "type": "room_device_command",
            "room": room_name,
            "device": device_kind,
            "state": state,
            "ts": _now_iso(),
        },
        only_to=(CLIENT_TYPE_GAME, CLIENT_TYPE_DASHBOARD),
    )


# ── Dispatch (EaseAI / Observer mobile → nurse character) ────────────────────

# Round-robin pointer for observer dispatch selection during a demo. Process
# local — good enough since simulator runs a single backend.
_dispatch_rr_index: int = 0


async def _pick_dispatch_observer(workspace_id: int) -> int | None:
    """Return a user_id for an active observer in the workspace.

    Uses a simple round-robin across active observer accounts so repeated
    fall events don't always page the same person during a demo.
    """
    global _dispatch_rr_index
    async with AsyncSessionLocal() as session:
        rows = (
            (
                await session.execute(
                    select(User.id).where(
                        User.workspace_id == workspace_id,
                        User.role == "observer",
                        User.is_active.is_(True),
                    )
                )
            )
            .scalars()
            .all()
        )
    if not rows:
        return None
    idx = _dispatch_rr_index % len(rows)
    _dispatch_rr_index = (_dispatch_rr_index + 1) % len(rows)
    return int(rows[idx])


async def broadcast_dispatch_request(
    workspace_id: int,
    *,
    alert_id: int | None,
    character: str,
    room: str,
    assigned_user_id: int | None,
    patient_name: str = "",
    reason: str = "",
) -> None:
    """Publish a dispatch request to dashboards + observer mobile via MQTT.

    The nurse character in-game waits for `dispatch_accepted` before moving —
    so this message is informational for observers and dashboards only.
    The targeted observer receives an MQTT push on WheelSense/dispatch/<user_id>
    which the mobile app converts into an Accept/Decline notification.
    """
    payload: dict[str, Any] = {
        "type": "dispatch_request",
        "alert_id": alert_id,
        "character": character,
        "room": room,
        "assigned_user_id": assigned_user_id,
        "reason": reason,
        "ts": _now_iso(),
    }
    await hub.broadcast(
        workspace_id,
        payload,
        only_to=(CLIENT_TYPE_DASHBOARD,),
    )
    # Push to observer mobile app via MQTT
    if assigned_user_id is not None:
        try:
            from app.services.mqtt_publish import mqtt_publish_json
            await mqtt_publish_json(
                f"WheelSense/dispatch/{assigned_user_id}",
                {
                    "type": "dispatch_request",
                    "alertId": alert_id,
                    "patientName": patient_name or character,
                    "roomName": room,
                    "reason": reason,
                    "ts": _now_iso(),
                },
            )
        except Exception:
            logger.warning("game-bridge: MQTT dispatch publish failed for user %s", assigned_user_id)


async def broadcast_dispatch_accepted(
    workspace_id: int,
    *,
    alert_id: int | None,
    character: str,
    room: str,
    by_user_id: int | None,
    by_role: str | None,
) -> None:
    """Tell game tabs that a human has accepted the dispatch.

    The nurse whose role matches `by_role` (or is nearest when role is
    generic) will call `go_help_patient` on the patient node.
    """
    await hub.broadcast(
        workspace_id,
        {
            "type": "dispatch_accepted",
            "alert_id": alert_id,
            "character": character,
            "room": room,
            "by_user_id": by_user_id,
            "by_role": by_role,
            "ts": _now_iso(),
        },
        only_to=(CLIENT_TYPE_GAME, CLIENT_TYPE_DASHBOARD),
    )


async def broadcast_go_to_room(
    workspace_id: int, *, character: str, room: str, reason: str = ""
) -> None:
    """Instruct a named character to walk to a room (EaseAI Act path)."""
    await hub.broadcast(
        workspace_id,
        {
            "type": "go_to_room",
            "character": character,
            "room": room,
            "reason": reason,
            "ts": _now_iso(),
        },
        only_to=(CLIENT_TYPE_GAME,),
    )


# ── Utilities ────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_default(obj: Any) -> Any:
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Not JSON serializable: {type(obj).__name__}")
