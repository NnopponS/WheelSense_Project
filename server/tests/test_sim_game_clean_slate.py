"""Regression tests for the Clean Slate reset flow (stage 1).

These tests lock down the invariants the user asked for:

1.  After ``reset_simulator_workspace`` the workspace must contain exactly the
    game-aligned cohort: 5 patients (Emika, Somchai, Rattana, Krit, Wichai),
    5 staff accounts (admin, head_nurse, supervisor, observer ×2), and the
    6 game rooms. No residue from the legacy ``seed_demo.py`` Thai cohort.

2.  Caregiver rows exist for head_nurse / supervisor / observers with
    patient-access grants covering every patient.

3.  The bootstrap admin row survives a reset so the operator's session is
    not invalidated.

4.  Reset is idempotent: running it twice does not duplicate rows.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.core.security import get_password_hash
from app.models import (
    CareGiver,
    CareGiverPatientAccess,
    Device,
    Patient,
    Room,
    User,
    Workspace,
)
from app.sim.runtime.sim_game_seed import (
    DASHBOARD_USERS,
    GAME_PATIENTS,
    GAME_ROOMS,
)
from app.sim.services.simulator_reset import (
    clear_workspace_full,
    reset_simulator_workspace,
)

WORKSPACE_NAME = "WheelSense Simulation"


@pytest.fixture
def patch_session_factory(db_session: AsyncSession):
    """Force the reset helper to use the test's in-memory session."""
    engine = db_session.bind
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    with (
        patch("app.sim.services.simulator_reset.AsyncSessionLocal", factory),
        patch("app.sim.runtime.sim_game_seed.AsyncSessionLocal", factory),
    ):
        yield


@pytest.fixture
def sim_workspace_name(monkeypatch) -> str:
    monkeypatch.setattr(settings, "bootstrap_demo_workspace_name", WORKSPACE_NAME)
    return WORKSPACE_NAME


async def _seed_legacy_cohort(session: AsyncSession, workspace_id: int) -> None:
    """Approximate the legacy ``seed_demo.py`` leftovers that cause Image 1."""
    session.add_all(
        [
            Patient(
                workspace_id=workspace_id,
                first_name="บุญมี",
                last_name="มีสุข",
                nickname="ตาบุญ",
                gender="male",
                care_level="normal",
                mobility_type="walker",
                is_active=True,
            ),
            Patient(
                workspace_id=workspace_id,
                first_name="สมปอง",
                last_name="ใจดี",
                nickname="ยายปอง",
                gender="female",
                care_level="normal",
                mobility_type="walker",
                is_active=True,
            ),
            CareGiver(
                workspace_id=workspace_id,
                first_name="Legacy",
                last_name="Staff",
                role="observer",
                employee_code="LEGACY-OLD-01",
                is_active=True,
            ),
            Device(
                workspace_id=workspace_id,
                device_id="LEGACY_WHEEL_99",
                device_type="wheelchair",
                hardware_type="wheelchair",
                display_name="Legacy Wheelchair 99",
            ),
        ]
    )
    await session.commit()


@pytest.mark.asyncio
async def test_clean_slate_produces_exact_game_cohort(
    db_session: AsyncSession,
    patch_session_factory,
    sim_workspace_name,
) -> None:
    """Image 1 regression: reset must leave exactly the 5 game patients."""
    ws = Workspace(name=sim_workspace_name, mode="simulation", is_active=True)
    db_session.add(ws)
    await db_session.flush()
    workspace_id = ws.id
    await _seed_legacy_cohort(db_session, workspace_id)

    result = await reset_simulator_workspace(sim_workspace_name)

    assert result["action"] == "reset"
    assert result["workspace_id"] == workspace_id

    # Fresh session to bypass the test session's identity map.
    engine = db_session.bind
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as verify:
        patient_rows = (
            await verify.execute(
                select(Patient).where(Patient.workspace_id == workspace_id)
            )
        ).scalars().all()
        room_rows = (
            await verify.execute(
                select(Room).where(Room.workspace_id == workspace_id)
            )
        ).scalars().all()
        caregiver_rows = (
            await verify.execute(
                select(CareGiver).where(CareGiver.workspace_id == workspace_id)
            )
        ).scalars().all()
        user_rows = (
            await verify.execute(
                select(User).where(User.workspace_id == workspace_id)
            )
        ).scalars().all()

    assert len(patient_rows) == len(GAME_PATIENTS), (
        f"Clean slate left extra patients: {[p.nickname for p in patient_rows]}"
    )
    nicknames = {p.nickname for p in patient_rows}
    assert nicknames == {char.nickname for char in GAME_PATIENTS}

    assert len(room_rows) == len(GAME_ROOMS)
    assert {r.name for r in room_rows} == {name for name, _ in GAME_ROOMS}

    # 4 caregivers — admin has no caregiver row.
    assert len(caregiver_rows) == 4
    caregiver_roles = {cg.role for cg in caregiver_rows}
    assert caregiver_roles == {"head_nurse", "supervisor", "observer"}
    assert not any(cg.employee_code == "LEGACY-OLD-01" for cg in caregiver_rows)

    # 5 dashboard staff + 5 patient users.
    dashboard_usernames = {username for username, _ in DASHBOARD_USERS}
    user_names = {u.username for u in user_rows}
    assert dashboard_usernames <= user_names
    assert sum(1 for u in user_rows if u.role == "patient") == len(GAME_PATIENTS)


