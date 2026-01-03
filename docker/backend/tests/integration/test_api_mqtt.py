"""
Integration tests for API → MQTT publish.
"""

import pytest
import json
from datetime import datetime


@pytest.mark.integration
@pytest.mark.asyncio
async def test_appliance_control_publishes_to_mqtt(mqtt_handler, mock_mqtt_client):
    """Test that appliance control publishes to MQTT."""
    # Send control command
    success = await mqtt_handler.send_control_command(
        room="kitchen",
        appliance="light",
        state=True
    )
    
    assert success
    
    # Verify MQTT publish
    assert len(mock_mqtt_client.published_messages) > 0
    
    # Find the control message
    control_messages = mock_mqtt_client.get_messages_for_topic("WheelSense/kitchen/control")
    assert len(control_messages) > 0
    
    payload = control_messages[0]["payload"]
    assert payload.get("type") == "control"
    assert payload.get("room") == "kitchen"
    assert payload.get("appliance") == "light"
    assert payload.get("state") is True


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mqtt_message_format_correct(mqtt_handler, mock_mqtt_client):
    """Test that MQTT message format is correct."""
    await mqtt_handler.send_control_command(
        room="bedroom",
        appliance="fan",
        state=False,
        value=3
    )
    
    control_messages = mock_mqtt_client.get_messages_for_topic("WheelSense/bedroom/control")
    assert len(control_messages) > 0
    
    payload = control_messages[0]["payload"]
    
    # Verify required fields
    assert "type" in payload
    assert "room" in payload
    assert "appliance" in payload
    assert "state" in payload
    assert "timestamp" in payload
    assert "value" in payload  # Optional but included when provided

