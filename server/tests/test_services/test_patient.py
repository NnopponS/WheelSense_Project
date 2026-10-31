import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import Device, Workspace
from app.models.patients import Patient, PatientDeviceAssignment, PatientContact
from app.schemas.patients import PatientCreate, DeviceAssignmentCreate, PatientContactCreate
from app.services.patient import patient_service, patient_assignment_service, contact_service

@pytest.mark.asyncio
async def test_patient_service_create(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    create_data = PatientCreate(
        first_name="John",
        last_name="Doe",
        care_level="high",
        medical_conditions=["asthma"]
    )
    
    patient = await patient_service.create(db_session, ws_id=ws_id, obj_in=create_data)
    assert patient.id is not None
    assert patient.first_name == "John"
    assert "asthma" in patient.medical_conditions

@pytest.mark.asyncio
async def test_assign_device_to_patient(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    db_session.add(Device(workspace_id=ws_id, device_id="TSIM-123", device_type="wheelchair"))
    await db_session.flush()

    patient = await patient_service.create(
        db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="John", last_name="Doe")
    )
    
    assignment_data = DeviceAssignmentCreate(
        device_id="TSIM-123",
        device_role="wheelchair_sensor"
    )
    
    # Custom business logic method
    assignment = await patient_service.assign_device(
        db_session, ws_id=ws_id, patient_id=patient.id, obj_in=assignment_data
    )
    
    assert assignment.patient_id == patient.id
    assert assignment.device_id == "TSIM-123"
    assert assignment.device_role == "wheelchair_sensor"
    assert assignment.workspace_id == ws_id
    assert assignment.is_active is True


@pytest.mark.asyncio
async def test_assign_device_rejects_patient_from_other_workspace(
    db_session: AsyncSession, _clean_tables
):
    ws1 = Workspace(name="ws_a", is_active=True)
    ws2 = Workspace(name="ws_b", is_active=True)
    db_session.add_all([ws1, ws2])
    await db_session.flush()
    db_session.add(Device(workspace_id=ws1.id, device_id="D-WS1", device_type="wheelchair"))
    await db_session.flush()
    other = await patient_service.create(
        db_session, ws_id=ws2.id, obj_in=PatientCreate(first_name="Other", last_name="Ws")
    )
    with pytest.raises(HTTPException) as exc:
        await patient_service.assign_device(
            db_session,
            ws1.id,
            other.id,
            DeviceAssignmentCreate(device_id="D-WS1", device_role="wheelchair_sensor"),
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_assign_device_overrides_existing_role(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    db_session.add_all(
        [
            Device(workspace_id=ws_id, device_id="P1", device_type="wheelchair"),
            Device(workspace_id=ws_id, device_id="P2", device_type="wheelchair"),
        ]
    )
    await db_session.flush()

    patient = await patient_service.create(db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="John", last_name="Doe"))
    
    await patient_service.assign_device(
        db_session, ws_id, patient.id, 
        DeviceAssignmentCreate(device_id="P1", device_role="polar_hr")
    )
    
    # Assign new polar_hr device
    await patient_service.assign_device(
        db_session, ws_id, patient.id, 
        DeviceAssignmentCreate(device_id="P2", device_role="polar_hr")
    )
    
    assignments = await patient_assignment_service.get_multi(db_session, ws_id=ws_id)
    active_assignments = [a for a in assignments if a.is_active and a.device_role == "polar_hr"]
    
    assert len(active_assignments) == 1
    assert active_assignments[0].device_id == "P2"

@pytest.mark.asyncio
async def test_get_patient_with_contacts(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    patient = await patient_service.create(db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="Jane", last_name="Doe"))
    
    # Create contact
    contact_data = PatientContactCreate(
        contact_type="family",
        name="John Doe",
        phone="555-1234",
        relationship="son",
        is_primary=True
    )
    await contact_service.create_for_patient(
        db_session, ws_id=ws_id, patient_id=patient.id, obj_in=contact_data
    )
    
    fetched = await patient_service.get_with_contacts(db_session, ws_id=ws_id, id=patient.id)
    assert fetched is not None
    assert fetched.first_name == "Jane"
    assert len(fetched.contacts) == 1
    assert fetched.contacts[0].name == "John Doe"


@pytest.mark.asyncio
async def test_unassign_device(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    db_session.add(Device(workspace_id=ws_id, device_id="UX-1", device_type="wheelchair"))
    await db_session.flush()
    patient = await patient_service.create(
        db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="A", last_name="B")
    )
    await patient_service.assign_device(
        db_session,
        ws_id,
        patient.id,
        DeviceAssignmentCreate(device_id="UX-1", device_role="mobile"),
    )
    await patient_service.unassign_device(db_session, ws_id, patient.id, "UX-1")
    assignments = await patient_assignment_service.get_multi(db_session, ws_id=ws_id)
    ux = [a for a in assignments if a.device_id == "UX-1"]
    assert len(ux) == 1
    assert ux[0].is_active is False
