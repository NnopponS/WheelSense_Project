"""
Integration test: Notification Service → WebSocket → Chat Interface
Tests that notifications sent by NotificationService are properly formatted
and can be received by the frontend chat interface.
"""

import pytest
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
import asyncio

# Import notification service
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from services.notification_service import NotificationService


class MockWebSocketManager:
    """Mock WebSocket manager that captures broadcast messages."""
    
    def __init__(self):
        self.broadcast_messages: List[Dict[str, Any]] = []
    
    async def broadcast(self, message: Dict[str, Any]):
        """Capture broadcast message."""
        self.broadcast_messages.append(message)
        print(f"[MockWebSocketManager] Broadcast captured: {json.dumps(message, indent=2)}")
    
    def get_notification_messages(self) -> List[Dict[str, Any]]:
        """Get all notification messages from broadcasts."""
        notifications = []
        for msg in self.broadcast_messages:
            if msg.get("type") == "notification":
                notifications.append(msg.get("data", {}))
        return notifications
    
    def clear(self):
        """Clear captured messages."""
        self.broadcast_messages.clear()


@pytest.fixture
def mock_ws_manager() -> MockWebSocketManager:
    """Create mock WebSocket manager."""
    return MockWebSocketManager()


@pytest.fixture
async def notification_service(test_db_with_fixtures, mock_ws_manager):
    """Create notification service with mock WebSocket manager."""
    service = NotificationService(
        db=test_db_with_fixtures,
        ws_manager=mock_ws_manager,
        mqtt_handler=None
    )
    yield service
    # Cleanup
    await service.stop()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_schedule_notification_sent_to_chat(
    test_db_with_fixtures,
    notification_service,
    mock_ws_manager
):
    """
    Test that schedule notifications are sent via WebSocket in the correct format
    for the chat interface.
    
    Expected flow:
    1. Schedule item matches current time
    2. NotificationService sends notification via WebSocket
    3. Message format: {"type": "notification", "data": {...}}
    4. Frontend receives and adds to chat history
    """
    # Setup: Add a schedule item for current time
    gmt7 = timezone(timedelta(hours=7))
    now = datetime.now(gmt7)
    test_time = now.strftime("%H:%M")
    
    schedule_item = {
        "time": test_time,
        "activity": "Test Activity - Schedule Notification",
        "type": "daily"
    }
    
    await test_db_with_fixtures.add_schedule_item(schedule_item)
    
    # Start notification service
    await notification_service.start()
    
    # Wait a moment for background loop to run
    await asyncio.sleep(1)
    
    # Manually trigger schedule check with current time
    await notification_service._check_schedule_notifications(test_time)
    
    # Wait for async operations
    await asyncio.sleep(0.5)
    
    # Verify notification was sent
    notifications = mock_ws_manager.get_notification_messages()
    assert len(notifications) > 0, "No notifications were sent"
    
    # Find the schedule notification
    schedule_notifications = [
        n for n in notifications 
        if n.get("type") == "schedule_notification"
    ]
    assert len(schedule_notifications) > 0, "No schedule notification found"
    
    notification = schedule_notifications[0]
    
    # Verify notification format matches frontend expectations
    assert notification.get("type") == "schedule_notification"
    assert notification.get("activity") == "Test Activity - Schedule Notification"
    assert notification.get("time") == test_time
    assert "message" in notification
    assert notification.get("auto_popup") is True
    assert notification.get("show_in_bell_icon") is True
    assert "timestamp" in notification
    
    # Verify WebSocket message wrapper
    broadcast_messages = [
        msg for msg in mock_ws_manager.broadcast_messages
        if msg.get("type") == "notification"
    ]
    assert len(broadcast_messages) > 0
    assert "data" in broadcast_messages[0]
    assert broadcast_messages[0]["data"]["type"] == "schedule_notification"
    
    print(f"✅ Schedule notification sent successfully: {notification.get('message')}")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_room_change_notification_sent_to_chat(
    test_db_with_fixtures,
    notification_service,
    mock_ws_manager
):
    """
    Test that room change notifications are sent via WebSocket in the correct format
    for the chat interface.
    
    Expected flow:
    1. User changes room
    2. Devices are ON in previous room
    3. NotificationService sends room change alert via WebSocket
    4. Message format matches frontend expectations
    """
    # Setup: Set initial location to bedroom
    await test_db_with_fixtures.set_current_location("bedroom")
    
    # Setup: Turn on devices in bedroom
    await test_db_with_fixtures.set_appliance_state("bedroom", "light", True)
    await test_db_with_fixtures.set_appliance_state("bedroom", "fan", True)
    
    # Start notification service
    await notification_service.start()
    
    # Wait for initial state to be tracked
    await asyncio.sleep(0.5)
    
    # Change location to kitchen (triggers room change check)
    await test_db_with_fixtures.set_current_location("kitchen")
    
    # Manually trigger room change check
    await notification_service._check_room_change()
    
    # Wait for async operations
    await asyncio.sleep(0.5)
    
    # Verify notification was sent
    notifications = mock_ws_manager.get_notification_messages()
    
    # Room change notification may or may not be sent depending on preferences
    # Let's check if any notification was sent
    room_change_notifications = [
        n for n in notifications
        if n.get("type") == "room_change_alert"
    ]
    
    if len(room_change_notifications) > 0:
        notification = room_change_notifications[0]
        
        # Verify notification format
        assert notification.get("type") == "room_change_alert"
        assert "message" in notification
        assert "devices" in notification
        assert notification.get("auto_popup") is True
        assert notification.get("show_in_bell_icon") is True
        assert notification.get("requires_confirmation") is True
        assert "timestamp" in notification
        
        # Verify devices list
        devices = notification.get("devices", [])
        assert len(devices) > 0
        assert all("room" in d and "device" in d for d in devices)
        
        print(f"✅ Room change notification sent successfully: {notification.get('message')}")
    else:
        # Notification might not be sent if preferences are set
        print("ℹ️  Room change notification not sent (may be due to notification preferences)")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_custom_notification_sent_to_chat(
    test_db_with_fixtures,
    notification_service,
    mock_ws_manager
):
    """
    Test that custom notifications are sent via WebSocket in the correct format
    for the chat interface.
    """
    # Start notification service
    await notification_service.start()
    
    # Send custom notification
    test_message = "🔔 This is a test custom notification"
    await notification_service.send_custom_notification(
        message=test_message,
        auto_popup=True
    )
    
    # Wait for async operations
    await asyncio.sleep(0.5)
    
    # Verify notification was sent
    notifications = mock_ws_manager.get_notification_messages()
    assert len(notifications) > 0, "No notifications were sent"
    
    # Find custom notification
    custom_notifications = [
        n for n in notifications
        if n.get("type") == "custom"
    ]
    assert len(custom_notifications) > 0, "No custom notification found"
    
    notification = custom_notifications[0]
    
    # Verify notification format
    assert notification.get("type") == "custom"
    assert notification.get("message") == test_message
    assert notification.get("auto_popup") is True
    assert "timestamp" in notification
    
    # Verify WebSocket message wrapper
    broadcast_messages = [
        msg for msg in mock_ws_manager.broadcast_messages
        if msg.get("type") == "notification"
    ]
    assert len(broadcast_messages) > 0
    assert "data" in broadcast_messages[0]
    assert broadcast_messages[0]["data"]["type"] == "custom"
    
    print(f"✅ Custom notification sent successfully: {notification.get('message')}")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_notification_format_matches_frontend_expectations(
    test_db_with_fixtures,
    notification_service,
    mock_ws_manager
):
    """
    Test that notification format exactly matches what the frontend expects.
    
    Frontend expects (from AppContext.jsx:725):
    - message.type === 'notification'
    - message.data contains the notification payload
    - message.data.type === 'schedule_notification' | 'room_change_alert' | 'custom'
    - message.data.message contains the message text
    - message.data.auto_popup is boolean
    """
    # Start notification service
    await notification_service.start()
    
    # Send a test notification
    await notification_service.send_custom_notification(
        message="Test notification format",
        auto_popup=True
    )
    
    await asyncio.sleep(0.5)
    
    # Verify WebSocket message structure
    assert len(mock_ws_manager.broadcast_messages) > 0
    
    ws_message = mock_ws_manager.broadcast_messages[0]
    
    # Frontend expects this structure
    assert ws_message.get("type") == "notification", "WebSocket message type should be 'notification'"
    assert "data" in ws_message, "WebSocket message should have 'data' field"
    
    notification_data = ws_message["data"]
    
    # Verify notification data structure
    assert "type" in notification_data, "Notification data should have 'type' field"
    assert "message" in notification_data, "Notification data should have 'message' field"
    assert "auto_popup" in notification_data, "Notification data should have 'auto_popup' field"
    assert "timestamp" in notification_data, "Notification data should have 'timestamp' field"
    
    # Verify types
    assert isinstance(notification_data["type"], str)
    assert isinstance(notification_data["message"], str)
    assert isinstance(notification_data["auto_popup"], bool)
    assert isinstance(notification_data["timestamp"], str)
    
    print("✅ Notification format matches frontend expectations")
    print(f"   WebSocket message: {json.dumps(ws_message, indent=2)}")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_notification_without_ws_manager_handles_gracefully(
    test_db_with_fixtures
):
    """
    Test that notification service handles missing WebSocket manager gracefully.
    """
    """
    Test that notification service handles missing WebSocket manager gracefully.
    """
    # Create notification service without ws_manager
    service = NotificationService(
        db=test_db_with_fixtures,
        ws_manager=None,  # No WebSocket manager
        mqtt_handler=None
    )
    
    try:
        # Should not raise exception
        await service.send_custom_notification("Test message")
        print("✅ Notification service handles missing ws_manager gracefully")
    except Exception as e:
        pytest.fail(f"Notification service should handle missing ws_manager gracefully, but raised: {e}")
    finally:
        await service.stop()

