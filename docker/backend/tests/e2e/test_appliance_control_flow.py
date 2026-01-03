"""
E2E Test: TC-3 - Appliance Toggle from UI → MQTT → Status Update
Feature: UI control → MQTT command → DB update → UI feedback
"""

import pytest
from datetime import datetime


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_tc3_appliance_control_full_flow(
    test_db_with_fixtures,
    mqtt_handler,
    mock_mqtt_client
):
    """
    TC-3: Appliance Control End-to-End
    
    Steps:
    1. UI action: POST /api/appliances/control
    2. Verify MQTT publish
    3. Simulate device response
    4. Verify DB update
    5. Verify WebSocket broadcast
    """
    # Step 1: Send control command (simulated via mqtt_handler)
    room = "kitchen"
    appliance = "light"
    state = True
    
    success = await mqtt_handler.send_control_command(room, appliance, state)
    assert success
    
    # Step 2: Verify MQTT publish
    control_messages = mock_mqtt_client.get_messages_for_topic(f"WheelSense/{room}/control")
    assert len(control_messages) > 0
    
    payload = control_messages[0]["payload"]
    assert payload.get("type") == "control"
    assert payload.get("room") == room
    assert payload.get("appliance") == appliance
    assert payload.get("state") is True
    
    # Step 3: Simulate device response (update DB as if device responded)
    await test_db_with_fixtures.set_appliance_state(room, appliance, state)
    
    # Step 4: Verify DB update
    appliances = await test_db_with_fixtures.get_appliances_by_room(room)
    light_app = None
    for app in appliances:
        if app.get("type") == appliance:
            light_app = app
            break
    
    assert light_app is not None
    assert light_app.get("state") == 1
    assert light_app.get("isOn") == 1
    
    # Step 5: Verify WebSocket broadcast
    class MockWebSocket:
        def __init__(self):
            self.messages = []
        
        async def send_text(self, text: str):
            import json
            self.messages.append(json.loads(text))
    
    mock_ws = MockWebSocket()
    mqtt_handler.add_websocket(mock_ws)
    
    await mqtt_handler._broadcast_ws({
        "type": "appliance_update",
        "room": room,
        "appliance": appliance,
        "state": state,
        "timestamp": datetime.now().isoformat()
    })
    
    assert len(mock_ws.messages) > 0
    appliance_updates = [msg for msg in mock_ws.messages if msg.get("type") == "appliance_update"]
    assert len(appliance_updates) > 0
    assert appliance_updates[0].get("room") == room
    assert appliance_updates[0].get("appliance") == appliance
    assert appliance_updates[0].get("state") is True