@pytest.mark.asyncio
async def test_clean_slate_grants_caregiver_patient_access_for_every_staff(
    db_session: AsyncSession,
    patch_session_factory,
    sim_workspace_name,
) -> None:
    ws = Workspace(name=sim_workspace_name, mode="simulation", is_active=True)
    db_session.add(ws)
    await db_session.flush()

    await reset_simulator_workspace(sim_workspace_name)

    engine = db_session.bind
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as verify:
        access_rows = (
            await verify.execute(
                select(CareGiverPatientAccess).where(
                    CareGiverPatientAccess.workspace_id == ws.id,
                    CareGiverPatientAccess.is_active.is_(True),
                )
            )
        ).scalars().all()
        caregiver_count = await verify.scalar(
            select(func.count())
            .select_from(CareGiver)
            .where(CareGiver.workspace_id == ws.id)
        )

    # head_nurse + supervisor + 2 observers = 4 caregivers, each sees 5 patients.
    assert caregiver_count == 4
    assert len(access_rows) == 4 * len(GAME_PATIENTS)


@pytest.mark.asyncio
async def test_clean_slate_preserves_bootstrap_admin(
    db_session: AsyncSession,
    patch_session_factory,
    sim_workspace_name,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "bootstrap_admin_username", "bootstrap_admin")

    legacy_ws = Workspace(name="legacy-system", is_active=True)
    db_session.add(legacy_ws)
    await db_session.flush()
    bootstrap = User(
        username="bootstrap_admin",
        hashed_password=get_password_hash("bootstrap"),
        role="admin",
        workspace_id=legacy_ws.id,
        is_active=True,
    )
    db_session.add(bootstrap)
    await db_session.flush()
    bootstrap_id = bootstrap.id

    await reset_simulator_workspace(sim_workspace_name)

    engine = db_session.bind
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as verify:
        row = await verify.get(User, bootstrap_id)
        demo_ws = (
            await verify.execute(
                select(Workspace).where(Workspace.name == sim_workspace_name)
            )
        ).scalar_one()

    assert row is not None, "bootstrap admin must survive clean slate"
    assert row.username == "bootstrap_admin"
    assert row.is_active is True
    assert row.workspace_id == demo_ws.id, (
        "bootstrap admin should be attached to the demo workspace after reset"
    )


@pytest.mark.asyncio
async def test_clean_slate_is_idempotent(
    db_session: AsyncSession,
    patch_session_factory,
    sim_workspace_name,
) -> None:
    ws = Workspace(name=sim_workspace_name, mode="simulation", is_active=True)
    db_session.add(ws)
    await db_session.flush()

    await reset_simulator_workspace(sim_workspace_name)
    await reset_simulator_workspace(sim_workspace_name)

    engine = db_session.bind
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as verify:
        patient_count = await verify.scalar(
            select(func.count())
            .select_from(Patient)
            .where(Patient.workspace_id == ws.id)
        )
        caregiver_count = await verify.scalar(
            select(func.count())
            .select_from(CareGiver)
            .where(CareGiver.workspace_id == ws.id)
        )
        access_count = await verify.scalar(
            select(func.count())
            .select_from(CareGiverPatientAccess)
            .where(CareGiverPatientAccess.workspace_id == ws.id)
        )

    assert patient_count == len(GAME_PATIENTS)
    assert caregiver_count == 4
    assert access_count == 4 * len(GAME_PATIENTS)


@pytest.mark.asyncio
async def test_clear_workspace_full_returns_counts_for_every_scope(
    db_session: AsyncSession,
    sim_workspace_name,
) -> None:
    ws = Workspace(name=sim_workspace_name, mode="simulation", is_active=True)
    db_session.add(ws)
    await db_session.flush()
    await _seed_legacy_cohort(db_session, ws.id)

    cleared = await clear_workspace_full(db_session, ws.id)

    assert cleared["patients"] >= 2
    assert cleared["caregivers"] >= 1
    assert cleared["devices"] >= 1
    # Patient contacts key is always present even if zero.
    assert "patient_contacts" in cleared
    assert "users" in cleared
