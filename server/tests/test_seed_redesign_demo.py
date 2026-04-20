from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CareGiver,
    CareGiverPatientAccess,
    Device,
    Patient,
    PatientContact,
    PatientDeviceAssignment,
    Room,
    User,
)
from scripts.seed_redesign_demo import (
    PATIENTS,
    STAFF,
    assign_caregivers_to_patients,
    ensure_facility,
    ensure_floorplan_layout,
    ensure_rooms,
    ensure_workspace,
    seed_patients,
    seed_staff,
)


async def _seed_redesign_workspace(db_session: AsyncSession, *, reset: bool = False):
    workspace = await ensure_workspace(db_session, "test redesign workspace", reset)
    facility, floors = await ensure_facility(db_session, workspace.id)
    rooms = await ensure_rooms(db_session, workspace.id, floors)
    await ensure_floorplan_layout(db_session, workspace.id, facility, floors, rooms)
    staff = await seed_staff(db_session, workspace.id)
    patients = await seed_patients(db_session, workspace.id, rooms)
    await assign_caregivers_to_patients(db_session, workspace.id, staff, patients)
    return workspace, staff, patients


@pytest.mark.asyncio
async def test_seed_redesign_demo_creates_expected_cohort(db_session: AsyncSession) -> None:
    workspace, staff, patients = await _seed_redesign_workspace(db_session)

    patient_rows = (
        await db_session.execute(
            select(Patient).where(Patient.workspace_id == workspace.id).order_by(Patient.id)
        )
    ).scalars().all()
    device_rows = (
        await db_session.execute(
            select(Device).where(Device.workspace_id == workspace.id).order_by(Device.device_id)
        )
    ).scalars().all()
    assignment_rows = (
        await db_session.execute(
            select(PatientDeviceAssignment).where(PatientDeviceAssignment.workspace_id == workspace.id)
        )
    ).scalars().all()
    contact_rows = (
        await db_session.execute(
            select(PatientContact)
            .join(Patient, Patient.id == PatientContact.patient_id)
            .where(Patient.workspace_id == workspace.id, PatientContact.contact_type == "emergency")
        )
    ).scalars().all()
    access_rows = (
        await db_session.execute(
            select(CareGiverPatientAccess).where(CareGiverPatientAccess.workspace_id == workspace.id)
        )
    ).scalars().all()

    assert len(staff) == len(STAFF)
    assert len(patients) == len(PATIENTS)
    assert len(patient_rows) == len(PATIENTS)
    assert [patient.nickname for patient in patient_rows] == [row["nickname"] for row in PATIENTS]
    assert len(device_rows) == len(PATIENTS)
    assert all(device.device_id.startswith("SIM_WHEEL_") for device in device_rows)
    assert len(assignment_rows) == len(PATIENTS)
    assert len(contact_rows) == len(PATIENTS)
    assert len(access_rows) == len(PATIENTS) * 4
    assert staff["admin"][1] is None
    assert all(staff[key][1] is not None for key in ("headnurse", "supervisor", "observer1", "observer2"))


@pytest.mark.asyncio
async def test_seed_redesign_demo_is_idempotent_for_staff_patients_and_access(
    db_session: AsyncSession,
) -> None:
    workspace, _staff, _patients = await _seed_redesign_workspace(db_session)
    await _seed_redesign_workspace(db_session)

    patient_count = await db_session.scalar(
        select(func.count()).select_from(Patient).where(Patient.workspace_id == workspace.id)
    )
    device_count = await db_session.scalar(
        select(func.count()).select_from(Device).where(Device.workspace_id == workspace.id)
    )
    access_count = await db_session.scalar(
        select(func.count())
        .select_from(CareGiverPatientAccess)
        .where(CareGiverPatientAccess.workspace_id == workspace.id)
    )

    assert patient_count == len(PATIENTS)
    assert device_count == len(PATIENTS)
    assert access_count == len(PATIENTS) * 4


@pytest.mark.asyncio
async def test_ensure_workspace_reset_recreates_workspace(db_session: AsyncSession) -> None:
    first = await ensure_workspace(db_session, "resettable redesign workspace", reset=False)
    second = await ensure_workspace(db_session, "resettable redesign workspace", reset=True)
    matching_workspaces = (
        await db_session.execute(
            select(func.count()).select_from(type(second)).where(type(second).name == "resettable redesign workspace")
        )
    ).scalar_one()

    assert first.name == second.name
    assert matching_workspaces == 1


