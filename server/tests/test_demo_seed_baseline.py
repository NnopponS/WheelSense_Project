from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.config import settings
from app.models import CareGiver, CareGiverPatientAccess, PatientDeviceAssignment, User
from scripts.seed_demo import (
    DEMO_ROOM_NODE_COUNT,
    ensure_workspace,
    seed_caregivers_and_users,
    seed_facility,
    seed_patient_users,
    seed_patients_and_devices,
    seed_room_node_mappings,
    seed_rooms,
    seed_sim_team_observer_access,
)


@pytest.mark.asyncio
async def test_seed_demo_creates_english_cohort_and_portrait_placeholders(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "profile_image_storage_dir", str(tmp_path))

    workspace = await ensure_workspace(db_session, "english baseline workspace", reset=False)
    assert workspace.is_active is True
    facility, floors = await seed_facility(db_session, workspace.id)
    rooms = await seed_rooms(db_session, workspace.id, floors)
    caregivers_by_role, users_by_role = await seed_caregivers_and_users(db_session, workspace.id)
    patients, devices = await seed_patients_and_devices(db_session, workspace.id, rooms)
    patient_users = await seed_patient_users(db_session, workspace.id, patients)
    mapped_nodes = await seed_room_node_mappings(db_session, workspace.id, rooms)
    access_created = await seed_sim_team_observer_access(
        db_session,
        workspace.id,
        caregivers_by_role,
        patients,
    )

    assert facility.name == "WheelSense Care Center"
    assert [room.name for room in rooms] == [
        "Room 401",
        "Room 402",
        "Room 403",
        "Room 404",
        "Room 405",
        "Room 406",
        "Bathroom",
        "Dining Room",
        "Main Hall",
        "Physiotherapy Room",
        "Nurses' Station",
        "Garden Lounge",
    ]
    assert [f"{patient.first_name} {patient.last_name}" for patient in patients] == [
        "Eleanor Price",
        "Robert Chen",
        "Margaret Lewis",
        "Daniel Carter",
        "Grace Wilson",
        "Samuel Ortiz",
    ]
    assert [room.name for room in rooms[:6]] == [
        "Room 401",
        "Room 402",
        "Room 403",
        "Room 404",
        "Room 405",
        "Room 406",
    ]
    assert [device.device_id for device in devices] == [f"SIM_WHEEL_{idx:02d}" for idx in range(1, 7)]
    assert mapped_nodes == DEMO_ROOM_NODE_COUNT
    assert all(room.node_device_id for room in rooms)
    assert access_created == len(patients) * 3

    staff_rows = (
        await db_session.execute(
            select(CareGiver)
            .where(CareGiver.workspace_id == workspace.id, CareGiver.employee_code.in_(["AD-401", "HN-401", "SV-401", "OB-401", "OB-402"]))
            .order_by(CareGiver.employee_code)
        )
    ).scalars().all()
    assert {f"{row.first_name} {row.last_name}" for row in staff_rows} == {
        "Ada Morgan",
        "Helen Brooks",
        "Marcus Lee",
        "Nina Patel",
        "Jason Kim",
    }
    active_staff_count = (
        await db_session.execute(
            select(CareGiver).where(
                CareGiver.workspace_id == workspace.id,
                CareGiver.is_active.is_(True),
            )
        )
    ).scalars().all()
    assert len(active_staff_count) == 5
    assert users_by_role["demo_admin"].username == "ada.m"
    assert users_by_role["ada.m"].username == "ada.m"
    assert caregivers_by_role["demo_headnurse"].first_name == "Helen"
    bootstrap_user = (
        await db_session.execute(select(User).where(User.username == "admin"))
    ).scalar_one()
    assert bootstrap_user.caregiver_id == caregivers_by_role["demo_admin"].id
    assert bootstrap_user.profile_image_url == caregivers_by_role["demo_admin"].photo_url

    expected_staff_usernames = {"ada.m", "helen.b", "marcus.l", "nina.p", "jason.k"}
    staff_user_rows = (
        await db_session.execute(select(User).where(User.username.in_(expected_staff_usernames)))
    ).scalars().all()
    assert {row.username for row in staff_user_rows} == expected_staff_usernames
    for user in staff_user_rows:
        assert verify_password(user.username, user.hashed_password)
        assert user.profile_image_url.startswith("/api/public/profile-images/")

    staff_access_rows = (
        await db_session.execute(
            select(CareGiverPatientAccess).where(
                CareGiverPatientAccess.workspace_id == workspace.id,
                CareGiverPatientAccess.caregiver_id.in_(
                    [
                        caregivers_by_role["demo_supervisor"].id,
                        caregivers_by_role["demo_observer"].id,
                        caregivers_by_role["demo_observer2"].id,
                    ]
                ),
                CareGiverPatientAccess.is_active.is_(True),
            )
        )
    ).scalars().all()
    assert len(staff_access_rows) == len(patients) * 3

    expected_patient_usernames = {
        "eleanor.p",
        "robert.c",
        "margaret.l",
        "daniel.c",
        "grace.w",
        "samuel.o",
    }
    assert {key for key in patient_users if "." in key} == expected_patient_usernames
    patient_user_rows = (
        await db_session.execute(select(User).where(User.username.in_(expected_patient_usernames)))
    ).scalars().all()
    assert len(patient_user_rows) == 6
    for user in patient_user_rows:
        assert user.role == "patient"
        assert user.patient_id is not None
        assert verify_password(user.username, user.hashed_password)
        assert user.profile_image_url.startswith("/api/public/profile-images/")

    for entity in [*patients, *staff_rows]:
        photo_url = entity.photo_url
        assert photo_url.startswith("/api/public/profile-images/")
        filename = photo_url.rsplit("/", 1)[1]
        assert (tmp_path / filename).is_file()

    assignments = (
        await db_session.execute(
            select(PatientDeviceAssignment)
            .where(PatientDeviceAssignment.workspace_id == workspace.id)
            .order_by(PatientDeviceAssignment.device_id)
        )
    ).scalars().all()
    assert len(assignments) == 6
