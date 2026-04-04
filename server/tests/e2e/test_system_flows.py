import json
from datetime import datetime, UTC
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

async def test_full_e2e_fall_detection_flow(db_session, admin_token, client: AsyncClient):
    """
    Test E2E Flow:
    1. Create workspace
    2. Register a device & room
    3. Simulate MQTT payload with fall characteristics
    4. Verify Alert is created on backend
    """
    # 1. Create Workspace
    resp = await client.post(
        "/api/workspaces",
        json={"name": "E2E Test Workspace", "mode": "simulation"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200

    ws_id = resp.json()["id"]
    resp = await client.post(
        f"/api/workspaces/{ws_id}/activate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    # 2. Add device
    resp = await client.post(
        "/api/devices",
        json={"device_id": "TEST_WHEEL_01", "device_type": "wheelchair"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    
    # Simulate an MQTT telemetry processing locally by hitting the handler directly
    from app.mqtt_handler import _handle_telemetry
    import aiomqtt
    import contextlib

    fake_mqtt_client = AsyncMock(spec=aiomqtt.Client)

    @contextlib.asynccontextmanager
    async def mock_session_maker():
        yield db_session

    payload = {
        "device_id": "TEST_WHEEL_01",
        "timestamp": datetime.now(UTC).isoformat(),
        "imu": {
            "ax": 0.0, "ay": 0.0, "az": 3.5,  # Exceeds 3.0g
            "gx": 0.0, "gy": 0.0, "gz": 0.0
        },
        "motion": {
            "distance_m": 0.0,
            "velocity_ms": 0.01,  # Near zero
            "accel_ms2": 0.0,
            "state": "idle"
        },
        "battery": {"percentage": 100, "voltage_v": 4.1}
    }

    # Process it
    with patch("app.mqtt_handler.AsyncSessionLocal", new=mock_session_maker):
        await _handle_telemetry(json.dumps(payload).encode(), fake_mqtt_client)

    # Assert DB has recorded Alert limit 1
    resp = await client.get("/api/alerts?limit=10", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    alerts = resp.json()
    assert isinstance(alerts, list)
    assert len(alerts) > 0
    assert alerts[0]["alert_type"] == "fall"
    assert "Fall Detected" in alerts[0]["title"]

    # Also verify telemetry tracking is working
    resp = await client.get("/api/telemetry/imu?device_id=TEST_WHEEL_01&limit=10", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    telemetry = resp.json()
    assert len(telemetry) > 0
    assert telemetry[0]["imu"]["az"] == 3.5
