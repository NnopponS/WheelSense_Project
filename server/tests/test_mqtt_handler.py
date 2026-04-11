import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import json
from datetime import datetime, UTC

from app.models.core import Workspace, Device
from app.models.telemetry import IMUTelemetry, MotionTrainingData, RSSIReading, RoomPrediction
from tests.conftest import _get_session_factory

_SessionFactory = _get_session_factory()

# Import handlers
from app.mqtt_handler import (
    _handle_telemetry,
    _handle_camera_registration,
    _handle_camera_status,
    mqtt_listener
)


@pytest.fixture
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
    # Will drop telemetry if device is not registered
    mock_client = AsyncMock()
    payload = {"device_id": "WHEEL_1"}
    await _handle_telemetry(json.dumps(payload).encode(), mock_client)
    
    async with _SessionFactory() as session:
        from sqlalchemy import select
        device = (await session.execute(select(Device))).scalar_one_or_none()
        assert device is None


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
    payload = {"device_id": "CAM_STATUS"}
    # Fails gracefully if not registered
    await _handle_camera_status(json.dumps(payload).encode())

    # Register first
    async with _SessionFactory() as session:
        dev = Device(device_id="CAM_STATUS", workspace_id=active_workspace.id, device_type="camera")
        session.add(dev)
        await session.commit()
        
    await _handle_camera_status(json.dumps(payload).encode())
    async with _SessionFactory() as session:
        from sqlalchemy import select
        device = (await session.execute(select(Device).where(Device.device_id == "CAM_STATUS"))).scalar_one_or_none()
        assert device.last_seen is not None
        assert isinstance(device.config, dict)
        assert "camera_status" in device.config


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
