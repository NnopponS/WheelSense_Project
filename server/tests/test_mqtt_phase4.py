"""Phase 4 MQTT handler enhancement tests.

Covers:
1. Polar HR ingestion → VitalReading
2. Room transition tracking → ActivityTimeline events
3. Fall detection → Alert + MQTT publish
4. Photo chunking → file assembly
5. Vitals/Alert broadcast
"""

import json
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch

from sqlalchemy import select

from app.models.core import Workspace, Device
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.vitals import VitalReading
from app.config import settings
from app.models.activity import ActivityTimeline, Alert
from tests.conftest import _get_session_factory

_SessionFactory = _get_session_factory()


@pytest_asyncio.fixture
async def ws_with_patient():
    """Create workspace + patient + device assignment for MQTT tests."""
    async with _SessionFactory() as session:
        ws = Workspace(name="MQTT-WS", is_active=True)
        session.add(ws)
        await session.commit()
        await session.refresh(ws)

        patient = Patient(
            workspace_id=ws.id,
            first_name="Test",
            last_name="Patient",
            care_level="normal",
        )
        session.add(patient)
        await session.commit()
        await session.refresh(patient)

        # Register device
        device = Device(
            device_id="M5-001",
            workspace_id=ws.id,
            device_type="wheelchair",
        )
        session.add(device)
        camera_device = Device(
            device_id="CAM_1",
            workspace_id=ws.id,
            device_type="camera",
        )
        session.add(camera_device)
        await session.commit()

        # Bind device to patient
        assignment = PatientDeviceAssignment(
            workspace_id=ws.id,
            patient_id=patient.id,
            device_id="M5-001",
            device_role="wheelchair_sensor",
            is_active=True,
        )
        session.add(assignment)
        await session.commit()

        return {"ws": ws, "patient": patient, "device": device}


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy", return_value=None)
@patch.object(settings, "mqtt_auto_register_devices", False)
async def test_unknown_device_telemetry_is_dropped(mock_predict, ws_with_patient):
    from app.mqtt_handler import _handle_telemetry

    mock_client = AsyncMock()
    payload = {
        "device_id": "UNKNOWN-DEVICE",
        "imu": {"ax": 0, "ay": 0, "az": 1.0, "gx": 0, "gy": 0, "gz": 0},
        "motion": {},
        "battery": {},
        "rssi": [],
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        telemetry_rows = (await session.execute(select(Device).where(Device.device_id == "UNKNOWN-DEVICE"))).scalars().all()
        assert len(telemetry_rows) == 0


# ── 1. Polar HR Ingestion ────────────────────────────────────────────────────


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy", return_value=None)
async def test_polar_hr_creates_vital_reading(mock_predict, ws_with_patient):
    """When telemetry contains polar_hr, a VitalReading should be created."""
    from app.mqtt_handler import _handle_telemetry

    mock_client = AsyncMock()
    payload = {
        "device_id": "M5-001",
        "imu": {"ax": 0.0, "ay": 0.0, "az": 1.0, "gx": 0, "gy": 0, "gz": 0},
        "motion": {},
        "battery": {},
        "rssi": [],
        "polar_hr": {
            "heart_rate_bpm": 78,
            "rr_interval_ms": 769.2,
            "sensor_battery": 85,
        },
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        readings = (await session.execute(select(VitalReading))).scalars().all()
        assert len(readings) == 1
        assert readings[0].heart_rate_bpm == 78
        assert readings[0].rr_interval_ms == 769.2
        assert readings[0].sensor_battery == 85
        assert readings[0].source == "ble"
        assert readings[0].patient_id == ws_with_patient["patient"].id


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy", return_value=None)
async def test_polar_hr_publishes_vitals(mock_predict, ws_with_patient):
    """Should publish vitals to WheelSense/vitals/{patient_id}."""
    from app.mqtt_handler import _handle_telemetry

    mock_client = AsyncMock()
    payload = {
        "device_id": "M5-001",
        "imu": {"ax": 0, "ay": 0, "az": 1.0, "gx": 0, "gy": 0, "gz": 0},
        "motion": {},
        "battery": {},
        "rssi": [],
        "polar_hr": {"heart_rate_bpm": 65},
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    # Should have published to vitals topic
    calls = [str(c) for c in mock_client.publish.call_args_list]
    vitals_published = any("WheelSense/vitals/" in c for c in calls)
    assert vitals_published


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy", return_value=None)
async def test_polar_hr_no_assignment_skips(mock_predict, ws_with_patient):
    """If device has no patient assignment, skip vital reading creation."""
    from app.mqtt_handler import _handle_telemetry

    mock_client = AsyncMock()
    payload = {
        "device_id": "UNASSIGNED-DEVICE",
        "imu": {"ax": 0, "ay": 0, "az": 1.0, "gx": 0, "gy": 0, "gz": 0},
        "motion": {},
        "battery": {},
        "rssi": [],
        "polar_hr": {"heart_rate_bpm": 80},
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        readings = (await session.execute(select(VitalReading))).scalars().all()
        assert len(readings) == 0


# ── 2. Room Transition Tracking ──────────────────────────────────────────────


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy")
async def test_room_transition_creates_timeline_events(mock_predict, ws_with_patient, monkeypatch):
    """When room prediction changes, create room_exit + room_enter events."""
    from app.mqtt_handler import _handle_telemetry, _room_tracker

    monkeypatch.setattr(settings, "room_timeline_stability_samples", 1)

    # Clear tracker state
    _room_tracker.clear()

    mock_client = AsyncMock()

    # First prediction: Room A
    mock_predict.return_value = {
        "room_id": 1, "room_name": "Room A", "confidence": 0.9, "model_type": "knn"
    }
    payload = {
        "device_id": "M5-001",
        "imu": {"ax": 0, "ay": 0, "az": 1.0, "gx": 0, "gy": 0, "gz": 0},
        "motion": {},
        "battery": {},
        "rssi": [{"node": "CAM_1", "rssi": -60}],
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    # Second prediction: Room B (transition!)
    mock_predict.return_value = {
        "room_id": 2, "room_name": "Room B", "confidence": 0.85, "model_type": "knn"
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        events = (await session.execute(
            select(ActivityTimeline).order_by(ActivityTimeline.id)
        )).scalars().all()

        # Should have: room_enter(A), room_exit(A), room_enter(B)
        event_types = [e.event_type for e in events]
        assert "room_enter" in event_types
        assert "room_exit" in event_types

        # Verify patient linking
        for e in events:
            assert e.patient_id == ws_with_patient["patient"].id


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy")
async def test_room_no_transition_no_duplicate_events(mock_predict, ws_with_patient, monkeypatch):
    """Same room prediction twice should NOT create duplicate events."""
    from app.mqtt_handler import _handle_telemetry, _room_tracker

    monkeypatch.setattr(settings, "room_timeline_stability_samples", 1)

    _room_tracker.clear()
    mock_client = AsyncMock()

    mock_predict.return_value = {
        "room_id": 1, "room_name": "Room A", "confidence": 0.9, "model_type": "knn"
    }
    payload = {
        "device_id": "M5-001",
        "imu": {"ax": 0, "ay": 0, "az": 1.0, "gx": 0, "gy": 0, "gz": 0},
        "motion": {},
        "battery": {},
        "rssi": [{"node": "CAM_1", "rssi": -60}],
    }

    # Same room twice
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        events = (await session.execute(select(ActivityTimeline))).scalars().all()
        # Only ONE room_enter for Room A, no duplicates
        enter_events = [e for e in events if e.event_type == "room_enter"]
        assert len(enter_events) == 1


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy")
async def test_room_timeline_stability_requires_consecutive_agreement(mock_predict, ws_with_patient, monkeypatch):
    """With stability N, need N identical predictions before the first room_enter."""
    from app.mqtt_handler import _handle_telemetry, _room_tracker

    monkeypatch.setattr(settings, "room_timeline_stability_samples", 3)

    _room_tracker.clear()
    mock_client = AsyncMock()

    mock_predict.return_value = {
        "room_id": 1, "room_name": "Room A", "confidence": 0.9, "model_type": "knn"
    }
    payload = {
        "device_id": "M5-001",
        "imu": {"ax": 0, "ay": 0, "az": 1.0, "gx": 0, "gy": 0, "gz": 0},
        "motion": {},
        "battery": {},
        "rssi": [{"node": "CAM_1", "rssi": -60}],
    }

    await _handle_telemetry(json.dumps(payload).encode(), mock_client)
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        events = (await session.execute(select(ActivityTimeline))).scalars().all()
        assert len([e for e in events if e.event_type == "room_enter"]) == 0

    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        events = (await session.execute(select(ActivityTimeline))).scalars().all()
        assert len([e for e in events if e.event_type == "room_enter"]) == 1


# ── 3. Fall Detection ────────────────────────────────────────────────────────


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy", return_value=None)
async def test_fall_detection_creates_alert(mock_predict, ws_with_patient):
    """|az| > 3g AND velocity < 0.05 should create a fall alert."""
    from app.mqtt_handler import _handle_telemetry

    mock_client = AsyncMock()
    payload = {
        "device_id": "M5-001",
        "imu": {"ax": 0.5, "ay": 0.3, "az": 3.5, "gx": 0, "gy": 0, "gz": 0},
        "motion": {"velocity_ms": 0.02, "distance_m": 0.0},
        "battery": {},
        "rssi": [],
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        alerts = (await session.execute(select(Alert))).scalars().all()
        assert len(alerts) == 1
        assert alerts[0].alert_type == "fall"
        assert alerts[0].severity == "critical"
        assert alerts[0].patient_id == ws_with_patient["patient"].id

    # Should publish alert to MQTT
    calls = [str(c) for c in mock_client.publish.call_args_list]
    alert_published = any("WheelSense/alerts/" in c for c in calls)
    assert alert_published


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy", return_value=None)
async def test_no_fall_when_velocity_high(mock_predict, ws_with_patient):
    """High az BUT high velocity = just motion, not a fall."""
    from app.mqtt_handler import _handle_telemetry

    mock_client = AsyncMock()
    payload = {
        "device_id": "M5-001",
        "imu": {"ax": 0.5, "ay": 0.3, "az": 3.5, "gx": 0, "gy": 0, "gz": 0},
        "motion": {"velocity_ms": 1.5},  # Moving fast = not a fall
        "battery": {},
        "rssi": [],
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        alerts = (await session.execute(select(Alert))).scalars().all()
        assert len(alerts) == 0


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy", return_value=None)
async def test_no_fall_when_az_low(mock_predict, ws_with_patient):
    """Low az regardless of velocity = normal motion."""
    from app.mqtt_handler import _handle_telemetry

    mock_client = AsyncMock()
    payload = {
        "device_id": "M5-001",
        "imu": {"ax": 0.5, "ay": 0.3, "az": 1.0, "gx": 0, "gy": 0, "gz": 0},
        "motion": {"velocity_ms": 0.01},
        "battery": {},
        "rssi": [],
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        alerts = (await session.execute(select(Alert))).scalars().all()
        assert len(alerts) == 0


# ── 4. Photo Chunking ────────────────────────────────────────────────────────


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_photo_chunking_assembly(ws_with_patient, tmp_path):
    """Multi-chunk photo should be reassembled into a complete file."""
    from app.mqtt_handler import _handle_photo_chunk, _photo_buffers

    _photo_buffers.clear()

    # Simulated 3-chunk image
    fake_data = b"\xff\xd8\xff" + (b"\x00" * 100)  # fake JPEG header
    chunk_size = len(fake_data) // 3 + 1
    chunks = [
        fake_data[i:i + chunk_size]
        for i in range(0, len(fake_data), chunk_size)
    ]

    import base64
    for i, chunk in enumerate(chunks):
        payload = json.dumps({
            "device_id": "CAM_1",
            "photo_id": "photo-001",
            "chunk_index": i,
            "total_chunks": len(chunks),
            "data": base64.b64encode(chunk).decode(),
        }).encode()

        await _handle_photo_chunk(payload, save_dir=str(tmp_path))

    # Verify file was assembled
    import os
    files = os.listdir(tmp_path)
    assert len(files) == 1
    assert files[0].endswith(".jpg")

    # Verify content matches
    with open(tmp_path / files[0], "rb") as f:
        content = f.read()
    assert content == fake_data


# ── 5. Public MQTT TLS Config ───────────────────────────────────────────────


def test_mqtt_tls_config():
    """Config should support mqtt_tls option for public brokers."""
    import os
    os.environ["MQTT_TLS"] = "true"
    os.environ["MQTT_BROKER"] = "test.mosquitto.org"
    os.environ["MQTT_PORT"] = "8883"

    from app.config import Settings
    s = Settings()
    assert s.mqtt_tls is True
    assert s.mqtt_broker == "test.mosquitto.org"
    assert s.mqtt_port == 8883

    # Clean up
    os.environ.pop("MQTT_TLS", None)
    os.environ.pop("MQTT_BROKER", None)
    os.environ.pop("MQTT_PORT", None)
