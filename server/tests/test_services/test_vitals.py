import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta

from app.models.patients import Patient
from app.schemas.patients import PatientCreate
from app.services.patient import patient_service
from app.models.vitals import VitalReading, HealthObservation
from app.schemas.vitals import VitalReadingCreate, HealthObservationCreate
from app.services.vitals import vital_reading_service, health_observation_service

@pytest.mark.asyncio
async def test_vital_reading_service_create(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    # Create patient first
    patient = await patient_service.create(
        db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="Jane", last_name="Doe", care_level="standard")
    )
    
    # Create a vital reading
    vital_data = VitalReadingCreate(
        patient_id=patient.id,
        device_id="DEV-001",
        heart_rate_bpm=75,
        rr_interval_ms=800.5,
        source="ble"
    )
    
    reading = await vital_reading_service.create(db_session, ws_id=ws_id, obj_in=vital_data)
    
    assert reading.id is not None
    assert reading.patient_id == patient.id
    assert reading.workspace_id == ws_id
    assert reading.heart_rate_bpm == 75
    assert reading.source == "ble"


@pytest.mark.asyncio
async def test_get_recent_vital_readings(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    patient = await patient_service.create(
        db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="Bob", last_name="Smith", care_level="standard")
    )

    # Insert 3 readings
    for i in range(3):
        await vital_reading_service.create(
            db_session, ws_id=ws_id, obj_in=VitalReadingCreate(
                patient_id=patient.id,
                device_id="DEV-001",
                heart_rate_bpm=70 + i
            )
        )
    
    # Get recent vitals via service method
    readings = await vital_reading_service.get_recent_by_patient(
        db_session, ws_id=ws_id, patient_id=patient.id, limit=2
    )

    assert len(readings) == 2
    # Assuming the most recent are returned first or just checking heart rate values
    assert readings[0].heart_rate_bpm in [71, 72]
    assert readings[1].heart_rate_bpm in [71, 72]


@pytest.mark.asyncio
async def test_health_observation_service_create(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    patient = await patient_service.create(
        db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="Alice", last_name="Wonderland", care_level="high")
    )

    obs_data = HealthObservationCreate(
        patient_id=patient.id,
        observation_type="daily_check",
        blood_pressure_sys=120,
        blood_pressure_dia=80,
        temperature_c=36.5,
        description="Patient seems fine."
    )

    obs = await health_observation_service.create(db_session, ws_id=ws_id, obj_in=obs_data)

    assert obs.id is not None
    assert obs.workspace_id == ws_id
    assert obs.patient_id == patient.id
    assert obs.blood_pressure_sys == 120
    assert obs.description == "Patient seems fine."

@pytest.mark.asyncio
async def test_get_recent_observations(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    patient = await patient_service.create(
        db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="Charlie", last_name="Brown", care_level="standard")
    )

    # Create two observations
    await health_observation_service.create(
        db_session, ws_id=ws_id, obj_in=HealthObservationCreate(
            patient_id=patient.id, observation_type="daily_check", temperature_c=36.5
        )
    )
    await health_observation_service.create(
        db_session, ws_id=ws_id, obj_in=HealthObservationCreate(
            patient_id=patient.id, observation_type="medication", description="Provided painkillers."
        )
    )

    recent_obs = await health_observation_service.get_recent_by_patient(
        db_session, ws_id=ws_id, patient_id=patient.id, limit=10
    )

    assert len(recent_obs) == 2
    types = [obs.observation_type for obs in recent_obs]
    assert "daily_check" in types
    assert "medication" in types
