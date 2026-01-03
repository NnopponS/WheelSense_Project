"""
Smoke tests for service connectivity (MQTT, WebSocket, etc.).
"""

import pytest
from tests.helpers.mqtt_mock import MockMQTTClient


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_mqtt_handler_initialization(mqtt_handler):
    """Test that MQTT handler can be initialized."""
    assert mqtt_handler is not None
    assert mqtt_handler.is_connected


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_mqtt_publish_capture(mock_mqtt_client):
    """Test that MQTT publish is captured by mock."""
    result = mock_mqtt_client.publish("test/topic", '{"test": "data"}')
    assert result.rc == 0
    assert len(mock_mqtt_client.published_messages) == 1
    assert mock_mqtt_client.published_messages[0]["topic"] == "test/topic"


@pytest.mark.smoke
def test_websocket_client_initialization():
    """Test that WebSocket test client can be initialized."""
    from tests.helpers.websocket_client import WebSocketTestClient
    
    client = WebSocketTestClient("ws://localhost:8000/ws")
    assert client.url == "ws://localhost:8000/ws"
    assert not client.connected
    assert len(client.messages) == 0

