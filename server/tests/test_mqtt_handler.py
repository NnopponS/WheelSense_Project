import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock
import json
from datetime import datetime, UTC

from app.models.core import Device, Workspace
from app.models.core import DeviceCommandDispatch
from app.models.telemetry import IMUTelemetry, MotionTrainingData, RSSIReading, RoomPrediction
from tests.conftest import _get_session_factory

_SessionFactory = _get_session_factory()

# Import handlers
from app.mqtt_handler import (
    _handle_telemetry,
    _handle_device_ack,
    _handle_camera_registration,
    _handle_camera_status,
    mqtt_listener
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
