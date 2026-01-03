"""
Integration tests for WebSocket broadcast functionality.
"""

import pytest
import json
from datetime import datetime


@pytest.mark.integration
@pytest.mark.asyncio
async def test_websocket_broadcast_appliance_update(mqtt_handler):
    """Test that appliance updates are broadcast via WebSocket."""
    # Create a mock WebSocket connection
    class MockWebSocket:
        def __init__(self):
            self.messages = []
        
        async def send_text(self, text: str):
            self.messages.append(json.loads(text))
    
    mock_ws = MockWebSocket()
    mqtt_handler.add_websocket(mock_ws)
    
    # Broadcast appliance update
    await mqtt_handler._broadcast_ws({
        "type": "appliance_update",
        "room": "kitchen",
        "appliance": "light",
        "state": True,
        "timestamp": datetime.now().isoformat()
    })
    
    # Verify message was sent
    assert len(mock_ws.messages) > 0
    message = mock_ws.messages[0]
    assert message.get("type") == "appliance_update"
    assert message.get("room") == "kitchen"
    assert message.get("appliance") == "light"
    assert message.get("state") is True


@pytest.mark.integration
@pytest.mark.asyncio
async def test_websocket_broadcast_user_info_update(mqtt_handler):
    """Test that user info updates are broadcast via WebSocket."""
    class MockWebSocket:
        def __init__(self):
            self.messages = []
        
        async def send_text(self, text: str):
            self.messages.append(json.loads(text))
    
    mock_ws = MockWebSocket()
    mqtt_handler.add_websocket(mock_ws)
    
    # Broadcast user info update
    await mqtt_handler._broadcast_ws({
        "type": "user_info_update",
        "data": {
            "name_english": "Test User",
            "condition": "diabetes",
            "current_location": "kitchen"
        },
        "timestamp": datetime.now().isoformat()
    })
    
    # Verify message was sent
    assert len(mock_ws.messages) > 0
    message = mock_ws.messages[0]
    assert message.get("type") == "user_info_update"
    assert message.get("data", {}).get("name_english") == "Test User"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_websocket_broadcast_schedule_notification(mqtt_handler):
    """Test that schedule notifications are broadcast via WebSocket."""
    class MockWebSocket:
        def __init__(self):
            self.messages = []
        
        async def send_text(self, text: str):
            self.messages.append(json.loads(text))
    
    mock_ws = MockWebSocket()
    mqtt_handler.add_websocket(mock_ws)
    
    # Broadcast schedule notification
    await mqtt_handler._broadcast_ws({
        "type": "schedule_notification",
        "time": "08:00",
        "activity": "Breakfast",
        "message": "It's time to: Breakfast",
        "timestamp": datetime.now().isoformat()
    })
    
    # Verify message was sent
    assert len(mock_ws.messages) > 0
    message = mock_ws.messages[0]
    assert message.get("type") == "schedule_notification"
    assert message.get("activity") == "Breakfast"

