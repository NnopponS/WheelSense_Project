import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from pydantic import Field

from app.models.patients import Patient
from app.schemas.patients import PatientCreate, PatientUpdate
from app.services.base import CRUDBase

# Create a concrete instance of CRUDBase for testing
patient_crud = CRUDBase[Patient, PatientCreate, PatientUpdate](Patient)

@pytest.mark.asyncio
async def test_crudbase_create(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    create_data = PatientCreate(
        first_name="Test",
        last_name="Patient",
        gender="M",
        care_level="high"
    )
    
    patient = await patient_crud.create(db_session, ws_id=ws_id, obj_in=create_data)
    
    assert patient.id is not None
    assert patient.workspace_id == ws_id
    assert patient.first_name == "Test"
    assert patient.last_name == "Patient"
    assert patient.care_level == "high"

@pytest.mark.asyncio
async def test_crudbase_get(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    create_data = PatientCreate(
        first_name="Get",
        last_name="Patient",
    )
    patient = await patient_crud.create(db_session, ws_id=ws_id, obj_in=create_data)
    
    # Correct workspace
    fetched = await patient_crud.get(db_session, ws_id=ws_id, id=patient.id)
    assert fetched is not None
    assert fetched.id == patient.id
    
    # Wrong workspace (should isolated)
    fetched_wrong_ws = await patient_crud.get(db_session, ws_id=999, id=patient.id)
    assert fetched_wrong_ws is None

@pytest.mark.asyncio
async def test_crudbase_get_multi(db_session: AsyncSession, _clean_tables):
    ws_id_1 = 1
    ws_id_2 = 2
    
    # Create 3 patients in ws 1
    for i in range(3):
        await patient_crud.create(db_session, ws_id=ws_id_1, obj_in=PatientCreate(first_name=f"p1_{i}", last_name="WS1"))
    
    # Create 2 patients in ws 2
    for i in range(2):
        await patient_crud.create(db_session, ws_id=ws_id_2, obj_in=PatientCreate(first_name=f"p2_{i}", last_name="WS2"))
        
    ws1_patients = await patient_crud.get_multi(db_session, ws_id=ws_id_1)
    ws2_patients = await patient_crud.get_multi(db_session, ws_id=ws_id_2)
    
    assert len(ws1_patients) == 3
    assert len(ws2_patients) == 2
    for p in ws1_patients:
        assert p.workspace_id == ws_id_1
        
@pytest.mark.asyncio
async def test_crudbase_update(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    patient = await patient_crud.create(
        db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="OldName", last_name="P")
    )
    
    update_data = PatientUpdate(first_name="NewName")
    
    updated_patient = await patient_crud.update(
        db_session, ws_id=ws_id, db_obj=patient, obj_in=update_data
    )
    
    assert updated_patient.first_name == "NewName"
    assert updated_patient.last_name == "P"  # remains unchanged
    
@pytest.mark.asyncio
async def test_crudbase_delete(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    patient = await patient_crud.create(
        db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="ToDelete", last_name="P")
    )
    
    # Delete from wrong workspace (should fail/return None)
    deleted_wrong = await patient_crud.delete(db_session, ws_id=999, id=patient.id)
    assert deleted_wrong is None
    
    # Delete correctly
    deleted = await patient_crud.delete(db_session, ws_id=ws_id, id=patient.id)
    assert deleted is not None
    assert deleted.id == patient.id
    
    # Confirm it's gone
    fetched = await patient_crud.get(db_session, ws_id=ws_id, id=patient.id)
    assert fetched is None
