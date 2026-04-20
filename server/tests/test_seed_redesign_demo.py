from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CareGiverPatientAccess, Device, Patient, PatientContact, PatientDeviceAssignment
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
