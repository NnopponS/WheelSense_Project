# Notification System Comparison

This document compares how the notification systems send messages in:
1. **@docker** (`docker/backend/src/services/notification_service.py`)
2. **@mcp_llm-wheelsense** (`mcp_llm-wheelsense/services/notification.py`)

---

## Overview

### Docker Backend Notification System
- **Location**: `docker/backend/src/services/notification_service.py`
- **Type**: Background service with continuous monitoring
- **Delivery Method**: WebSocket broadcast via `ws_manager.broadcast()`
- **Target**: Frontend dashboard clients

### MCP LLM WheelSense Notification System
- **Location**: `mcp_llm-wheelsense/services/notification.py`
- **Type**: On-demand service triggered by location changes
- **Delivery Method**: MCP tool execution (`chat_message`) + callback to Streamlit session state
- **Target**: Streamlit chat interface

---

## 1. Architecture & Design

### Docker Backend
```python
class NotificationService:
    def __init__(self, db, ws_manager, mqtt_handler=None):
        self.db = db
        self.ws_manager = ws_manager  # WebSocket manager for broadcasting
        self.mqtt_handler = mqtt_handler
        self._running = False
        self._task = None
        self._last_check_minute = None
        self._last_room = None
```

**Key Characteristics:**
- Runs as a **background task** with continuous monitoring
- Executes in a loop every **30 seconds**
- Maintains state (`_last_room`, `_last_check_minute`)
- Directly uses WebSocket manager for broadcasting

### MCP LLM WheelSense
```python
class NotificationService:
    def __init__(self, mcp_server: MCPServer, mcp_router: MCPRouter):
        self.mcp_server = mcp_server
        self.mcp_router = mcp_router
        self._notification_callback: Optional[Callable[[str], None]] = None
```

**Key Characteristics:**
- **On-demand** service (called when needed)
- Uses **MCP tools** (`chat_message`) for message delivery
- Requires a **callback function** to update UI
- No background loop - triggered by location changes

---

## 2. Message Sending Mechanism

### Docker Backend: WebSocket Broadcast

**Flow:**
```
NotificationService._send_notification()
    ↓
ws_manager.broadcast({
    "type": "notification",
    "data": {
        "type": "schedule_notification" | "room_change_alert" | "custom",
        "message": "...",
        "timestamp": "...",
        "auto_popup": True,
        "show_in_bell_icon": True,
        ...
    }
})
    ↓
WebSocket → Frontend (AppContext.jsx)
    ↓
setPendingNotification() → AIChatPopup
```

**Code:**
```python
async def _send_notification(self, notification: Dict[str, Any]):
    """Send notification to frontend via WebSocket."""
    try:
        notification["timestamp"] = datetime.now().isoformat()
        
        if self.ws_manager:
            await self.ws_manager.broadcast({
                "type": "notification",
                "data": notification
            })
            logger.info(f"📤 Notification sent: {notification.get('type')}")
        else:
            logger.warning("WebSocket manager not available for notification")
            
    except Exception as e:
        logger.error(f"Error sending notification: {e}")
```

**WebSocket Manager Implementation:**
- Uses `mqtt_handler._broadcast_ws()` which sends JSON messages to all connected WebSocket clients
- Message format: `{"type": "notification", "data": {...}}`
- Broadcasts to all connected frontend clients simultaneously

### MCP LLM WheelSense: MCP Tool + Callback

**Flow:**
```
NotificationService.run_house_check()
    ↓
mcp_server.detect_potential_issues()
    ↓
mcp_router.execute({
    "tool": "chat_message",
    "arguments": {"message": "..."}
})
    ↓
mcp_server.chat_message(message)
    ↓
Returns: {"success": True, "message": "...", ...}
    ↓
notification_callback(message)  # If success
    ↓
Streamlit session_state.chat_history.append({...})
```

**Code:**
```python
def run_house_check(self) -> Optional[dict]:
    # Detect potential issues
    potential_issues = self.mcp_server.detect_potential_issues()
    
    # Filter based on preferences
    devices_to_notify = [...]
    
    # Generate message
    message = self._build_notification_message(devices_to_notify, current_state)
    
    # Execute notification via chat_message tool
    tool_result = self.mcp_router.execute({
        "tool": "chat_message",
        "arguments": {
            "message": message
        }
    })
    
    # Call callback if successful
    if tool_result.get("success") and self._notification_callback:
        notification_message = tool_result.get("message", "")
        if notification_message:
            self._notification_callback(notification_message)
    
    return {
        "notified": True,
        "message": tool_result.get("message", ""),
        "tool_result": tool_result
    }
```

**Callback Implementation (app.py):**
```python
def notification_callback(message: str):
    """Callback to add notification to chat history."""
    # Add to notification history
    st.session_state.notification_history.append({
        'message': message,
        'timestamp': time.time()
    })
    
    # Create notification entry for chat history
    notification_entry = {
        'role': 'assistant',
        'content': f"🔔 {message}",
        'is_notification': True,
        'activity': st.session_state.current_activity.get('activity') if st.session_state.current_activity else None
    }
    
    # Add to chat history
    st.session_state.chat_history.append(notification_entry)
```

---

## 3. Notification Types

### Docker Backend
1. **Schedule Notifications**
   - Triggered when current time matches schedule time
   - Format: `"⏰ ถึงเวลา: {activity}"`
   - Type: `"schedule_notification"`

