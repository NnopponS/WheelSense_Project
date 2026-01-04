# Notification System to Chat Interface Test

## Overview

This test suite verifies that the docker notification system can successfully send messages to the chat interface via WebSocket.

## Test File

`test_notification_to_chat.py` - Integration tests for notification delivery

## Test Coverage

### 1. Schedule Notification Test
- **Test**: `test_schedule_notification_sent_to_chat`
- **Purpose**: Verifies schedule notifications are sent when schedule time matches current time
- **Flow**:
  1. Creates a schedule item for current time
  2. NotificationService checks schedule and triggers notification
  3. Notification is sent via WebSocket with correct format
  4. Verifies message structure matches frontend expectations

### 2. Room Change Notification Test
- **Test**: `test_room_change_notification_sent_to_chat`
- **Purpose**: Verifies room change alerts are sent when user moves to a new room with devices ON in previous room
- **Flow**:
  1. Sets initial location and turns on devices
  2. Changes user location
  3. NotificationService detects room change and sends alert
  4. Verifies notification format includes device list

### 3. Custom Notification Test
- **Test**: `test_custom_notification_sent_to_chat`
- **Purpose**: Verifies custom notifications can be sent programmatically
- **Flow**:
  1. Calls `send_custom_notification()` method
  2. Verifies notification is broadcast via WebSocket
  3. Checks message format

### 4. Format Validation Test
- **Test**: `test_notification_format_matches_frontend_expectations`
- **Purpose**: Ensures notification format exactly matches what frontend expects
- **Validates**:
  - WebSocket message has `type: "notification"`
  - Message has `data` field with notification payload
  - Notification data has required fields: `type`, `message`, `auto_popup`, `timestamp`
  - All field types are correct

### 5. Graceful Degradation Test
- **Test**: `test_notification_without_ws_manager_handles_gracefully`
- **Purpose**: Ensures system doesn't crash if WebSocket manager is unavailable
- **Validates**: Service handles missing ws_manager without exceptions

## Message Format

### WebSocket Message Structure
```json
{
  "type": "notification",
  "data": {
    "type": "schedule_notification" | "room_change_alert" | "custom",
    "message": "Notification message text",
    "auto_popup": true,
    "show_in_bell_icon": true,
    "timestamp": "2024-01-01T12:00:00.000000",
    // Additional fields based on notification type:
    // Schedule: "activity", "time", "item_id"
    // Room change: "devices", "previous_room", "current_room", "requires_confirmation"
  }
}
```

### Frontend Reception (AppContext.jsx:725)
```javascript
if (message.type === 'notification') {
    const notificationData = message.data || message;
    setPendingNotification(notificationData);
    // Adds to bell icon notifications
    // AIChatPopup receives via pendingNotification prop
}
```

### Chat Interface Display (AIChatPopup.jsx:72-102)
```javascript
useEffect(() => {
    if (pendingNotification) {
        if (pendingNotification.auto_popup) {
            setIsOpen(true);
        }
        const notificationMessage = {
            id: Date.now(),
            role: 'assistant',
            content: pendingNotification.message || '🔔 Notification',
            isNotification: true,
            notificationData: pendingNotification
        };
        addChatMessage(notificationMessage);
    }
}, [pendingNotification]);
```

## Running the Tests

### Option 1: Using Docker (Recommended)
```bash
cd docker
docker-compose -f docker-compose.test.yml up --build
```

### Option 2: Local Python Environment
```bash
cd docker/backend
pip install pytest pytest-asyncio
pytest tests/integration/test_notification_to_chat.py -v
```

### Option 3: Run Specific Test
```bash
pytest tests/integration/test_notification_to_chat.py::test_schedule_notification_sent_to_chat -v
```

## Expected Results

All tests should pass, verifying:
- ✅ Notifications are sent via WebSocket
- ✅ Message format matches frontend expectations
- ✅ All notification types work correctly
- ✅ System handles missing WebSocket gracefully

## Architecture Flow

```
NotificationService
    ↓
_send_notification()
    ↓
ws_manager.broadcast({
    "type": "notification",
    "data": { ... }
})
    ↓
WebSocket → Frontend (AppContext.jsx)
    ↓
setPendingNotification()
    ↓
AIChatPopup receives via prop
    ↓
addChatMessage() → Chat History
    ↓
Displayed in Chat Interface
```

## Key Components

1. **NotificationService** (`services/notification_service.py`)
   - Background service that checks for notifications
   - Sends notifications via `ws_manager.broadcast()`

2. **MockWebSocketManager** (test file)
   - Captures broadcast messages for verification
   - Implements `broadcast()` method expected by NotificationService

3. **Frontend Components**
   - `AppContext.jsx`: Receives WebSocket messages, sets `pendingNotification`
   - `AIChatPopup.jsx`: Displays notifications in chat interface

## Notes

- Tests use mock WebSocket manager to avoid requiring actual WebSocket connections
- Notification format must match exactly what frontend expects
- `auto_popup: true` triggers chat popup to open automatically
- `show_in_bell_icon: true` adds notification to bell icon list
- Timestamp is automatically added by `_send_notification()`

