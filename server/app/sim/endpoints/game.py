"""Simulator ↔ Godot game endpoints (REST + WebSocket).

REST (JWT required):
    GET  /api/sim/game/config     - actor map + room map (consumed by game on boot)
    GET  /api/sim/game/state      - hub client counts + current actor positions
    POST /api/sim/game/actor/{character}/sensor-mode
                                  - set per-character sensor mode (mock|real_device)
    POST /api/sim/game/event      - HTTP fallback: accept a single game event
                                    (the primary path is the WebSocket hub)

WebSocket:
    /api/sim/game/ws?token=<jwt>&client_type=game|dashboard

All of these endpoints are only mounted when ENV_MODE=simulator (see
app/api/router.py). Production builds do not expose them.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query, WebSocket, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.websockets import WebSocketDisconnect

from app.api.dependencies import (
    RequireRole,
    get_current_user_workspace,
    get_db,
    resolve_current_user_from_token,
)
from app.models import DemoActorPosition, SimGameActorMap, SimGameRoomMap
from app.models.core import Workspace
from app.models.sim_game import (
    ACTOR_ROLE_CAREGIVER,
    ACTOR_ROLE_PATIENT,
    SENSOR_MODE_MOCK,
    SENSOR_MODE_REAL,
)
from app.models.users import User
from app.sim.services.game_bridge import (
    CLIENT_TYPE_DASHBOARD,
    CLIENT_TYPE_GAME,
    broadcast_dispatch_accepted,
    broadcast_go_to_room,
    broadcast_room_device_command,
    handle_dashboard_message,
    handle_game_message,
    hub,
    update_sensor_mode,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Public endpoint for auto-connect (no auth required) ─────────────────────

@router.get("/token")
async def get_game_token(
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Return a valid JWT token for the simulator workspace admin user.

    This is intended for simulator-mode auto-connect only (e.g., Godot game).
    Public endpoint - no auth required for sim mode convenience.
    """
    from app.core.security import create_access_token
    from app.config import settings

    ws_name = settings.bootstrap_demo_workspace_name or "WheelSense Simulation"
    result = await db.execute(
        select(Workspace).where(Workspace.name == ws_name)
    )
    workspace = result.scalars().first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Simulator workspace not found")

    # Find first admin user in the workspace
    result = await db.execute(
        select(User).where(
            User.workspace_id == workspace.id,
            User.role == "admin",
            User.is_active == True,
        )
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="No admin user found in simulator workspace")

    token = create_access_token(user.id, user.role)
    return {"token": token, "workspace_id": str(workspace.id)}


# ── Pydantic IO schemas ──────────────────────────────────────────────────────

class ActorMapOut(BaseModel):
    character_name: str
    character_role: str
    patient_id: int | None = None
    caregiver_id: int | None = None
    sensor_mode: str = SENSOR_MODE_MOCK
    real_device_id: int | None = None


class RoomMapOut(BaseModel):
    game_room_name: str
    room_id: int


class GameConfigOut(BaseModel):
    workspace_id: int
    actors: list[ActorMapOut] = Field(default_factory=list)
    rooms: list[RoomMapOut] = Field(default_factory=list)


class ActorPositionOut(BaseModel):
    actor_type: str
    actor_id: int
    room_id: int
    source: str


class GameStateOut(BaseModel):
    workspace_id: int
    clients: dict[str, int]
    positions: list[ActorPositionOut] = Field(default_factory=list)


class SensorModeIn(BaseModel):
    mode: Literal["mock", "real_device"] = SENSOR_MODE_MOCK
    device_id: int | str | None = None


class GameEventIn(BaseModel):
    type: str
    character: str | None = None
    room: str | None = None
    event: str | None = None
    extra: dict[str, Any] | None = None


# ── REST endpoints ───────────────────────────────────────────────────────────