2. **Room Change Alerts**
   - Triggered when user moves to a new room with devices ON in previous room
   - Format: `"💡 คุณลืมปิด {device} ห้อง{room} ต้องการให้ปิดไหม?"`
   - Type: `"room_change_alert"`
   - Includes: `devices`, `previous_room`, `current_room`, `requires_confirmation`

3. **Custom Notifications**
   - Programmatically sent via `send_custom_notification()`
   - Type: `"custom"`

### MCP LLM WheelSense
1. **House Check Notifications**
   - Triggered when user location changes
   - Detects devices ON in rooms other than user location
   - Format: `"I noticed the {room} {device} is still ON. Would you like me to turn it off?"`
   - Multiple devices: `"I noticed these devices are still ON: {list}. Would you like me to turn them off?"`

---

## 4. Triggering Mechanisms

### Docker Backend
- **Continuous Monitoring**: Background loop runs every 30 seconds
- **Schedule Check**: Once per minute (when minute changes)
- **Room Change Check**: Every loop iteration (30 seconds)
- **State Tracking**: Maintains `_last_room` and `_last_check_minute`

### MCP LLM WheelSense
- **On-Demand**: Called explicitly when location changes
- **No Background Loop**: Triggered by external events
- **Location-Based**: Only runs when `run_house_check()` is called

---

## 5. Message Format Comparison

### Docker Backend Message Format
```json
{
    "type": "notification",
    "data": {
        "type": "schedule_notification" | "room_change_alert" | "custom",
        "message": "⏰ ถึงเวลา: {activity}",
        "timestamp": "2024-01-01T12:00:00",
        "auto_popup": true,
        "show_in_bell_icon": true,
        "activity": "...",
        "time": "12:00",
        "item_id": "...",
        "devices": [...],
        "previous_room": "...",
        "current_room": "...",
        "requires_confirmation": true
    }
}
```

### MCP LLM WheelSense Message Format
```python
# Tool Result
{
    "success": True,
    "tool": "chat_message",
    "message": "I noticed the Bedroom Light is still ON. Would you like me to turn it off?",
    "error": None
}

# Chat History Entry
{
    'role': 'assistant',
    'content': '🔔 I noticed the Bedroom Light is still ON. Would you like me to turn it off?',
    'is_notification': True,
    'activity': "..."
}
```

---

## 6. Integration Points

### Docker Backend
- **WebSocket Manager**: `ws_manager.broadcast()` (from `mqtt_handler._broadcast_ws()`)
- **Database**: Direct access via `self.db`
- **Frontend**: Receives via WebSocket connection in `AppContext.jsx`
- **MQTT Handler**: Optional, for device control

### MCP LLM WheelSense
- **MCP Router**: Executes `chat_message` tool
- **MCP Server**: Provides `chat_message()` and `detect_potential_issues()`
- **State Manager**: Manages device states and preferences
- **Streamlit**: Updates `session_state.chat_history` via callback

---

## 7. Key Differences Summary

| Aspect | Docker Backend | MCP LLM WheelSense |
|--------|---------------|-------------------|
| **Execution Model** | Background service (continuous) | On-demand (triggered) |
| **Delivery Method** | WebSocket broadcast | MCP tool + callback |
| **Message Target** | Frontend dashboard | Streamlit chat interface |
| **State Management** | Maintains internal state | Uses StateManager |
| **Notification Types** | Schedule, room change, custom | House check only |
| **Language** | Thai messages | English messages |
| **Triggering** | Time-based (30s loop) | Event-based (location change) |
| **Dependencies** | WebSocket manager | MCP router + callback |
| **Error Handling** | Logs errors, continues | Returns result dict |

---

## 8. Advantages & Disadvantages

### Docker Backend
**Advantages:**
- ✅ Real-time delivery via WebSocket
- ✅ Multiple notification types
- ✅ Automatic scheduling
- ✅ Direct frontend integration
- ✅ Supports multiple clients simultaneously

**Disadvantages:**
- ❌ Requires WebSocket connection
- ❌ Background resource usage
- ❌ More complex state management

### MCP LLM WheelSense
**Advantages:**
- ✅ Simple, on-demand execution
- ✅ Integrated with MCP tool system
- ✅ No background resources
- ✅ Flexible callback mechanism

**Disadvantages:**
- ❌ Requires explicit triggering
- ❌ Single notification type
- ❌ Tied to Streamlit session state
- ❌ No automatic scheduling

---

## 9. Code Examples

### Docker Backend: Sending a Notification
```python
# Schedule notification
await notification_service._send_notification({
    "type": "schedule_notification",
    "activity": "Take Medicine",
    "time": "12:00",
    "message": "⏰ ถึงเวลา: Take Medicine",
    "auto_popup": True,
    "show_in_bell_icon": True,
    "item_id": "123"
})

# Custom notification
await notification_service.send_custom_notification(
    "Custom message here",
    auto_popup=True
)
```

### MCP LLM WheelSense: Sending a Notification
```python
# Run house check (triggers notification if needed)
result = notification_service.run_house_check()

# The notification is automatically sent via:
# 1. MCP router executes chat_message tool
# 2. Callback updates Streamlit session state
# 3. Message appears in chat history
```

---

## 10. Recommendations

### For Docker Backend:
- Continue using WebSocket for real-time delivery
- Consider adding more notification types as needed
- Maintain the background service for automatic scheduling

### For MCP LLM WheelSense:
- Consider adding schedule-based notifications
- May want to add WebSocket support for real-time delivery
- Could benefit from a unified notification format

### Potential Unification:
- Both systems could share a common notification format
- Docker backend could also use MCP tools for consistency
- MCP LLM WheelSense could add WebSocket support for real-time updates

