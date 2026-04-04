import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.models.patients import Patient
from app.models.caregivers import CareGiver
from app.schemas.patients import PatientCreate
from app.schemas.caregivers import CareGiverCreate
from app.services.patient import patient_service
from app.models.activity import ActivityTimeline, Alert
from app.schemas.activity import TimelineEventCreate, AlertCreate, AlertAcknowledge, AlertResolve

# Assuming CareGiver Service is not implemented yet, we can create directly or we might need it. Let's create a dummy caregiver_service, actually let's use CRUDBase for caregiver if required, or directly session.add.
from app.services.base import CRUDBase

caregiver_service = CRUDBase[CareGiver, CareGiverCreate, CareGiverCreate](CareGiver)

from app.services.activity import activity_service, alert_service

@pytest.mark.asyncio
async def test_timeline_event_create(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    patient = await patient_service.create(
        db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="Jane", last_name="Doe", care_level="standard")
    )
    
    event_data = TimelineEventCreate(
        patient_id=patient.id,
        event_type="room_enter",
        room_name="Living Room",
        source="auto"
    )
    
    event = await activity_service.create(db_session, ws_id=ws_id, obj_in=event_data)
    
    assert event.id is not None
    assert event.workspace_id == ws_id
    assert event.patient_id == patient.id
    assert event.event_type == "room_enter"
    assert event.room_name == "Living Room"

@pytest.mark.asyncio
async def test_get_patient_timeline(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    patient = await patient_service.create(
        db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="Bob", last_name="Ross", care_level="standard")
    )

    await activity_service.create(
        db_session, ws_id=ws_id, obj_in=TimelineEventCreate(patient_id=patient.id, event_type="room_enter")
    )
    await activity_service.create(
        db_session, ws_id=ws_id, obj_in=TimelineEventCreate(patient_id=patient.id, event_type="activity_start")
    )

    events = await activity_service.get_timeline_by_patient(db_session, ws_id=ws_id, patient_id=patient.id, limit=10)
    
    assert len(events) == 2

@pytest.mark.asyncio
async def test_alert_lifecycle(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    patient = await patient_service.create(
        db_session, ws_id=ws_id, obj_in=PatientCreate(first_name="Alice", last_name="Wonder", care_level="high")
    )

    cg = await caregiver_service.create(
        db_session, ws_id=ws_id, obj_in=CareGiverCreate(first_name="Nurse", last_name="Joy", role="nurse")
    )

    # 1. Create Alert
    alert_data = AlertCreate(
        patient_id=patient.id,
        alert_type="fall",
        severity="critical",
        title="Fall Detected"
    )
    alert = await alert_service.create(db_session, ws_id=ws_id, obj_in=alert_data)

    assert alert.status == "active"
    assert alert.severity == "critical"
    
    # 2. Acknowledge Alert
    ack_alert = await alert_service.acknowledge(
        db_session, ws_id=ws_id, alert_id=alert.id, caregiver_id=cg.id
    )
    assert ack_alert.status == "acknowledged"
    assert ack_alert.acknowledged_by == cg.id
    assert ack_alert.acknowledged_at is not None

    # 3. Resolve Alert
    res_alert = await alert_service.resolve(
        db_session, ws_id=ws_id, alert_id=alert.id, resolution_note="False alarm, patient dropped watch."
    )
    assert res_alert.status == "resolved"
    assert res_alert.resolved_at is not None
    assert res_alert.resolution_note == "False alarm, patient dropped watch."

@pytest.mark.asyncio
async def test_get_active_alerts(db_session: AsyncSession, _clean_tables):
    ws_id = 1
    
    await alert_service.create(
        db_session, ws_id=ws_id, obj_in=AlertCreate(alert_type="low_battery", title="Watch battery low")
    )
    
    alert2 = await alert_service.create(
        db_session, ws_id=ws_id, obj_in=AlertCreate(alert_type="device_offline", title="WiFi lost")
    )
    
    # Resolve alert2
    await alert_service.resolve(db_session, ws_id=ws_id, alert_id=alert2.id, resolution_note="Fixed")

    active_alerts = await alert_service.get_active_alerts(db_session, ws_id=ws_id)
    
    # Only 1 active
    assert len(active_alerts) == 1
    assert active_alerts[0].alert_type == "low_battery"

