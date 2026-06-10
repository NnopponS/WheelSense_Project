from unittest.mock import AsyncMock, patch

import pytest

from app.services import mqtt_publish


@pytest.mark.asyncio
async def test_topic_root_publish_sends_canonical_and_lowercase_topics():
    with patch.object(mqtt_publish, "mqtt_publish_json", new=AsyncMock()) as publish:
        await mqtt_publish.mqtt_publish_json_topic_roots(
            "config/MOB_1",
            {"portal_base_url": "http://example.test"},
            retain=True,
        )

    assert [call.args[0] for call in publish.await_args_list] == [
        "WheelSense/config/MOB_1",
        "wheelsense/config/MOB_1",
    ]
    assert all(call.kwargs["retain"] is True for call in publish.await_args_list)


@pytest.mark.asyncio
async def test_alert_publish_uses_both_topic_roots():
    alert = type(
        "AlertStub",
        (),
        {
            "id": 7,
            "alert_type": "fall",
            "severity": "critical",
            "title": "Fall detected",
            "description": "Wheelchair impact detected",
            "patient_id": 42,
            "device_id": "MOB_1",
            "status": "active",
            "timestamp": None,
        },
    )()

    with patch.object(mqtt_publish, "mqtt_publish_json", new=AsyncMock()) as publish:
        await mqtt_publish.publish_alert_to_mqtt(alert)

    assert [call.args[0] for call in publish.await_args_list] == [
        "WheelSense/alerts/42",
        "wheelsense/alerts/42",
    ]
