"""Tests for Phase 1 domain models: Facility hierarchy, Patients, CareGivers, Vitals, Activity.

Verifies ORM models can be created, queried, and that relationships work
correctly. Uses SQLite in-memory via conftest.py fixtures.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from datetime import date, time, datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Workspace,
    # Facility hierarchy
    Facility,
    Floor,
    Room,
    # People
    Patient,
    PatientDeviceAssignment,
    PatientContact,
    CareGiver,
    CareGiverZone,
    CareGiverShift,
    # Health
    VitalReading,
    HealthObservation,
    # Activity
    ActivityTimeline,
    Alert,
)

# ── Helper: create workspace for isolation ──────────────────────────────────


@pytest_asyncio.fixture()
async def ws(db_session: AsyncSession) -> Workspace:
    """Create a workspace for test isolation."""
    workspace = Workspace(name="test-ws", mode="simulation", is_active=True)
    db_session.add(workspace)
    await db_session.commit()
    await db_session.refresh(workspace)
    return workspace


# ══════════════════════════════════════════════════════════════════════════════
# FACILITY HIERARCHY
# ══════════════════════════════════════════════════════════════════════════════


class TestFacilityModel:
    @pytest.mark.asyncio
    async def test_create_facility(self, db_session: AsyncSession, ws: Workspace) -> None:
        facility = Facility(
            workspace_id=ws.id,
            name="อาคาร A",
            address="123 ถนนสุขุมวิท",
            description="Main building",
            config={"ha_url": "http://ha.local"},
        )
        db_session.add(facility)
        await db_session.commit()
        await db_session.refresh(facility)

        assert facility.id is not None
        assert facility.name == "อาคาร A"
        assert facility.address == "123 ถนนสุขุมวิท"
        assert facility.config == {"ha_url": "http://ha.local"}
        assert facility.workspace_id == ws.id
        assert facility.created_at is not None

    @pytest.mark.asyncio
    async def test_facility_defaults(self, db_session: AsyncSession, ws: Workspace) -> None:
        facility = Facility(workspace_id=ws.id, name="B")
        db_session.add(facility)
        await db_session.commit()
        await db_session.refresh(facility)

        assert facility.address == ""
        assert facility.description == ""
        assert facility.config == {}


class TestFloorModel:
    @pytest.mark.asyncio
    async def test_create_floor(self, db_session: AsyncSession, ws: Workspace) -> None:
        facility = Facility(workspace_id=ws.id, name="Main")
        db_session.add(facility)
        await db_session.commit()

        floor = Floor(
            workspace_id=ws.id,
            facility_id=facility.id,
            floor_number=1,
            name="ชั้น 1",
            map_data={"rooms": [{"room_id": 1, "x": 0, "y": 0}]},
        )
        db_session.add(floor)
        await db_session.commit()
        await db_session.refresh(floor)

        assert floor.id is not None
        assert floor.facility_id == facility.id
        assert floor.floor_number == 1
        assert floor.name == "ชั้น 1"
        assert floor.map_data["rooms"][0]["x"] == 0

    @pytest.mark.asyncio
    async def test_floor_defaults(self, db_session: AsyncSession, ws: Workspace) -> None:
        facility = Facility(workspace_id=ws.id, name="Main")
        db_session.add(facility)
        await db_session.commit()

        floor = Floor(workspace_id=ws.id, facility_id=facility.id, floor_number=2)
        db_session.add(floor)
        await db_session.commit()
        await db_session.refresh(floor)

        assert floor.name == ""
        assert floor.map_data == {}


class TestRoomModelEnhanced:
    @pytest.mark.asyncio
    async def test_create_room_with_hierarchy(
        self, db_session: AsyncSession, ws: Workspace
    ) -> None:
        facility = Facility(workspace_id=ws.id, name="Main")
        db_session.add(facility)
        await db_session.commit()

        floor = Floor(workspace_id=ws.id, facility_id=facility.id, floor_number=1)
        db_session.add(floor)
        await db_session.commit()

        room = Room(
            workspace_id=ws.id,
            floor_id=floor.id,
            name="ห้อง 101",
            room_type="bedroom",
            node_device_id="TSIM-001",
            adjacent_rooms=[2, 3],
            config={"ha_light": "switch.room_101"},
        )
        db_session.add(room)
        await db_session.commit()
        await db_session.refresh(room)

        assert room.id is not None
        assert room.floor_id == floor.id
        assert room.room_type == "bedroom"
        assert room.node_device_id == "TSIM-001"
        assert room.adjacent_rooms == [2, 3]
        assert room.config["ha_light"] == "switch.room_101"

    @pytest.mark.asyncio
    async def test_room_without_floor(self, db_session: AsyncSession, ws: Workspace) -> None:
        """Room can exist without floor_id (legacy compatibility)."""
        room = Room(workspace_id=ws.id, name="Outdoor Area")
        db_session.add(room)
        await db_session.commit()
        await db_session.refresh(room)

        assert room.floor_id is None
        assert room.room_type == "general"
        assert room.node_device_id is None

    @pytest.mark.asyncio
    async def test_room_defaults(self, db_session: AsyncSession, ws: Workspace) -> None:
        room = Room(workspace_id=ws.id, name="Test")
        db_session.add(room)
        await db_session.commit()
        await db_session.refresh(room)

        assert room.adjacent_rooms == []
        assert room.config == {}
        assert room.room_type == "general"


# ══════════════════════════════════════════════════════════════════════════════
# PATIENT MODELS
# ══════════════════════════════════════════════════════════════════════════════


class TestPatientModel:
    @pytest.mark.asyncio
    async def test_create_patient_full(
        self, db_session: AsyncSession, ws: Workspace
    ) -> None:
        patient = Patient(
            workspace_id=ws.id,
            first_name="สมชาย",
            last_name="ใจดี",
            nickname="ชาย",
            date_of_birth=date(1945, 3, 15),
            gender="male",
            height_cm=170.0,
            weight_kg=65.5,
            blood_type="O+",
            medical_conditions=["diabetes", "hypertension"],
            allergies=["penicillin"],
            medications=[{"name": "Metformin", "dosage": "500mg", "frequency": "2x/day"}],
            care_level="special",
            mobility_type="wheelchair",
        )
        db_session.add(patient)
        await db_session.commit()
        await db_session.refresh(patient)

        assert patient.id is not None
        assert patient.first_name == "สมชาย"
        assert patient.date_of_birth == date(1945, 3, 15)
        assert patient.medical_conditions == ["diabetes", "hypertension"]
        assert patient.medications[0]["name"] == "Metformin"
        assert patient.care_level == "special"
        assert patient.current_mode == "wheelchair"
        assert patient.is_active is True
        assert patient.discharged_at is None

    @pytest.mark.asyncio
    async def test_patient_defaults(self, db_session: AsyncSession, ws: Workspace) -> None:
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        db_session.add(patient)
        await db_session.commit()
        await db_session.refresh(patient)

        assert patient.nickname == ""
        assert patient.gender == ""
        assert patient.care_level == "normal"
        assert patient.mobility_type == "wheelchair"
        assert patient.current_mode == "wheelchair"
        assert patient.medical_conditions == []
        assert patient.allergies == []

    @pytest.mark.asyncio
    async def test_patient_with_room(
        self, db_session: AsyncSession, ws: Workspace
    ) -> None:
        room = Room(workspace_id=ws.id, name="Room 101")
        db_session.add(room)
        await db_session.commit()

        patient = Patient(
            workspace_id=ws.id, first_name="Test", last_name="User", room_id=room.id
        )
        db_session.add(patient)
        await db_session.commit()
        await db_session.refresh(patient)

        assert patient.room_id == room.id


class TestPatientDeviceAssignment:
    @pytest.mark.asyncio
    async def test_assign_device(self, db_session: AsyncSession, ws: Workspace) -> None:
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        db_session.add(patient)
        await db_session.commit()

        assignment = PatientDeviceAssignment(
            workspace_id=ws.id,
            patient_id=patient.id,
            device_id="M5-001",
            device_role="wheelchair_sensor",
        )
        db_session.add(assignment)
        await db_session.commit()
        await db_session.refresh(assignment)

        assert assignment.id is not None
        assert assignment.device_role == "wheelchair_sensor"
        assert assignment.is_active is True
        assert assignment.assigned_at is not None

    @pytest.mark.asyncio
    async def test_multiple_device_roles(
        self, db_session: AsyncSession, ws: Workspace
    ) -> None:
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        db_session.add(patient)
        await db_session.commit()

        for role, dev_id in [
            ("wheelchair_sensor", "M5-001"),
            ("polar_hr", "POLAR-001"),
            ("mobile", "APP-001"),
        ]:
            db_session.add(
                PatientDeviceAssignment(
                    workspace_id=ws.id,
                    patient_id=patient.id,
                    device_id=dev_id,
                    device_role=role,
                )
            )
        await db_session.commit()

        result = await db_session.execute(
            select(PatientDeviceAssignment).where(
                PatientDeviceAssignment.patient_id == patient.id
            )
        )
        assignments = result.scalars().all()
        assert len(assignments) == 3
        roles = {a.device_role for a in assignments}
        assert roles == {"wheelchair_sensor", "polar_hr", "mobile"}


class TestPatientContact:
    @pytest.mark.asyncio
    async def test_create_contact(self, db_session: AsyncSession, ws: Workspace) -> None:
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        db_session.add(patient)
        await db_session.commit()

        contact = PatientContact(
            patient_id=patient.id,
            contact_type="family",
            name="สมหญิง ใจดี",
            relationship="daughter",
            phone="081-234-5678",
            is_primary=True,
        )
        db_session.add(contact)
        await db_session.commit()
        await db_session.refresh(contact)

        assert contact.id is not None
        assert contact.contact_type == "family"
        assert contact.is_primary is True


# ══════════════════════════════════════════════════════════════════════════════
# CAREGIVER MODELS
# ══════════════════════════════════════════════════════════════════════════════


class TestCareGiver:
    @pytest.mark.asyncio
    async def test_create_caregiver(self, db_session: AsyncSession, ws: Workspace) -> None:
        cg = CareGiver(
            workspace_id=ws.id,
            first_name="นภา",
            last_name="สุขสบาย",
            role="supervisor",
            phone="089-999-9999",
            email="napa@example.com",
        )
        db_session.add(cg)
        await db_session.commit()
        await db_session.refresh(cg)

        assert cg.id is not None
        assert cg.role == "supervisor"
        assert cg.is_active is True

    @pytest.mark.asyncio
    async def test_caregiver_defaults(self, db_session: AsyncSession, ws: Workspace) -> None:
        cg = CareGiver(workspace_id=ws.id, first_name="A", last_name="B", role="observer")
        db_session.add(cg)
        await db_session.commit()
        await db_session.refresh(cg)

        assert cg.phone == ""
        assert cg.email == ""
        assert cg.photo_url == ""


class TestCareGiverZone:
    @pytest.mark.asyncio
    async def test_assign_zone(self, db_session: AsyncSession, ws: Workspace) -> None:
        cg = CareGiver(workspace_id=ws.id, first_name="A", last_name="B", role="observer")
        db_session.add(cg)

        room = Room(workspace_id=ws.id, name="Room 101")
        db_session.add(room)
        await db_session.commit()

        zone = CareGiverZone(
            caregiver_id=cg.id, room_id=room.id, zone_name="East Wing"
        )
        db_session.add(zone)
        await db_session.commit()
        await db_session.refresh(zone)

        assert zone.caregiver_id == cg.id
        assert zone.room_id == room.id
        assert zone.is_active is True


class TestCareGiverShift:
    @pytest.mark.asyncio
    async def test_create_shift(self, db_session: AsyncSession, ws: Workspace) -> None:
        cg = CareGiver(workspace_id=ws.id, first_name="A", last_name="B", role="observer")
        db_session.add(cg)
        await db_session.commit()

        shift = CareGiverShift(
            caregiver_id=cg.id,
            shift_date=date(2026, 4, 1),
            start_time=time(8, 0),
            end_time=time(16, 0),
            shift_type="regular",
        )
        db_session.add(shift)
        await db_session.commit()
        await db_session.refresh(shift)

        assert shift.shift_date == date(2026, 4, 1)
        assert shift.start_time == time(8, 0)
        assert shift.end_time == time(16, 0)


# ══════════════════════════════════════════════════════════════════════════════
# VITAL MODELS
# ══════════════════════════════════════════════════════════════════════════════


class TestVitalReading:
    @pytest.mark.asyncio
    async def test_create_vital(self, db_session: AsyncSession, ws: Workspace) -> None:
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        db_session.add(patient)
        await db_session.commit()

        vital = VitalReading(
            workspace_id=ws.id,
            patient_id=patient.id,
            device_id="POLAR-001",
            heart_rate_bpm=72,
            rr_interval_ms=833.0,
            source="ble",
        )
        db_session.add(vital)
        await db_session.commit()
        await db_session.refresh(vital)

        assert vital.id is not None
        assert vital.heart_rate_bpm == 72
        assert vital.rr_interval_ms == 833.0
        assert vital.source == "ble"
        assert vital.spo2 is None

    @pytest.mark.asyncio
    async def test_vital_from_sdk(self, db_session: AsyncSession, ws: Workspace) -> None:
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        db_session.add(patient)
        await db_session.commit()

        vital = VitalReading(
            workspace_id=ws.id,
            patient_id=patient.id,
            device_id="APP-001",
            heart_rate_bpm=68,
            rr_interval_ms=882.0,
            spo2=98,
            skin_temperature=36.5,
            source="polar_sdk",
        )
        db_session.add(vital)
        await db_session.commit()
        await db_session.refresh(vital)

        assert vital.spo2 == 98
        assert vital.skin_temperature == 36.5
        assert vital.source == "polar_sdk"


class TestHealthObservation:
    @pytest.mark.asyncio
    async def test_daily_check(self, db_session: AsyncSession, ws: Workspace) -> None:
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        cg = CareGiver(workspace_id=ws.id, first_name="C", last_name="D", role="observer")
        db_session.add_all([patient, cg])
        await db_session.commit()

        obs = HealthObservation(
            workspace_id=ws.id,
            patient_id=patient.id,
            caregiver_id=cg.id,
            observation_type="daily_check",
            blood_pressure_sys=120,
            blood_pressure_dia=80,
            temperature_c=36.8,
            pain_level=2,
            description="ปกติดี",
        )
        db_session.add(obs)
        await db_session.commit()
        await db_session.refresh(obs)

        assert obs.blood_pressure_sys == 120
        assert obs.observation_type == "daily_check"

    @pytest.mark.asyncio
    async def test_meal_observation(self, db_session: AsyncSession, ws: Workspace) -> None:
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        db_session.add(patient)
        await db_session.commit()

        obs = HealthObservation(
            workspace_id=ws.id,
            patient_id=patient.id,
            observation_type="meal",
            meal_type="lunch",
            meal_portion="half",
            water_ml=200,
        )
        db_session.add(obs)
        await db_session.commit()
        await db_session.refresh(obs)

        assert obs.meal_type == "lunch"
        assert obs.meal_portion == "half"
        assert obs.water_ml == 200


# ══════════════════════════════════════════════════════════════════════════════
# ACTIVITY & ALERT MODELS
# ══════════════════════════════════════════════════════════════════════════════


class TestActivityTimeline:
    @pytest.mark.asyncio
    async def test_room_transition(self, db_session: AsyncSession, ws: Workspace) -> None:
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        room = Room(workspace_id=ws.id, name="Room 101")
        db_session.add_all([patient, room])
        await db_session.commit()

        event = ActivityTimeline(
            workspace_id=ws.id,
            patient_id=patient.id,
            event_type="room_enter",
            room_id=room.id,
            room_name="Room 101",
            description="Entered Room 101",
            source="auto",
        )
        db_session.add(event)
        await db_session.commit()
        await db_session.refresh(event)

        assert event.event_type == "room_enter"
        assert event.room_id == room.id
        assert event.source == "auto"

    @pytest.mark.asyncio
    async def test_mode_switch_event(
        self, db_session: AsyncSession, ws: Workspace
    ) -> None:
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        db_session.add(patient)
        await db_session.commit()

        event = ActivityTimeline(
            workspace_id=ws.id,
            patient_id=patient.id,
            event_type="mode_switch",
            description="Switched to walking mode",
            data={"from": "wheelchair", "to": "walking"},
            source="system",
        )
        db_session.add(event)
        await db_session.commit()
        await db_session.refresh(event)

        assert event.data["from"] == "wheelchair"
        assert event.data["to"] == "walking"

    @pytest.mark.asyncio
    async def test_caregiver_observation_event(
        self, db_session: AsyncSession, ws: Workspace
    ) -> None:
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        cg = CareGiver(workspace_id=ws.id, first_name="C", last_name="D", role="observer")
        db_session.add_all([patient, cg])
        await db_session.commit()

        event = ActivityTimeline(
            workspace_id=ws.id,
            patient_id=patient.id,
            event_type="observation",
            description="ผู้ป่วยดูเหนื่อย",
            source="caregiver",
            caregiver_id=cg.id,
        )
        db_session.add(event)
        await db_session.commit()
        await db_session.refresh(event)

        assert event.caregiver_id == cg.id
        assert event.source == "caregiver"


class TestAlert:
    @pytest.mark.asyncio
    async def test_create_fall_alert(
        self, db_session: AsyncSession, ws: Workspace
    ) -> None:
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        db_session.add(patient)
        await db_session.commit()

        alert = Alert(
            workspace_id=ws.id,
            patient_id=patient.id,
            device_id="M5-001",
            alert_type="fall",
            severity="critical",
            title="Fall detected - Patient A B",
            description="|az| > 3g detected",
            data={"az": 3.5, "velocity": 0.01},
        )
        db_session.add(alert)
        await db_session.commit()
        await db_session.refresh(alert)

        assert alert.alert_type == "fall"
        assert alert.severity == "critical"
        assert alert.status == "active"
        assert alert.acknowledged_by is None

    @pytest.mark.asyncio
    async def test_alert_lifecycle(
        self, db_session: AsyncSession, ws: Workspace
    ) -> None:
        """Test alert: active → acknowledged → resolved."""
        patient = Patient(workspace_id=ws.id, first_name="A", last_name="B")
        cg = CareGiver(workspace_id=ws.id, first_name="C", last_name="D", role="supervisor")
        db_session.add_all([patient, cg])
        await db_session.commit()

        alert = Alert(
            workspace_id=ws.id,
            patient_id=patient.id,
            alert_type="abnormal_hr",
            severity="warning",
            title="HR > 120 bpm",
            data={"hr": 135},
        )
        db_session.add(alert)
        await db_session.commit()

        # ── Acknowledge ──
        alert.status = "acknowledged"
        alert.acknowledged_by = cg.id
        alert.acknowledged_at = datetime.now(timezone.utc)
        await db_session.commit()
        await db_session.refresh(alert)

        assert alert.status == "acknowledged"
        assert alert.acknowledged_by == cg.id

        # ── Resolve ──
        alert.status = "resolved"
        alert.resolved_at = datetime.now(timezone.utc)
        alert.resolution_note = "HR normalized after medication"
        await db_session.commit()
        await db_session.refresh(alert)

        assert alert.status == "resolved"
        assert alert.resolution_note == "HR normalized after medication"

    @pytest.mark.asyncio
    async def test_device_alert_no_patient(
        self, db_session: AsyncSession, ws: Workspace
    ) -> None:
        """Device alerts (low battery, offline) may not have a patient."""
        alert = Alert(
            workspace_id=ws.id,
            device_id="M5-002",
            alert_type="low_battery",
            severity="info",
            title="M5-002 battery at 5%",
        )
        db_session.add(alert)
        await db_session.commit()
        await db_session.refresh(alert)

        assert alert.patient_id is None
        assert alert.device_id == "M5-002"


# ══════════════════════════════════════════════════════════════════════════════
# SCHEMA VALIDATION (Pydantic)
# ══════════════════════════════════════════════════════════════════════════════


class TestPydanticSchemas:
    def test_patient_create_minimal(self) -> None:
        from app.schemas.patients import PatientCreate

        data = PatientCreate(first_name="Test", last_name="User")
        assert data.care_level == "normal"
        assert data.mobility_type == "wheelchair"
        assert data.medical_conditions == []

    def test_patient_out_accepts_structured_medical_conditions(self) -> None:
        """DB/seed may store medical_conditions as list[dict] (severity + condition)."""
        from datetime import UTC, datetime

        from app.schemas.patients import PatientOut

        now = datetime.now(UTC)
        row = PatientOut(
            id=1,
            workspace_id=1,
            first_name="A",
            last_name="B",
            nickname="",
            date_of_birth=None,
            gender="",
            height_cm=None,
            weight_kg=None,
            blood_type="",
            medical_conditions=[{"severity": "high", "condition": "diabetes"}],
            allergies=[],
            medications=[],
            care_level="normal",
            mobility_type="wheelchair",
            current_mode="wheelchair",
            notes="",
            admitted_at=now,
            is_active=True,
            room_id=None,
            created_at=now,
        )
        assert row.medical_conditions[0]["condition"] == "diabetes"

    def test_facility_create(self) -> None:
        from app.schemas.facility import FacilityCreate

        data = FacilityCreate(name="Building A")
        assert data.address == ""
        assert data.config == {}

    def test_floor_create(self) -> None:
        from app.schemas.facility import FloorCreate

        data = FloorCreate(facility_id=1, floor_number=1, name="Ground")
        assert data.map_data == {}

    def test_room_create_v2(self) -> None:
        from app.schemas.facility import RoomCreateV2

        data = RoomCreateV2(
            name="Room 101",
            room_type="bedroom",
            node_device_id="TSIM-001",
            adjacent_rooms=[2, 3],
        )
        assert data.room_type == "bedroom"
        assert data.adjacent_rooms == [2, 3]

    def test_vital_reading_create(self) -> None:
        from app.schemas.vitals import VitalReadingCreate

        data = VitalReadingCreate(
            patient_id=1, device_id="POLAR-001", heart_rate_bpm=72, source="ble"
        )
        assert data.source == "ble"

    def test_alert_create(self) -> None:
        from app.schemas.activity import AlertCreate

        data = AlertCreate(
            alert_type="fall", severity="critical", title="Fall detected"
        )
        assert data.patient_id is None
        assert data.severity == "critical"

    def test_mode_switch_request(self) -> None:
        from app.schemas.patients import ModeSwitchRequest

        data = ModeSwitchRequest(mode="walking")
        assert data.mode == "walking"

    def test_caregiver_create(self) -> None:
        from app.schemas.caregivers import CareGiverCreate

        data = CareGiverCreate(first_name="A", last_name="B", role="observer")
        assert data.phone == ""

    def test_shift_create(self) -> None:
        from app.schemas.caregivers import ShiftCreate

        data = ShiftCreate(
            shift_date=date(2026, 4, 1),
            start_time=time(8, 0),
            end_time=time(16, 0),
        )
        assert data.shift_type == "regular"

    def test_timeline_event_create(self) -> None:
        from app.schemas.activity import TimelineEventCreate

        data = TimelineEventCreate(
            patient_id=1, event_type="room_enter", room_name="Room 101"
        )
        assert data.source == "auto"

    def test_health_observation_create(self) -> None:
        from app.schemas.vitals import HealthObservationCreate

        data = HealthObservationCreate(
            patient_id=1,
            observation_type="meal",
            meal_type="lunch",
            meal_portion="full",
            water_ml=300,
        )
        assert data.meal_type == "lunch"

    def test_device_assignment_create(self) -> None:
        from app.schemas.patients import DeviceAssignmentCreate

        data = DeviceAssignmentCreate(device_id="M5-001", device_role="wheelchair_sensor")
        assert data.device_role == "wheelchair_sensor"