@router.get("/config", response_model=GameConfigOut)
async def get_game_config(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_user_workspace),
) -> GameConfigOut:
    """Return everything the game needs to know to align with the backend."""
    actor_rows = (
        (
            await db.execute(
                select(SimGameActorMap).where(
                    SimGameActorMap.workspace_id == workspace.id
                )
            )
        )
        .scalars()
        .all()
    )
    room_rows = (
        (
            await db.execute(
                select(SimGameRoomMap).where(
                    SimGameRoomMap.workspace_id == workspace.id
                )
            )
        )
        .scalars()
        .all()
    )
    return GameConfigOut(
        workspace_id=workspace.id,
        actors=[
            ActorMapOut(
                character_name=a.character_name,
                character_role=a.character_role,
                patient_id=a.patient_id,
                caregiver_id=a.caregiver_id,
                sensor_mode=a.sensor_mode,
                real_device_id=a.real_device_id,
            )
            for a in actor_rows
        ],
        rooms=[
            RoomMapOut(game_room_name=r.game_room_name, room_id=r.room_id)
            for r in room_rows
        ],
    )


@router.get("/state", response_model=GameStateOut)
async def get_game_state(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_user_workspace),
) -> GameStateOut:
    """Return current hub client counts + latest actor positions."""
    positions = (
        (
            await db.execute(
                select(DemoActorPosition).where(
                    DemoActorPosition.workspace_id == workspace.id
                )
            )
        )
        .scalars()
        .all()
    )
    return GameStateOut(
        workspace_id=workspace.id,
        clients=hub.snapshot(workspace.id),
        positions=[
            ActorPositionOut(
                actor_type=p.actor_type,
                actor_id=p.actor_id,
                room_id=p.room_id,
                source=p.source,
            )
            for p in positions
        ],
    )


@router.post("/actor/{character_name}/sensor-mode", response_model=ActorMapOut)
async def set_actor_sensor_mode(
    character_name: str,
    body: SensorModeIn = Body(...),
    workspace: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(["admin", "head_nurse"])),
) -> ActorMapOut:
    """Change sensor mode for one character (admin/head_nurse only)."""
    if body.mode == SENSOR_MODE_REAL and body.device_id is None:
        raise HTTPException(
            status_code=400,
            detail="device_id is required when mode='real_device'",
        )
    actor = await update_sensor_mode(
        workspace.id, character_name, body.mode, real_device_id=body.device_id
    )
    if actor is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown character '{character_name}' in workspace {workspace.id}",
        )
    # Notify live dashboards + game that mode changed.
    await hub.broadcast(
        workspace.id,
        {
            "type": "sensor_mode_updated",
            "character": character_name,
            "mode": body.mode,
            "device_id": body.device_id,
        },
    )
    return ActorMapOut(
        character_name=actor.character_name,
        character_role=actor.character_role,
        patient_id=actor.patient_id,
        caregiver_id=actor.caregiver_id,
        sensor_mode=actor.sensor_mode,
        real_device_id=actor.real_device_id,
    )


class RoomDeviceCommandIn(BaseModel):
    room: str
    device: Literal["lamp", "ac"]
    state: bool


@router.post("/room-device")
async def post_room_device_command(
    body: RoomDeviceCommandIn = Body(...),
    workspace: Workspace = Depends(get_current_user_workspace),
    _user: User = Depends(RequireRole(["admin", "head_nurse", "supervisor", "observer", "patient"])),
) -> dict[str, Any]:
    """Flip a sim room appliance (lamp or AC).

    Persists state and pushes a command to the Godot game tab so the prop
    animates. Shared entrypoint for /patient room controls, EaseAI MCP tools,
    and admin/demo dashboards.
    """
    await broadcast_room_device_command(
        workspace.id, room_name=body.room, device_kind=body.device, state=body.state
    )
    return {"ok": True, "room": body.room, "device": body.device, "state": body.state}


class DispatchAcceptIn(BaseModel):
    alert_id: int | None = None
    character: str
    room: str = ""


