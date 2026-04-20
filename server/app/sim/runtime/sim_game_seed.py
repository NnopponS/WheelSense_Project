"""Minimal simulator-mode seed aligned 1:1 with the Godot game.

Creates exactly the characters, rooms, and devices that the `EaseAI_NursingHome`
Godot project uses — nothing else. This is deliberately small so reset is fast
and mental model matches what the user sees on-screen in the game.

Idempotent: running twice is a no-op. Running with `reset=True` clears
workspace-scoped dynamic data (vitals, alerts, tasks, activity) before re-seeding
structural rows.

Entry points:
    * `await seed_sim_game_workspace(name?, reset?) -> workspace_id`
    * CLI: `python -m app.sim.runtime.sim_game_seed [--reset]`

Replaces the old `scripts/seed_sim_team.py` + `scripts/seed_demo.py` pair for
simulator mode. Production mode is unaffected (seed is sim-only by design).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from datetime import date
from typing import Iterable

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import get_password_hash
from app.db.session import AsyncSessionLocal
from app.models import (
    ActivityTimeline,
    Alert,
    CareGiver,
    CareTask,
    DemoActorPosition,
    Device,
    Facility,
    Floor,
    Patient,
    PatientDeviceAssignment,
    Room,
    SimGameActorMap,
    SimGameRoomMap,
    User,
    VitalReading,
    Workspace,
)
from app.models.sim_game import (
    ACTOR_ROLE_CAREGIVER,
    ACTOR_ROLE_PATIENT,
    SENSOR_MODE_MOCK,
)

DEFAULT_PASSWORD = "demo1234"


@dataclass(frozen=True)
class _Character:
    """Godot character → WheelSense patient definition."""

    game_name: str  # Godot node name, e.g. "emika"
    first_name: str
    last_name: str
    nickname: str
    gender: str
    dob: date
    care_level: str
    mobility: str
    game_room: str  # starting room sensor name


@dataclass(frozen=True)
class _Nurse:
    """Godot nurse → WheelSense caregiver + login user."""

    game_name: str
    username: str
    first_name: str
    last_name: str
    role: str  # "observer" | "head_nurse"


# Must exactly match the Godot room_sensor `room_name` values + patient
# starting rooms in the `scenes/game.tscn` world. Change together.
GAME_ROOMS: tuple[tuple[str, str], ...] = (
    # (game_room_name, room_type)
    ("Room401", "bedroom"),
    ("Room402", "bedroom"),
    ("Room403", "bedroom"),
    ("Room404", "bedroom"),
    ("Hallway", "general"),
)

# Must exactly match `scripts/characters/*.gd` NPC names (lowercased).
GAME_PATIENTS: tuple[_Character, ...] = (
    _Character(
        game_name="emika",
        first_name="เอมิกา",
        last_name="เจริญผล",
        nickname="Emika",
        gender="female",
        dob=date(1948, 3, 14),
        care_level="special",
        mobility="wheelchair",
        game_room="Room401",
    ),
    _Character(
        game_name="krit",
        first_name="กฤษณ์",
        last_name="วงศ์วัฒนา",
        nickname="Krit",
        gender="male",
        dob=date(1946, 11, 2),
        care_level="critical",
        mobility="wheelchair",
        game_room="Room402",
    ),
    _Character(
        game_name="rattana",
        first_name="รัตนา",
        last_name="ศรีสุวรรณ",
        nickname="Rattana",
        gender="female",
        dob=date(1950, 7, 21),
        care_level="normal",
        mobility="walker",
        game_room="Room403",
    ),
    _Character(
        game_name="wichai",
        first_name="วิชัย",
        last_name="ภัทรพงศ์",
        nickname="Wichai",
        gender="male",
        dob=date(1944, 1, 9),
        care_level="special",
        mobility="wheelchair",
        game_room="Room404",
    ),
)

GAME_NURSES: tuple[_Nurse, ...] = (
    _Nurse(
        game_name="female_nurse",
        username="nurse_a",
        first_name="Nurse",
        last_name="A",
        role="observer",
    ),
    _Nurse(
        game_name="male_nurse",
        username="nurse_b",
        first_name="Nurse",
        last_name="B",
        role="observer",
    ),
)

# One admin + one head_nurse login for dashboard use (no game counterpart).
DASHBOARD_USERS: tuple[tuple[str, str], ...] = (
    # (username, role)
    ("admin_demo", "admin"),
    ("head_demo", "head_nurse"),
)


# ── Dynamic-data tables cleared on reset (structural rows are preserved by
# upsert semantics; these are the per-run event streams that must go). ──
_DYNAMIC_TABLES: tuple[type, ...] = (
    VitalReading,
    Alert,
    ActivityTimeline,
    CareTask,
    DemoActorPosition,
)


async def _clear_dynamic(session: AsyncSession, workspace_id: int) -> None:
    for model in _DYNAMIC_TABLES:
        await session.execute(
            delete(model).where(model.workspace_id == workspace_id)
        )


async def _upsert_workspace(session: AsyncSession, name: str) -> Workspace:
    result = await session.execute(select(Workspace).where(Workspace.name == name))
    ws = result.scalar_one_or_none()
    if ws is None:
        ws = Workspace(name=name, mode="simulation", is_active=True)
        session.add(ws)
        await session.flush()
    else:
        ws.mode = "simulation"
        ws.is_active = True
    return ws


async def _upsert_facility(session: AsyncSession, workspace_id: int) -> tuple[Facility, Floor]:
    result = await session.execute(
        select(Facility).where(Facility.workspace_id == workspace_id)
    )
    facility = result.scalars().first()
    if facility is None:
        facility = Facility(workspace_id=workspace_id, name="EaseAI Nursing Home")
        session.add(facility)
        await session.flush()

    result = await session.execute(
        select(Floor).where(Floor.facility_id == facility.id, Floor.floor_number == 4)
    )
    floor = result.scalars().first()
    if floor is None:
        floor = Floor(
            workspace_id=workspace_id,
            facility_id=facility.id,
            floor_number=4,
            name="Floor 4",
        )
        session.add(floor)
        await session.flush()
    return facility, floor


async def _upsert_room(
    session: AsyncSession, workspace_id: int, floor_id: int, name: str, room_type: str
) -> Room:
    result = await session.execute(
        select(Room).where(Room.workspace_id == workspace_id, Room.name == name)
    )
    room = result.scalars().first()
    if room is None:
        room = Room(
            workspace_id=workspace_id,
            floor_id=floor_id,
            name=name,
            room_type=room_type,
        )
        session.add(room)
        await session.flush()
    else:
        room.floor_id = floor_id
        room.room_type = room_type
    return room


async def _upsert_patient(
    session: AsyncSession, workspace_id: int, room_id: int, char: _Character
) -> Patient:
    result = await session.execute(
        select(Patient).where(
            Patient.workspace_id == workspace_id,
            Patient.nickname == char.nickname,
        )
    )
    patient = result.scalars().first()
    fields = dict(
        workspace_id=workspace_id,
        first_name=char.first_name,
        last_name=char.last_name,
        nickname=char.nickname,
        gender=char.gender,
        date_of_birth=char.dob,
        care_level=char.care_level,
        mobility_type=char.mobility,
        current_mode=char.mobility,
        room_id=room_id,
        is_active=True,
    )
    if patient is None:
        patient = Patient(**fields)
        session.add(patient)
        await session.flush()
    else:
        for k, v in fields.items():
            setattr(patient, k, v)
    return patient


async def _upsert_caregiver(
    session: AsyncSession, workspace_id: int, nurse: _Nurse
) -> CareGiver:
    result = await session.execute(
        select(CareGiver).where(
            CareGiver.workspace_id == workspace_id,
            CareGiver.employee_code == nurse.username,
        )
    )
    cg = result.scalars().first()
    fields = dict(
        workspace_id=workspace_id,
        first_name=nurse.first_name,
        last_name=nurse.last_name,
        role=nurse.role,
        employee_code=nurse.username,
        department="Nursing",
        is_active=True,
    )
    if cg is None:
        cg = CareGiver(**fields)
        session.add(cg)
        await session.flush()
    else:
        for k, v in fields.items():
            setattr(cg, k, v)
    return cg


async def _upsert_user(
    session: AsyncSession, workspace_id: int, username: str, role: str
) -> User:
    result = await session.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            workspace_id=workspace_id,
            username=username,
            hashed_password=get_password_hash(DEFAULT_PASSWORD),
            role=role,
            is_active=True,
        )
        session.add(user)
        await session.flush()
    else:
        user.workspace_id = workspace_id
        user.role = role
        user.is_active = True
    return user


async def _upsert_device(
    session: AsyncSession,
    workspace_id: int,
    device_id: str,
    hardware_type: str,
    display_name: str,
) -> Device:
    result = await session.execute(
        select(Device).where(
            Device.workspace_id == workspace_id, Device.device_id == device_id
        )
    )
    device = result.scalars().first()
    fields = dict(
        workspace_id=workspace_id,
        device_id=device_id,
        device_type=hardware_type,
        hardware_type=hardware_type,
        display_name=display_name,
    )
    if device is None:
        device = Device(**fields)
        session.add(device)
        await session.flush()
    else:
        for k, v in fields.items():
            setattr(device, k, v)
    return device


async def _upsert_assignment(
    session: AsyncSession,
    workspace_id: int,
    patient_id: int,
    device_id_str: str,
    device_role: str = "wheelchair_sensor",
) -> None:
    result = await session.execute(
        select(PatientDeviceAssignment).where(
            PatientDeviceAssignment.workspace_id == workspace_id,
            PatientDeviceAssignment.patient_id == patient_id,
            PatientDeviceAssignment.device_id == device_id_str,
        )
    )
    row = result.scalars().first()
    if row is None:
        session.add(
            PatientDeviceAssignment(
                workspace_id=workspace_id,
                patient_id=patient_id,
                device_id=device_id_str,
                device_role=device_role,
                is_active=True,
            )
        )
    else:
        row.is_active = True
        row.device_role = device_role


async def _upsert_actor_map(
    session: AsyncSession,
    workspace_id: int,
    character_name: str,
    character_role: str,
    *,
    patient_id: int | None = None,
    caregiver_id: int | None = None,
) -> None:
    result = await session.execute(
        select(SimGameActorMap).where(
            SimGameActorMap.workspace_id == workspace_id,
            SimGameActorMap.character_name == character_name,
        )
    )
    row = result.scalars().first()
    if row is None:
        session.add(
            SimGameActorMap(
                workspace_id=workspace_id,
                character_name=character_name,
                character_role=character_role,
                patient_id=patient_id,
                caregiver_id=caregiver_id,
                sensor_mode=SENSOR_MODE_MOCK,
            )
        )
    else:
        row.character_role = character_role
        row.patient_id = patient_id
        row.caregiver_id = caregiver_id
        # Do not reset sensor_mode on re-seed — user may have changed it.


async def _upsert_room_map(
    session: AsyncSession, workspace_id: int, game_room_name: str, room_id: int
) -> None:
    result = await session.execute(
        select(SimGameRoomMap).where(
            SimGameRoomMap.workspace_id == workspace_id,
            SimGameRoomMap.game_room_name == game_room_name,
        )
    )
    row = result.scalars().first()
    if row is None:
        session.add(
            SimGameRoomMap(
                workspace_id=workspace_id,
                game_room_name=game_room_name,
                room_id=room_id,
            )
        )
    else:
        row.room_id = room_id


async def seed_sim_game_workspace(
    workspace_name: str | None = None,
    *,
    reset: bool = False,
) -> int:
    """Create-or-update the simulator workspace to match the Godot game exactly.

    Returns:
        workspace_id of the seeded workspace.
    """
    name = (
        workspace_name
        or settings.bootstrap_demo_workspace_name
        or "WheelSense Simulation"
    )

    async with AsyncSessionLocal() as session:
        ws = await _upsert_workspace(session, name)
        if reset:
            await _clear_dynamic(session, ws.id)

        _facility, floor = await _upsert_facility(session, ws.id)

        rooms_by_game_name: dict[str, Room] = {}
        for game_name, room_type in GAME_ROOMS:
            rooms_by_game_name[game_name] = await _upsert_room(
                session, ws.id, floor.id, game_name, room_type
            )

        # Dashboard-only users (admin, head_nurse).
        for username, role in DASHBOARD_USERS:
            await _upsert_user(session, ws.id, username, role)

        # Patients: one per game character, plus mapping rows + wheelchair device.
        for char in GAME_PATIENTS:
            room = rooms_by_game_name[char.game_room]
            patient = await _upsert_patient(session, ws.id, room.id, char)

            wc_device = await _upsert_device(
                session,
                ws.id,
                device_id=f"WC-{char.game_room}",
                hardware_type="wheelchair",
                display_name=f"Wheelchair {char.nickname}",
            )
            await _upsert_assignment(
                session, ws.id, patient.id, wc_device.device_id
            )

            await _upsert_actor_map(
                session,
                ws.id,
                character_name=char.game_name,
                character_role=ACTOR_ROLE_PATIENT,
                patient_id=patient.id,
            )

        # Room-node cameras (WSN-*) for each bedroom; used when localization
        # runs in non-game mode. Safe no-ops in game-driven mode.
        for game_name, _rtype in GAME_ROOMS:
            if not game_name.startswith("Room"):
                continue
            node = await _upsert_device(
                session,
                ws.id,
                device_id=f"WSN-{game_name}",
                hardware_type="node",
                display_name=f"Node {game_name}",
            )
            rooms_by_game_name[game_name].node_device_id = node.device_id

        # Nurses: one login user + one caregiver row + actor mapping per nurse.
        for nurse in GAME_NURSES:
            user = await _upsert_user(session, ws.id, nurse.username, nurse.role)
            cg = await _upsert_caregiver(session, ws.id, nurse)
            await _upsert_actor_map(
                session,
                ws.id,
                character_name=nurse.game_name,
                character_role=ACTOR_ROLE_CAREGIVER,
                caregiver_id=cg.id,
            )
            # Leave user referenced to avoid unused-var; logins are by username.
            _ = user

        # Room mappings (game_room_name → room_id).
        for game_name, _rtype in GAME_ROOMS:
            await _upsert_room_map(
                session, ws.id, game_name, rooms_by_game_name[game_name].id
            )

        await session.commit()
        return ws.id


def _parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Seed WheelSense simulator workspace to match the Godot game."
    )
    p.add_argument("--workspace", default=None, help="Override workspace name.")
    p.add_argument(
        "--reset",
        action="store_true",
        help="Clear workspace-scoped dynamic data before re-seeding.",
    )
    return p.parse_args(list(argv) if argv is not None else None)


def main() -> None:
    args = _parse_args()
    ws_id = asyncio.run(
        seed_sim_game_workspace(workspace_name=args.workspace, reset=args.reset)
    )
    print(f"[sim_game_seed] workspace_id={ws_id} reset={args.reset}")


if __name__ == "__main__":
    main()
