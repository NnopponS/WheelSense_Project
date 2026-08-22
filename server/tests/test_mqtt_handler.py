import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
import json
from datetime import datetime, UTC

from app.models.core import Device, Workspace
from app.models.core import DeviceCommandDispatch
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.telemetry import (
    IMUTelemetry,
    MotionTrainingData,
    NodeStatusTelemetry,
    RSSIReading,
    RoomPrediction,
)
from app.models.vitals import VitalReading
from app.services.device_management import build_device_history
from tests.conftest import _get_session_factory

_SessionFactory = _get_session_factory()

# Import handlers
from app.mqtt_handler import (
    _handle_telemetry,
    _handle_mobile_registration,
    _handle_mobile_telemetry,
    _handle_device_ack,
    _handle_camera_registration,
    _handle_camera_status,
    _handle_photo_chunk,
)


@pytest_asyncio.fixture
async def active_workspace():
    async with _SessionFactory() as session:
        ws = Workspace(name="Test WS", is_active=True)
        session.add(ws)
        await session.commit()
        await session.refresh(ws)
        return ws


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy")
async def test_handle_telemetry(mock_predict, active_workspace):
    mock_client = AsyncMock()
    mock_predict.return_value = {
        "room_id": 1, "room_name": "Living", "confidence": 0.9, "model_type": "knn"
    }

    payload = {
        "device_id": "WHEEL_1",
        "firmware": "v1.0.0",
        "imu": {"ax": 0.1, "ay": 0.2, "az": 0.3},
        "motion": {"distance_m": 5.0, "velocity_ms": 1.2},
        "battery": {"percentage": 90},
        "rssi": [
            {"node": "CAM_1", "rssi": -65, "mac": "AA:BB"},
            {"node": "CAM_2", "rssi": -70}
        ],
        "is_recording": True,
        "action_label": "Walking",
        "session_id": "session-123",
        "timestamp": datetime.now(UTC).isoformat()
    }

    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id="WHEEL_1",
                workspace_id=active_workspace.id,
                device_type="wheelchair",
            )
        )
        await session.commit()
    
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)
    
    # Check DB updates
    async with _SessionFactory() as session:
        from sqlalchemy import select
        device = (await session.execute(select(Device).where(Device.device_id == "WHEEL_1"))).scalar_one_or_none()
        assert device is not None
        assert device.workspace_id == active_workspace.id
        
        # Telemetry inserted
        imu = (await session.execute(select(IMUTelemetry))).scalars().first()
        assert imu is not None
        assert imu.ax == 0.1
        
        # Motion inserted
        motion = (await session.execute(select(MotionTrainingData))).scalars().first()
        assert motion is not None
        assert motion.action_label == "Walking"
        
        # Room prediction inserted
        pred = (await session.execute(select(RoomPrediction))).scalars().first()
        assert pred is not None
        assert pred.predicted_room_name == "Living"

    # Publishes prediction
    mock_client.publish.assert_called_once()
    args, _ = mock_client.publish.call_args
    assert "WheelSense/room/WHEEL_1" in args[0]
    assert "Living" in args[1]


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_handle_telemetry_no_workspace():
    # Empty DB: no workspace -> auto-register cannot pick a scope -> telemetry dropped
    mock_client = AsyncMock()
    payload = {"device_id": "WHEEL_1"}
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        from sqlalchemy import select
        device = (await session.execute(select(Device))).scalar_one_or_none()
        assert device is None


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_handle_telemetry_auto_registers(active_workspace):
    mock_client = AsyncMock()
    payload = {
        "device_id": "WS_01",
        "device_type": "wheelchair",
        "hardware_type": "wheelchair",
        "firmware": "3.2.1",
        "imu": {"ax": 0.1, "ay": 0, "az": 1},
        "motion": {"distance_m": 1, "velocity_ms": 0},
        "battery": {"percentage": 100},
        "rssi": [],
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        from sqlalchemy import select
        d = (
            await session.execute(select(Device).where(Device.device_id == "WS_01"))
        ).scalar_one_or_none()
        assert d is not None
        assert d.workspace_id == active_workspace.id
        assert d.hardware_type == "wheelchair"


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy")
async def test_handle_telemetry_auto_registers_ble_node_from_rssi(mock_predict, active_workspace):
    mock_predict.return_value = None
    mock_client = AsyncMock()

    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id="WS_01",
                workspace_id=active_workspace.id,
                device_type="wheelchair",
                hardware_type="wheelchair",
            )
        )
        await session.commit()

    payload = {
        "device_id": "WS_01",
        "device_type": "wheelchair",
        "hardware_type": "wheelchair",
        "firmware": "3.2.1",
        "imu": {"ax": 0.1, "ay": 0, "az": 1},
        "motion": {"distance_m": 0, "velocity_ms": 0},
        "battery": {"percentage": 100},
        "rssi": [
            {"node": "WSN_001", "rssi": -41, "mac": "34:85:18:8b:d7:7d"},
        ],
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        from sqlalchemy import select

        ble = (
            await session.execute(
                select(Device).where(Device.device_id == "BLE_3485188BD77D")
            )
        ).scalar_one_or_none()
        assert ble is not None
        assert ble.workspace_id == active_workspace.id
        assert ble.hardware_type == "node"
        assert ble.config.get("ble_node_id") == "WSN_001"
        assert ble.config.get("discovered_via") == "wheelchair_rssi"


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.services.mqtt_publish.publish_mobile_device_config_resolved_background")
async def test_mobile_registration_creates_m5_companion(mock_publish, active_workspace):
    payload = {
        "device_id": "MOB_GATE_1",
        "device_name": "Gateway phone",
        "platform": "android",
        "app_version": "1.2.3",
        "companion_m5": {
            "device_id": "M5_CHILD_1",
            "name": "Wheelchair M5",
            "firmware": "4.0.0",
            "model": "M5StickCPlus2",
            "mac": "AA:BB:CC:DD:EE:FF",
        },
    }

    await _handle_mobile_registration(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        mobile = (
            await session.execute(select(Device).where(Device.device_id == "MOB_GATE_1"))
        ).scalar_one()
        m5 = (
            await session.execute(select(Device).where(Device.device_id == "M5_CHILD_1"))
        ).scalar_one()

        assert mobile.hardware_type == "mobile_phone"
        assert (mobile.config or {}).get("m5_companion_device_id") == "M5_CHILD_1"
        assert m5.hardware_type == "companion_m5"
        assert m5.display_name == "Wheelchair M5"
        assert (m5.config or {}).get("parent_mobile_device_id") == "MOB_GATE_1"
        assert (m5.config or {}).get("model") == "M5StickCPlus2"

    mock_publish.assert_called_once_with("MOB_GATE_1")


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy")
@patch("app.services.mqtt_publish.publish_mobile_device_config_resolved_background")
async def test_mobile_telemetry_persists_m5_child_imu_without_breaking_rssi_or_polar(
    mock_publish,
    mock_predict,
    active_workspace,
):
    mock_predict.return_value = None
    mock_client = AsyncMock()

    async with _SessionFactory() as session:
        patient = Patient(
            workspace_id=active_workspace.id,
            first_name="M5",
            last_name="Owner",
        )
        mobile = Device(
            device_id="MOB_GATE_2",
            workspace_id=active_workspace.id,
            device_type="mobile_phone",
            hardware_type="mobile_phone",
            config={"m5_companion_device_id": "M5_CHILD_2"},
        )
        m5 = Device(
            device_id="M5_CHILD_2",
            workspace_id=active_workspace.id,
            device_type="companion_m5",
            hardware_type="companion_m5",
            config={"parent_mobile_device_id": "MOB_GATE_2"},
        )
        session.add_all([patient, mobile, m5])
        await session.flush()
        session.add(
            PatientDeviceAssignment(
                workspace_id=active_workspace.id,
                patient_id=patient.id,
                device_id="MOB_GATE_2",
                device_role="mobile",
                is_active=True,
            )
        )
        await session.commit()

    payload = {
        "device_id": "MOB_GATE_2",
        "battery": {"percentage": 74},
        "rssi": [{"node": "WSN_001", "rssi": -55, "mac": "34:85:18:8B:D7:7D"}],
        "hr": {"bpm": 82, "rr_intervals": [812.5]},
        "hr_source": "polar_sdk",
        "m5": {
            "imu": {"ax": 0.11, "ay": 0.22, "az": 1.03, "gx": 2.0},
            "motion": {"distance_m": 3.5, "velocity_ms": 0.4, "accel_ms2": 0.8},
            "battery": {"percentage": 88, "voltage_v": 4.08, "charging": False},
            "seq": 7,
        },
        "timestamp": datetime.now(UTC).isoformat(),
    }

    await _handle_mobile_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        from sqlalchemy import select

        imu = (
            await session.execute(
                select(IMUTelemetry).where(IMUTelemetry.device_id == "M5_CHILD_2")
            )
        ).scalar_one()
        assert imu.ax == 0.11
        assert imu.distance_m == 3.5
        assert imu.battery_pct == 88

        rssi = (
            await session.execute(
                select(RSSIReading).where(RSSIReading.device_id == "MOB_GATE_2")
            )
        ).scalar_one()
        assert rssi.node_id == "WSN_001"
        assert rssi.rssi == -55

        vital = (
            await session.execute(
                select(VitalReading).where(VitalReading.device_id == "MOB_GATE_2")
            )
        ).scalar_one()
        assert vital.heart_rate_bpm == 82
        assert vital.source == "polar_sdk"

    mock_publish.assert_called_once_with("MOB_GATE_2")


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_handle_telemetry_auto_register_skipped_multi_workspace(active_workspace):
    async with _SessionFactory() as session:
        session.add(Workspace(name="Second WS", is_active=True))
        await session.commit()

    mock_client = AsyncMock()
    payload = {
        "device_id": "MULTI_1",
        "firmware": "1",
        "imu": {"ax": 0, "ay": 0, "az": 1},
        "motion": {},
        "battery": {},
        "rssi": [],
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        from sqlalchemy import select
        d = (
            await session.execute(select(Device).where(Device.device_id == "MULTI_1"))
        ).scalar_one_or_none()
        assert d is None


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_camera_registration_merges_ble_stub(active_workspace):
    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id="BLE_3485188BD77D",
                workspace_id=active_workspace.id,
                device_type="camera",
                hardware_type="node",
                display_name="WSN_001",
                config={
                    "ble_mac": "34:85:18:8b:d7:7d",
                    "ble_node_id": "WSN_001",
                },
            )
        )
        await session.commit()

    payload = {
        "device_id": "CAM_MERGE",
        "node_id": "WSN_001",
        "ip_address": "10.0.0.1",
        "firmware": "3.0.0",
        "ble_mac": "34:85:18:8B:D7:7D",
    }
    await _handle_camera_registration(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        old = (
            await session.execute(select(Device).where(Device.device_id == "BLE_3485188BD77D"))
        ).scalar_one_or_none()
        assert old is None
        cam = (
            await session.execute(select(Device).where(Device.device_id == "CAM_MERGE"))
        ).scalar_one_or_none()
        assert cam is not None
        assert cam.hardware_type == "node"
        assert cam.config.get("merged_from_ble_stub") is True


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_camera_registration_merges_ble_stub_using_ble_device_id_mac(active_workspace):
    """BLE_* stub may omit config ble_mac; MAC is still encoded in the registry device_id."""
    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id="BLE_AABBCCDDEEFF",
                workspace_id=active_workspace.id,
                device_type="camera",
                hardware_type="node",
                display_name="WSN_009",
                config={"ble_node_id": "WSN_009"},
            )
        )
        await session.commit()

    payload = {
        "device_id": "CAM_FROM_BLE",
        "node_id": "WSN_009",
        "ip_address": "10.0.0.2",
        "firmware": "3.0.0",
        "ble_mac": "AA:BB:CC:DD:EE:FF",
    }
    await _handle_camera_registration(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        stub = (
            await session.execute(select(Device).where(Device.device_id == "BLE_AABBCCDDEEFF"))
        ).scalar_one_or_none()
        assert stub is None
        cam = (
            await session.execute(select(Device).where(Device.device_id == "CAM_FROM_BLE"))
        ).scalar_one_or_none()
        assert cam is not None
        assert cam.config.get("merged_from_ble_stub") is True


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_camera_registration_auto_creates_cam_without_ble_stub(active_workspace):
    """First camera /registration creates registry row when a single workspace can be resolved."""
    payload = {
        "device_id": "CAM_BRAND_NEW",
        "node_id": "WSN_100",
        "ip_address": "10.0.0.3",
        "firmware": "3.0.0",
        "ble_mac": "11:22:33:44:55:66",
    }
    await _handle_camera_registration(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        cam = (
            await session.execute(select(Device).where(Device.device_id == "CAM_BRAND_NEW"))
        ).scalar_one_or_none()
        assert cam is not None
        assert cam.workspace_id == active_workspace.id
        assert cam.hardware_type == "node"


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_camera_registration_deletes_duplicate_ble_when_cam_pre_registered(active_workspace):
    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id="CAM_EXIST",
                workspace_id=active_workspace.id,
                device_type="camera",
                hardware_type="node",
                display_name="WSN_001",
                config={"ble_mac": "34:85:18:8b:d7:7d"},
            )
        )
        session.add(
            Device(
                device_id="BLE_3485188BD77D",
                workspace_id=active_workspace.id,
                device_type="camera",
                hardware_type="node",
                display_name="WSN_001",
                config={
                    "ble_mac": "34:85:18:8b:d7:7d",
                    "ble_node_id": "WSN_001",
                    "discovered_via": "wheelchair_rssi",
                },
            )
        )
        await session.commit()

    payload = {
        "device_id": "CAM_EXIST",
        "node_id": "WSN_001",
        "ip_address": "10.0.0.1",
        "firmware": "3.0.0",
        "ble_mac": "34:85:18:8B:D7:7D",
    }
    await _handle_camera_registration(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        ble = (
            await session.execute(select(Device).where(Device.device_id == "BLE_3485188BD77D"))
        ).scalar_one_or_none()
        assert ble is None
        cam = (
            await session.execute(select(Device).where(Device.device_id == "CAM_EXIST"))
        ).scalar_one_or_none()
        assert cam is not None


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_telemetry_skips_ble_stub_when_cam_claims_mac(active_workspace):
    mock_client = AsyncMock()
    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id="WHEEL_BLE_SKIP",
                workspace_id=active_workspace.id,
                device_type="wheelchair",
            )
        )
        session.add(
            Device(
                device_id="CAM_BLE_SKIP",
                workspace_id=active_workspace.id,
                device_type="camera",
                hardware_type="node",
                display_name="WSN_001",
                config={"ble_mac": "34:85:18:8b:d7:7d"},
            )
        )
        await session.commit()

    payload = {
        "device_id": "WHEEL_BLE_SKIP",
        "firmware": "1",
        "imu": {"ax": 0, "ay": 0, "az": 1},
        "motion": {},
        "battery": {},
        "rssi": [
            {"node": "WSN_001", "rssi": -41, "mac": "34:85:18:8b:d7:7d"},
        ],
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        from sqlalchemy import select

        ble = (
            await session.execute(select(Device).where(Device.device_id == "BLE_3485188BD77D"))
        ).scalar_one_or_none()
        assert ble is None


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_telemetry_prunes_ble_stub_when_cam_has_ble_mac_reported_only(active_workspace):
    """CAM rows may carry ble_mac_reported after BLE→CAM merge without duplicating ble_mac; RSSI must not keep a BLE_* twin."""
    mock_client = AsyncMock()
    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id="WHEEL_PRUNE",
                workspace_id=active_workspace.id,
                device_type="wheelchair",
            )
        )
        session.add(
            Device(
                device_id="CAM_PRUNE",
                workspace_id=active_workspace.id,
                device_type="camera",
                hardware_type="node",
                display_name="WSN_001",
                config={"ble_mac_reported": "34:85:18:8b:d7:7d"},
            )
        )
        session.add(
            Device(
                device_id="BLE_3485188BD77D",
                workspace_id=active_workspace.id,
                device_type="camera",
                hardware_type="node",
                display_name="WSN_003",
                config={
                    "ble_mac": "34:85:18:8b:d7:7d",
                    "discovered_via": "wheelchair_rssi",
                },
            )
        )
        await session.commit()

    payload = {
        "device_id": "WHEEL_PRUNE",
        "firmware": "1",
        "imu": {"ax": 0, "ay": 0, "az": 1},
        "motion": {},
        "battery": {},
        "rssi": [
            {"node": "WSN_003", "rssi": -41, "mac": "34:85:18:8b:d7:7d"},
        ],
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        from sqlalchemy import select

        ble = (
            await session.execute(select(Device).where(Device.device_id == "BLE_3485188BD77D"))
        ).scalar_one_or_none()
        assert ble is None
        cam = (
            await session.execute(select(Device).where(Device.device_id == "CAM_PRUNE"))
        ).scalar_one_or_none()
        assert cam is not None


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_handle_camera_registration(active_workspace):
    payload = {
        "device_id": "CAM_1",
        "ip_address": "192.168.1.10",
        "firmware": "v2.0",
        "node_id": "NODE_CAM_1"
    }

    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id="CAM_1",
                workspace_id=active_workspace.id,
                device_type="camera",
            )
        )
        await session.commit()
    
    await _handle_camera_registration(json.dumps(payload).encode())
    
    async with _SessionFactory() as session:
        from sqlalchemy import select
        device = (await session.execute(select(Device).where(Device.device_id == "CAM_1"))).scalar_one_or_none()
        assert device is not None
        assert device.device_type == "camera"
        assert device.hardware_type == "node"
        assert device.ip_address == "192.168.1.10"

    # Run again to update existing
    payload["ip_address"] = "10.0.0.5"
    await _handle_camera_registration(json.dumps(payload).encode())
    
    async with _SessionFactory() as session:
        device = (await session.execute(select(Device).where(Device.device_id == "CAM_1"))).scalar_one_or_none()
        assert device.ip_address == "10.0.0.5"


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_handle_camera_status(active_workspace):
    """Status handler persists telemetry; CAM_* rows may be auto-created like registration."""
    payload = {
        "device_id": "CAM_STATUS_X",
        "node_id": "WSN_020",
        "ip_address": "10.9.9.1",
        "firmware": "3.0.0",
    }
    await _handle_camera_status(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        device = (
            await session.execute(select(Device).where(Device.device_id == "CAM_STATUS_X"))
        ).scalar_one_or_none()
        assert device is not None
        assert device.hardware_type == "node"
        assert device.last_seen is not None
        assert isinstance(device.config, dict)
        assert "camera_status" in device.config


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_e84_status_rejects_unsupported_version_before_persistence(active_workspace):
    payload = {
        "device_id": "E84_REJECT_VERSION",
        "protocolVersion": 99,
        "environment": {"temperatureC": 25.0},
    }

    with pytest.raises(ValueError, match="protocolVersion"):
        await _handle_camera_status(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        rows = (
            await session.execute(
                select(NodeStatusTelemetry).where(
                    NodeStatusTelemetry.device_id == "E84_REJECT_VERSION"
                )
            )
        ).scalars().all()
        assert rows == []


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_e84_status_v1_persists_in_registered_workspace_and_history(active_workspace):
    device_id = "E84_STATUS_V1"
    payload = {
        "device_id": device_id,
        "workspace_id": active_workspace.id + 1000,
        "protocolVersion": 1,
        "timestampUs": 123456789,
        "environment": {
            "temperatureC": 25.2,
            "humidityPct": 61.5,
            "pressureHpa": 1008.4,
            "validMask": 7,
        },
        "imu": {
            "accelX": 0.0,
            "accelY": 9.80665,
            "accelZ": 0.0,
            "gyroX": 0.0,
            "gyroY": 0.0,
            "gyroZ": 0.0,
        },
        "displayOrientation": "landscape",
        "audioStatus": "ready",
        "deviceHealth": "ready",
    }
    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id=device_id,
                workspace_id=active_workspace.id,
                device_type="camera",
                hardware_type="node",
            )
        )
        await session.commit()

    await _handle_camera_status(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        row = (
            await session.execute(
                select(NodeStatusTelemetry).where(NodeStatusTelemetry.device_id == device_id)
            )
        ).scalar_one()
        assert row.workspace_id == active_workspace.id
        assert row.payload == payload
        history = await build_device_history(
            session, active_workspace.id, device_id, hours=1, limit=10
        )
        assert history["node"][0]["payload"] == payload


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@pytest.mark.parametrize(
    "extension",
    [
        {"protocolVersion": True},
        {"protocolVersion": 1, "timestampUs": -1},
        {"protocolVersion": 1, "environment": []},
        {"protocolVersion": 1, "environment": {"humidityPct": 101}},
        {"protocolVersion": 1, "environment": {"temperatureC": float("nan")}},
        {"protocolVersion": 1, "environment": {"validMask": 2**32}},
        {"protocolVersion": 1, "imu": {"accelX": "invalid"}},
    ],
)
async def test_e84_status_rejects_malformed_extension_before_persistence(
    active_workspace, extension
):
    device_id = "E84_REJECT_MALFORMED"
    payload = {"device_id": device_id, **extension}

    with pytest.raises(ValueError):
        await _handle_camera_status(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        rows = (
            await session.execute(
                select(NodeStatusTelemetry).where(NodeStatusTelemetry.device_id == device_id)
            )
        ).scalars().all()
        assert rows == []


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_camera_status_merges_ble_stub_when_registration_missed(active_workspace):
    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id="BLE_3485188BD77D",
                workspace_id=active_workspace.id,
                device_type="camera",
                hardware_type="node",
                display_name="WSN_001",
                config={
                    "ble_mac": "34:85:18:8b:d7:7d",
                    "ble_node_id": "WSN_001",
                    "discovered_via": "wheelchair_rssi",
                },
            )
        )
        await session.commit()

    # Simulate status arriving even if registration message was missed/out-of-order.
    payload = {
        "device_id": "CAM_D77C",
        "node_id": "WSN_001",
        "ip_address": "10.0.0.9",
        "firmware": "3.0.1",
        "ble_mac": "34:85:18:8B:D7:7D",
    }
    await _handle_camera_status(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        ble = (
            await session.execute(select(Device).where(Device.device_id == "BLE_3485188BD77D"))
        ).scalar_one_or_none()
        assert ble is None
        cam = (
            await session.execute(select(Device).where(Device.device_id == "CAM_D77C"))
        ).scalar_one_or_none()
        assert cam is not None
        assert cam.hardware_type == "node"
        assert cam.config.get("merged_from_ble_stub") is True
        assert "camera_status" in cam.config


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_handle_wheelchair_ack_updates_dispatch(active_workspace):
    command_id = "11111111-2222-3333-4444-555555555555"

    async with _SessionFactory() as session:
        session.add(
            DeviceCommandDispatch(
                id=command_id,
                workspace_id=active_workspace.id,
                device_id="WHEEL_1",
                topic="WheelSense/WHEEL_1/control",
                payload={"command": "reset_distance", "command_id": command_id},
                status="sent",
            )
        )
        await session.commit()

    await _handle_device_ack(
        json.dumps(
            {
                "command_id": command_id,
                "device_id": "WHEEL_1",
                "command": "reset_distance",
                "status": "ok",
                "distance_m": 0.0,
            }
        ).encode()
    )

    async with _SessionFactory() as session:
        from sqlalchemy import select

        row = (
            await session.execute(
                select(DeviceCommandDispatch).where(DeviceCommandDispatch.id == command_id)
            )
        ).scalar_one()
        assert row.status == "acked"
        assert row.ack_payload["device_id"] == "WHEEL_1"
        assert row.ack_payload["status"] == "ok"
        assert row.ack_payload["distance_m"] == 0.0


@pytest.mark.asyncio
@patch("app.mqtt_handler.aiomqtt.Client")
@patch("app.mqtt_handler.asyncio.sleep", new_callable=AsyncMock)
async def test_mqtt_listener(mock_sleep, mock_mqtt):
    # Test only the exception/reconnection logic gracefully handling
    mock_mqtt.side_effect = Exception("Connection Failed")
    
    # We want to break out of the infinite loop
    mock_sleep.side_effect = InterruptedError("Break Loop")
    
    from app.mqtt_handler import mqtt_listener
    with pytest.raises(InterruptedError):
        await mqtt_listener()


# --- Phase 7: Photo chunk assembly tests -------------------------------------

@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_photo_chunk_single_chunk_assembles_and_persists(active_workspace, tmp_path):
    """A single-chunk photo should be assembled and persisted immediately."""
    import base64

    device_id = "CAM_PHOTO_1"
    async with _SessionFactory() as session:
        session.add(Device(
            device_id=device_id,
            workspace_id=active_workspace.id,
            device_type="camera",
            hardware_type="node",
        ))
        await session.commit()

    photo_id = "photo-single-1"
    chunk_data = b"\x89PNG\r\n\x1a\nfake-png-header"
    payload = {
        "photo_id": photo_id,
        "device_id": device_id,
        "chunk_index": 0,
        "total_chunks": 1,
        "data": base64.b64encode(chunk_data).decode(),
    }

    await _handle_photo_chunk(json.dumps(payload).encode(), save_dir=str(tmp_path))

    saved = list(tmp_path.glob("*"))
    assert len(saved) >= 1, f"Expected at least 1 saved file, got {saved}"


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_photo_chunk_multi_chunk_assembles_in_order(active_workspace, tmp_path):
    """Multi-chunk photo should assemble chunks in index order and persist."""
    import base64

    device_id = "CAM_PHOTO_2"
    async with _SessionFactory() as session:
        session.add(Device(
            device_id=device_id,
            workspace_id=active_workspace.id,
            device_type="camera",
            hardware_type="node",
        ))
        await session.commit()

    photo_id = "photo-multi-1"
    chunk0 = b"PART0-"
    chunk1 = b"PART1-"
    chunk2 = b"PART2"
    total = 3

    for i, chunk in enumerate([chunk0, chunk1, chunk2]):
        payload = {
            "photo_id": photo_id,
            "device_id": device_id,
            "chunk_index": i,
            "total_chunks": total,
            "data": base64.b64encode(chunk).decode(),
        }
        await _handle_photo_chunk(json.dumps(payload).encode(), save_dir=str(tmp_path))

    saved_files = list(tmp_path.glob("*"))
    assert len(saved_files) >= 1, f"Expected at least 1 saved file, got {saved_files}"
    saved_data = saved_files[0].read_bytes()
    assert saved_data == chunk0 + chunk1 + chunk2


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_photo_chunk_out_of_order_assembles_correctly(active_workspace, tmp_path):
    """Chunks arriving out of order should still assemble in index order."""
    import base64

    device_id = "CAM_PHOTO_3"
    async with _SessionFactory() as session:
        session.add(Device(
            device_id=device_id,
            workspace_id=active_workspace.id,
            device_type="camera",
            hardware_type="node",
        ))
        await session.commit()

    photo_id = "photo-ooo-1"
    chunks = [b"AAA", b"BBB", b"CCC"]
    order = [1, 0, 2]

    for idx in order:
        payload = {
            "photo_id": photo_id,
            "device_id": device_id,
            "chunk_index": idx,
            "total_chunks": len(chunks),
            "data": base64.b64encode(chunks[idx]).decode(),
        }
        await _handle_photo_chunk(json.dumps(payload).encode(), save_dir=str(tmp_path))

    saved_files = list(tmp_path.glob("*"))
    assert len(saved_files) >= 1
    assert saved_files[0].read_bytes() == b"AAABBBCCC"


@pytest.mark.asyncio
async def test_photo_chunk_partial_does_not_persist(tmp_path):
    """A partial photo (missing chunks) should not persist until all arrive."""
    import base64

    photo_id = "photo-partial-1"
    payload = {
        "photo_id": photo_id,
        "device_id": "CAM_PHOTO_4",
        "chunk_index": 0,
        "total_chunks": 3,
        "data": base64.b64encode(b"only-first").decode(),
    }

    await _handle_photo_chunk(json.dumps(payload).encode(), save_dir=str(tmp_path))

    saved_files = list(tmp_path.glob("*"))
    assert len(saved_files) == 0, "Partial photo should not be persisted"


# --- Phase 7: E84 status field compatibility tests ----------------------------

@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_e84_status_v1_with_all_optional_fields_persists(active_workspace):
    """E84 v1 status with all optional fields (IMU, audio, display, health) persists."""
    device_id = "E84_FULL_OPTIONAL"
    payload = {
        "device_id": device_id,
        "protocolVersion": 1,
        "timestampUs": 999999,
        "environment": {
            "temperatureC": 22.5,
            "humidityPct": 55.0,
            "pressureHpa": 1013.25,
            "validMask": 7,
        },
        "imu": {
            "accelX": 0.1,
            "accelY": 9.8,
            "accelZ": 0.2,
            "gyroX": 0.01,
            "gyroY": 0.02,
            "gyroZ": 0.03,
        },
        "displayOrientation": "portrait",
        "audioStatus": "ready",
        "deviceHealth": "ready",
    }

    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id=device_id,
                workspace_id=active_workspace.id,
                device_type="camera",
                hardware_type="node",
            )
        )
        await session.commit()

    await _handle_camera_status(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        row = (
            await session.execute(
                select(NodeStatusTelemetry).where(NodeStatusTelemetry.device_id == device_id)
            )
        ).scalar_one()
        assert row.workspace_id == active_workspace.id
        assert row.payload["protocolVersion"] == 1
        assert row.payload["environment"]["temperatureC"] == 22.5
        assert row.payload["imu"]["accelY"] == 9.8
        assert row.payload["displayOrientation"] == "portrait"


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_e84_status_v1_minimal_fields_persists(active_workspace):
    """E84 v1 status with only required fields (no optional sections) persists."""
    device_id = "E84_MINIMAL"
    payload = {
        "device_id": device_id,
        "protocolVersion": 1,
    }

    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id=device_id,
                workspace_id=active_workspace.id,
                device_type="camera",
                hardware_type="node",
            )
        )
        await session.commit()

    await _handle_camera_status(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        row = (
            await session.execute(
                select(NodeStatusTelemetry).where(NodeStatusTelemetry.device_id == device_id)
            )
        ).scalar_one()
        assert row.payload["protocolVersion"] == 1


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_e84_status_v1_partial_environment_valid_mask(active_workspace):
    """E84 v1 with partial environment (only temperature valid) persists with correct mask."""
    device_id = "E84_PARTIAL_ENV"
    payload = {
        "device_id": device_id,
        "protocolVersion": 1,
        "environment": {
            "temperatureC": 25.0,
            "humidityPct": 50.0,
            "pressureHpa": 1000.0,
            "validMask": 1,  # only temperature valid
        },
    }

    async with _SessionFactory() as session:
        session.add(
            Device(
                device_id=device_id,
                workspace_id=active_workspace.id,
                device_type="camera",
                hardware_type="node",
            )
        )
        await session.commit()

    await _handle_camera_status(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select

        row = (
            await session.execute(
                select(NodeStatusTelemetry).where(NodeStatusTelemetry.device_id == device_id)
            )
        ).scalar_one()
        assert row.payload["environment"]["validMask"] == 1


# --- Phase 7: Device ack edge cases -------------------------------------------

@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_device_ack_with_invalid_json_does_not_crash(active_workspace):
    """Invalid JSON on ack topic should be handled gracefully."""
    await _handle_device_ack(b"not valid json")
    # No assertion needed � just verify it doesn't raise


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_device_ack_without_command_id_is_ignored(active_workspace):
    """An ack without command_id should be silently ignored."""
    payload = json.dumps({"device_id": "DEV_1", "status": "ok"}).encode()
    await _handle_device_ack(payload)
    # No assertion needed � just verify it doesn't raise or create rows


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_device_ack_for_unknown_command_id_is_safe(active_workspace):
    """An ack for a non-existent command_id should not crash."""
    payload = json.dumps({
        "command_id": "nonexistent-uuid",
        "device_id": "DEV_1",
        "status": "ok",
    }).encode()
    await _handle_device_ack(payload)
    # No assertion needed � just verify it doesn't raise

# --- Phase 7: BLE payload compatibility tests ---------------------------------

@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy")
async def test_ble_telemetry_with_missing_mac_uses_node_name_fallback(mock_predict, active_workspace):
    """BLE telemetry RSSI entry without 'mac' falls back to node-name-based BLE_* ID (not MAC-based)."""
    mock_client = AsyncMock()
    mock_predict.return_value = None
    payload = {
        "device_id": "WCHAIR_NO_MAC",
        "device_type": "wheelchair",
        "hardware_type": "wheelchair",
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "rssi": [
            {"node": "WSN_001", "rssi": -70},
        ],
    }

    async with _SessionFactory() as session:
        session.add(Device(
            device_id="WCHAIR_NO_MAC",
            workspace_id=active_workspace.id,
            device_type="wheelchair",
            hardware_type="wheelchair",
        ))
        await session.commit()

    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        from sqlalchemy import select
        # Without mac, the fallback uses the node name, not a MAC-based ID
        ble = (
            await session.execute(select(Device).where(Device.device_id == "BLE_WSN001"))
        ).scalar_one_or_none()
        assert ble is not None, "Node-name fallback should create BLE_WSN001"
        assert ble.config.get("ble_mac") == ""


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy")
async def test_ble_telemetry_with_valid_mac_auto_registers(mock_predict, active_workspace):
    """BLE telemetry with valid mac auto-registers a BLE_* node."""
    mock_client = AsyncMock()
    mock_predict.return_value = None
    payload = {
        "device_id": "WCHAIR_VALID_MAC",
        "device_type": "wheelchair",
        "hardware_type": "wheelchair",
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "rssi": [
            {"node": "WSN_002", "rssi": -65, "mac": "aa:bb:cc:dd:ee:ff"},
        ],
    }

    async with _SessionFactory() as session:
        session.add(Device(
            device_id="WCHAIR_VALID_MAC",
            workspace_id=active_workspace.id,
            device_type="wheelchair",
            hardware_type="wheelchair",
        ))
        await session.commit()

    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        from sqlalchemy import select
        ble = (
            await session.execute(select(Device).where(Device.device_id == "BLE_AABBCCDDEEFF"))
        ).scalar_one_or_none()
        assert ble is not None
        assert ble.workspace_id == active_workspace.id


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_camera_registration_with_invalid_ble_mac_format_does_not_crash(active_workspace):
    """Camera registration with malformed ble_mac should not crash or merge incorrectly."""
    async with _SessionFactory() as session:
        session.add(Device(
            device_id="BLE_AABBCCDDEEFF",
            workspace_id=active_workspace.id,
            device_type="camera",
            hardware_type="node",
            display_name="WSN_003",
            config={"ble_mac": "aa:bb:cc:dd:ee:ff", "ble_node_id": "WSN_003"},
        ))
        await session.commit()

    payload = {
        "device_id": "CAM_BAD_MAC",
        "node_id": "WSN_003",
        "ip_address": "10.0.0.2",
        "firmware": "3.0.0",
        "ble_mac": "not-a-mac-address",
    }
    await _handle_camera_registration(json.dumps(payload).encode())
    # Test passes if no exception is raised


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy")
async def test_canonical_cam_suppresses_new_ble_stub_for_same_mac(mock_predict, active_workspace):
    """When a CAM_* row already has ble_mac, a new BLE_* stub for the same MAC is suppressed."""
    mock_client = AsyncMock()
    mock_predict.return_value = None
    async with _SessionFactory() as session:
        session.add(Device(
            device_id="CAM_EXISTING",
            workspace_id=active_workspace.id,
            device_type="camera",
            hardware_type="node",
            config={"ble_mac": "11:22:33:44:55:66"},
        ))
        await session.commit()

    payload = {
        "device_id": "WCHAIR_SUPPRESS",
        "device_type": "wheelchair",
        "hardware_type": "wheelchair",
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "rssi": [
            {"node": "WSN_004", "rssi": -60, "mac": "11:22:33:44:55:66"},
        ],
    }

    async with _SessionFactory() as session:
        session.add(Device(
            device_id="WCHAIR_SUPPRESS",
            workspace_id=active_workspace.id,
            device_type="wheelchair",
            hardware_type="wheelchair",
        ))
        await session.commit()

    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        from sqlalchemy import select
        ble = (
            await session.execute(select(Device).where(Device.device_id == "BLE_112233445566"))
        ).scalar_one_or_none()
        assert ble is None, "Canonical CAM should suppress new BLE stub for same MAC"


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy")
async def test_ble_telemetry_empty_rssi_array_does_not_crash(mock_predict, active_workspace):
    """An empty rssi[] array should be handled gracefully."""
    mock_client = AsyncMock()
    mock_predict.return_value = None
    payload = {
        "device_id": "WCHAIR_EMPTY_RSSI",
        "device_type": "wheelchair",
        "hardware_type": "wheelchair",
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "rssi": [],
    }

    async with _SessionFactory() as session:
        session.add(Device(
            device_id="WCHAIR_EMPTY_RSSI",
            workspace_id=active_workspace.id,
            device_type="wheelchair",
            hardware_type="wheelchair",
        ))
        await session.commit()

    await _handle_telemetry(json.dumps(payload).encode(), mock_client)
    # No assertion needed - just verify it doesn't raise


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_camera_registration_without_ble_mac_creates_cam_only(active_workspace):
    """Camera registration without ble_mac should create CAM_* without BLE merge."""
    payload = {
        "device_id": "CAM_NO_BLE",
        "node_id": "WSN_005",
        "ip_address": "10.0.0.3",
        "firmware": "3.0.0",
    }
    await _handle_camera_registration(json.dumps(payload).encode())

    async with _SessionFactory() as session:
        from sqlalchemy import select
        cam = (
            await session.execute(select(Device).where(Device.device_id == "CAM_NO_BLE"))
        ).scalar_one_or_none()
        assert cam is not None
        assert cam.device_type == "camera"
        ble = (
            await session.execute(select(Device).where(Device.device_id.like("BLE_%")))
        ).scalars().all()
        assert len(ble) == 0


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
@patch("app.mqtt_handler.predict_room_with_strategy")
async def test_ble_telemetry_duplicate_mac_does_not_create_duplicate_stub(mock_predict, active_workspace):
    """Sending the same BLE MAC twice should not create duplicate BLE_* devices."""
    mock_client = AsyncMock()
    mock_predict.return_value = None
    async with _SessionFactory() as session:
        session.add(Device(
            device_id="WCHAIR_DUP",
            workspace_id=active_workspace.id,
            device_type="wheelchair",
            hardware_type="wheelchair",
        ))
        await session.commit()

    payload = {
        "device_id": "WCHAIR_DUP",
        "device_type": "wheelchair",
        "hardware_type": "wheelchair",
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "rssi": [
            {"node": "WSN_006", "rssi": -55, "mac": "ff:ee:dd:cc:bb:aa"},
        ],
    }

    await _handle_telemetry(json.dumps(payload).encode(), mock_client)
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)

    async with _SessionFactory() as session:
        from sqlalchemy import select
        ble = (
            await session.execute(select(Device).where(Device.device_id == "BLE_FFEEDDCCBBAA"))
        ).scalars().all()
        assert len(ble) == 1, "Duplicate MAC should not create duplicate BLE stub"


# --- Phase 4/5: Two-way audio chunk tests -------------------------------------

from app.mqtt_handler import _handle_audio_chunk


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_audio_chunk_single_chunk_assembles_and_persists(active_workspace, tmp_path):
    """A single-chunk mic audio clip should be assembled and persisted immediately."""
    import base64

    device_id = "WHEEL_AUDIO_1"
    async with _SessionFactory() as session:
        session.add(Device(
            device_id=device_id,
            workspace_id=active_workspace.id,
            device_type="wheelchair",
            hardware_type="wheelchair",
        ))
        await session.commit()

    clip_id = "clip-single-1"
    pcm_data = b"\x00\x01\x02\x03\x04\x05\x06\x07fake-pcm"
    payload = {
        "clip_id": clip_id,
        "device_id": device_id,
        "chunk_index": 0,
        "total_chunks": 1,
        "data": base64.b64encode(pcm_data).decode(),
        "sample_rate": 16000,
        "channels": 1,
        "session_id": "session-audio-1",
    }

    await _handle_audio_chunk(json.dumps(payload).encode(), save_dir=str(tmp_path))

    saved = list(tmp_path.glob("*.pcm"))
    assert len(saved) == 1, f"Expected 1 saved .pcm file, got {saved}"
    assert saved[0].read_bytes() == pcm_data

    from app.models.telemetry import AudioRecord
    from sqlalchemy import select
    async with _SessionFactory() as session:
        rec = (
            await session.execute(select(AudioRecord).where(AudioRecord.clip_id == clip_id))
        ).scalar_one_or_none()
        assert rec is not None, "AudioRecord should be persisted"
        assert rec.direction == "mic"
        assert rec.session_id == "session-audio-1"
        assert rec.sample_rate == 16000
        assert rec.channels == 1
        assert rec.file_size == len(pcm_data)


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_audio_chunk_multi_chunk_assembles_in_order(active_workspace, tmp_path):
    """Multi-chunk mic audio should assemble chunks in index order and persist."""
    import base64

    device_id = "WHEEL_AUDIO_2"
    async with _SessionFactory() as session:
        session.add(Device(
            device_id=device_id,
            workspace_id=active_workspace.id,
            device_type="wheelchair",
            hardware_type="wheelchair",
        ))
        await session.commit()

    clip_id = "clip-multi-1"
    chunks = [b"PCM0-", b"PCM1-", b"PCM2"]
    for i, chunk in enumerate(chunks):
        payload = {
            "clip_id": clip_id,
            "device_id": device_id,
            "chunk_index": i,
            "total_chunks": len(chunks),
            "data": base64.b64encode(chunk).decode(),
            "sample_rate": 16000,
            "channels": 1,
            "session_id": "session-audio-2",
        }
        await _handle_audio_chunk(json.dumps(payload).encode(), save_dir=str(tmp_path))

    saved = list(tmp_path.glob("*.pcm"))
    assert len(saved) == 1, f"Expected 1 assembled file, got {saved}"
    assert saved[0].read_bytes() == b"PCM0-PCM1-PCM2"


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_audio_chunk_out_of_order_assembles_correctly(active_workspace, tmp_path):
    """Out-of-order audio chunks should still assemble in index order."""
    import base64

    device_id = "WHEEL_AUDIO_3"
    async with _SessionFactory() as session:
        session.add(Device(
            device_id=device_id,
            workspace_id=active_workspace.id,
            device_type="wheelchair",
            hardware_type="wheelchair",
        ))
        await session.commit()

    clip_id = "clip-out-of-order-1"
    chunks = [b"AAA-", b"BBB-", b"CCC"]
    order = [2, 0, 1]
    for i in order:
        payload = {
            "clip_id": clip_id,
            "device_id": device_id,
            "chunk_index": i,
            "total_chunks": len(chunks),
            "data": base64.b64encode(chunks[i]).decode(),
            "sample_rate": 16000,
            "channels": 1,
            "session_id": "session-audio-3",
        }
        await _handle_audio_chunk(json.dumps(payload).encode(), save_dir=str(tmp_path))

    saved = list(tmp_path.glob("*.pcm"))
    assert len(saved) == 1
    assert saved[0].read_bytes() == b"AAA-BBB-CCC"


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_audio_chunk_partial_does_not_persist(tmp_path):
    """Partial audio chunks (not all received) should not persist a file or DB row."""
    import base64

    clip_id = "clip-partial-1"
    payload = {
        "clip_id": clip_id,
        "device_id": "WHEEL_AUDIO_PARTIAL",
        "chunk_index": 0,
        "total_chunks": 3,
        "data": base64.b64encode(b"only-one-chunk").decode(),
        "sample_rate": 16000,
        "channels": 1,
        "session_id": "session-partial",
    }

    await _handle_audio_chunk(json.dumps(payload).encode(), save_dir=str(tmp_path))

    saved = list(tmp_path.glob("*.pcm"))
    assert len(saved) == 0, "Partial audio should not persist a file"

    from app.models.telemetry import AudioRecord
    from sqlalchemy import select
    async with _SessionFactory() as session:
        rec = (
            await session.execute(select(AudioRecord).where(AudioRecord.clip_id == clip_id))
        ).scalar_one_or_none()
        assert rec is None, "Partial audio should not create an AudioRecord"


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_audio_chunk_unregistered_device_discarded(tmp_path):
    """Audio from an unregistered device should be discarded (no DB row, no file)."""
    import base64

    clip_id = "clip-unregistered-1"
    payload = {
        "clip_id": clip_id,
        "device_id": "GHOST_DEVICE_AUDIO",
        "chunk_index": 0,
        "total_chunks": 1,
        "data": base64.b64encode(b"ghost-pcm").decode(),
        "sample_rate": 16000,
        "channels": 1,
        "session_id": "session-ghost",
    }

    await _handle_audio_chunk(json.dumps(payload).encode(), save_dir=str(tmp_path))

    from app.models.telemetry import AudioRecord
    from sqlalchemy import select
    async with _SessionFactory() as session:
        rec = (
            await session.execute(select(AudioRecord).where(AudioRecord.clip_id == clip_id))
        ).scalar_one_or_none()
        assert rec is None, "Unregistered device audio should be discarded"


@pytest.mark.asyncio
@patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory)
async def test_audio_chunk_stereo_persists_channels_and_sample_rate(active_workspace, tmp_path):
    """Stereo audio with non-default sample rate should persist metadata correctly."""
    import base64

    device_id = "WHEEL_AUDIO_STEREO"
    async with _SessionFactory() as session:
        session.add(Device(
            device_id=device_id,
            workspace_id=active_workspace.id,
            device_type="wheelchair",
            hardware_type="wheelchair",
        ))
        await session.commit()

    clip_id = "clip-stereo-1"
    pcm_data = b"\x00\x01\x02\x03\x04stereo-pcm"
    payload = {
        "clip_id": clip_id,
        "device_id": device_id,
        "chunk_index": 0,
        "total_chunks": 1,
        "data": base64.b64encode(pcm_data).decode(),
        "sample_rate": 48000,
        "channels": 2,
        "session_id": "session-stereo",
    }

    await _handle_audio_chunk(json.dumps(payload).encode(), save_dir=str(tmp_path))

    from app.models.telemetry import AudioRecord
    from sqlalchemy import select
    async with _SessionFactory() as session:
        rec = (
            await session.execute(select(AudioRecord).where(AudioRecord.clip_id == clip_id))
        ).scalar_one_or_none()
        assert rec is not None
        assert rec.sample_rate == 48000
        assert rec.channels == 2
        assert rec.duration_s is not None and rec.duration_s > 0


@pytest.mark.asyncio
async def test_publish_speaker_audio_calls_mqtt_publish():
    """publish_speaker_audio should publish to WheelSense/audio/{device_id}/speaker."""
    import base64
    from unittest.mock import AsyncMock, patch
    from app.services.mqtt_publish import publish_speaker_audio

    pcm = b"\x00\x01\x02\x03\x04speaker-pcm"
    with patch("app.services.mqtt_publish.mqtt_publish_json", new=AsyncMock()) as mock_pub:
        await publish_speaker_audio(
            "WHEEL_SPK_1",
            "clip-spk-1",
            pcm,
            sample_rate=16000,
            channels=1,
            session_id="session-spk",
        )
        mock_pub.assert_awaited_once()
        topic, payload = mock_pub.call_args.args
        assert topic == "WheelSense/audio/WHEEL_SPK_1/speaker"
        assert payload["clip_id"] == "clip-spk-1"
        assert payload["sample_rate"] == 16000
        assert payload["channels"] == 1
        assert payload["session_id"] == "session-spk"
        assert base64.b64decode(payload["data"]) == pcm