@router.post("/dispatch/accept")
async def post_dispatch_accept(
    body: DispatchAcceptIn = Body(...),
    workspace: Workspace = Depends(get_current_user_workspace),
    user: User = Depends(RequireRole(["admin", "head_nurse", "supervisor", "observer"])),
) -> dict[str, Any]:
    """Observer / staff explicitly accepts a dispatch so the nurse character
    starts walking in-game. Mobile app calls this from the critical-alert
    notification Accept button.
    """
    await broadcast_dispatch_accepted(
        workspace.id,
        alert_id=body.alert_id,
        character=body.character,
        room=body.room,
        by_user_id=user.id,
        by_role=user.role,
    )
    return {"ok": True}


class GoToRoomIn(BaseModel):
    character: str
    room: str
    reason: str = ""


@router.post("/go-to-room")
async def post_go_to_room(
    body: GoToRoomIn = Body(...),
    workspace: Workspace = Depends(get_current_user_workspace),
    _user: User = Depends(RequireRole(["admin", "head_nurse", "supervisor"])),
) -> dict[str, Any]:
    """Direct-send a move command (used by EaseAI dispatch tool)."""
    await broadcast_go_to_room(
        workspace.id, character=body.character, room=body.room, reason=body.reason
    )
    return {"ok": True}


@router.post("/event")
async def post_game_event(
    body: GameEventIn = Body(...),
    workspace: Workspace = Depends(get_current_user_workspace),
    _user: User = Depends(RequireRole(["admin", "head_nurse", "observer"])),
) -> dict[str, Any]:
    """HTTP fallback for a single game event (primary path is WebSocket)."""
    # Re-use the WS handler to ensure identical semantics.
    from app.sim.services.game_bridge import _Client  # private but intentional

    pseudo_client = _Client(websocket=None, client_type=CLIENT_TYPE_GAME, workspace_id=workspace.id)  # type: ignore[arg-type]
    msg = body.model_dump(exclude_none=True)
    broadcast_payload = await handle_game_message(pseudo_client, msg)
    if broadcast_payload is not None:
        await hub.broadcast(
            workspace.id,
            broadcast_payload,
            only_to=(CLIENT_TYPE_DASHBOARD,),
        )
    return {"ok": True, "broadcast": broadcast_payload}


# ── WebSocket hub ────────────────────────────────────────────────────────────

@router.websocket("/ws")
async def game_bridge_ws(
    websocket: WebSocket,
    token: str = Query(..., description="Bearer JWT (query param for WS auth)."),
    client_type: Literal["game", "dashboard"] = Query(CLIENT_TYPE_DASHBOARD),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Duplex hub: game tab ↔ dashboard tab ↔ backend."""
    # Auth first — refuse connections that don't resolve to a workspace user.
    try:
        user, _tok, _payload = await resolve_current_user_from_token(db, token)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    if not user.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    workspace_id = user.workspace_id

    await websocket.accept()
    client = await hub.register(websocket, client_type, workspace_id)

    try:
        await websocket.send_text(
            json.dumps(
                {
                    "type": "hello",
                    "workspace_id": workspace_id,
                    "client_type": client_type,
                }
            )
        )
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
                if not isinstance(message, dict):
                    raise ValueError("message must be a JSON object")
            except (ValueError, json.JSONDecodeError):
                await websocket.send_text(
                    json.dumps({"type": "error", "detail": "invalid_json"})
                )
                continue

            if client_type == CLIENT_TYPE_GAME:
                payload = await handle_game_message(client, message)
                if payload is not None:
                    # Fanout to dashboards (and other game tabs for mirroring).
                    await hub.broadcast(
                        workspace_id,
                        payload,
                        exclude=client,
                    )
            else:
                payload = await handle_dashboard_message(client, message)
                # Always forward dashboard messages to game tabs (commands).
                await hub.broadcast(
                    workspace_id,
                    message,
                    only_to=(CLIENT_TYPE_GAME,),
                )
                # If the handler produced its own ack payload, send back
                # to the original dashboard sender.
                if payload is not None:
                    await websocket.send_text(json.dumps(payload))
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("game-bridge: unexpected ws error")
    finally:
        await hub.unregister(client)