@pytest.mark.asyncio
async def test_seed_staff_have_correct_roles(db_session: AsyncSession) -> None:
    """Verify each staff member has the expected role from STAFF config."""
    workspace, staff, _patients = await _seed_redesign_workspace(db_session)

    for cfg in STAFF:
        username = cfg["username"]
        expected_role = cfg["role"]
        user, caregiver = staff[username]

        # Verify user exists with correct role
        db_user = await db_session.get(User, user.id)
        assert db_user is not None
        assert db_user.role == expected_role
        assert db_user.workspace_id == workspace.id

        # Non-admin staff should have caregiver record with matching role
        if expected_role != "admin":
            assert caregiver is not None
            db_caregiver = await db_session.get(CareGiver, caregiver.id)
            assert db_caregiver is not None
            assert db_caregiver.role == expected_role
            assert db_caregiver.is_active is True
        else:
            # Admin should NOT have caregiver record
            assert caregiver is None


@pytest.mark.asyncio
async def test_seed_patients_assigned_to_correct_rooms(db_session: AsyncSession) -> None:
    """Verify patients are assigned to their specified rooms from PATIENTS config."""
    workspace, _staff, patients = await _seed_redesign_workspace(db_session)

    for cfg, patient in zip(PATIENTS, patients):
        expected_room_name = cfg["room_name"]

        # Reload patient with room relationship
        result = await db_session.execute(
            select(Patient, Room)
            .outerjoin(Room, Patient.room_id == Room.id)
            .where(Patient.id == patient.id)
        )
        pat, room = result.first()

        assert room is not None, f"Patient {cfg['nickname']} should have room assigned"
        assert room.name == expected_room_name
        assert room.workspace_id == workspace.id


@pytest.mark.asyncio
async def test_seed_visibility_policy_all_caregivers_see_all_patients(
    db_session: AsyncSession,
) -> None:
    """Verify head_nurse, supervisor, and both observers can access all 5 patients."""
    workspace, staff, patients = await _seed_redesign_workspace(db_session)

    caregiver_usernames = ["headnurse", "supervisor", "observer1", "observer2"]

    for username in caregiver_usernames:
        _user, caregiver = staff[username]
        assert caregiver is not None, f"{username} should have caregiver record"

        # Query all access rows for this caregiver
        access_rows = (
            await db_session.execute(
                select(CareGiverPatientAccess)
                .where(
                    CareGiverPatientAccess.caregiver_id == caregiver.id,
                    CareGiverPatientAccess.is_active.is_(True),
                )
            )
        ).scalars().all()

        accessed_patient_ids = {row.patient_id for row in access_rows}
        expected_patient_ids = {p.id for p in patients}

        assert len(access_rows) == len(
            patients
        ), f"{username} should see all {len(patients)} patients"
        assert (
            accessed_patient_ids == expected_patient_ids
        ), f"{username} should have access to all patient IDs"


@pytest.mark.asyncio
async def test_seed_patient_medical_data_integrity(db_session: AsyncSession) -> None:
    """Verify patient medical conditions, medications, and allergies are persisted correctly."""
    workspace, _staff, patients = await _seed_redesign_workspace(db_session)

    for cfg, patient in zip(PATIENTS, patients):
        # Reload patient from DB to verify stored data
        db_patient = await db_session.get(Patient, patient.id)

        assert db_patient.medical_conditions == cfg["medical_conditions"]
        assert db_patient.medications == cfg["medications"]
        assert db_patient.allergies == cfg["allergies"]
        assert db_patient.past_surgeries == cfg["past_surgeries"]
        assert db_patient.care_level == cfg["care_level"]
        assert db_patient.mobility_type == cfg["mobility_type"]
        assert db_patient.current_mode == cfg["current_mode"]


@pytest.mark.asyncio
async def test_seed_emergency_contacts_created(db_session: AsyncSession) -> None:
    """Verify each patient has exactly one emergency contact with correct details."""
    workspace, _staff, patients = await _seed_redesign_workspace(db_session)

    for cfg, patient in zip(PATIENTS, patients):
        expected_contact = cfg["emergency_contact"]

        contact = (
            await db_session.execute(
                select(PatientContact).where(
                    PatientContact.patient_id == patient.id,
                    PatientContact.contact_type == "emergency",
                    PatientContact.is_primary.is_(True),
                )
            )
        ).scalar_one_or_none()

        assert contact is not None, f"Patient {cfg['nickname']} should have emergency contact"
        assert contact.name == expected_contact["name"]
        assert contact.relationship == expected_contact["relationship"]
        assert contact.phone == expected_contact["phone"]
