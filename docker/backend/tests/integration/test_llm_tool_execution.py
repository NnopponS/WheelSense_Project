"""
Integration tests for LLM → Tool execution → MQTT/DB.
"""

import pytest
from tests.helpers.test_data_builder import TestDataBuilder


@pytest.mark.integration
@pytest.mark.asyncio
async def test_tool_registry_executes_device_control(test_db, mqtt_handler, tool_registry, mock_mqtt_client):
    """Test that tool registry executes device control tool."""
    # Execute device control tool
    result = await tool_registry.call_tool(
        "e_device_control",
        {
            "room": "Bedroom",
            "device": "Light",
            "action": "ON"
        }
    )
    
    # Verify tool execution
    assert result.get("success") is True
    
    # Verify MQTT publish
    control_messages = mock_mqtt_client.get_messages_for_topic("WheelSense/bedroom/control")
    assert len(control_messages) > 0
    
    payload = control_messages[0]["payload"]
    assert payload.get("appliance") == "Light"
    assert payload.get("state") is True


@pytest.mark.integration
@pytest.mark.asyncio
async def test_tool_registry_executes_schedule_modifier(test_db, mqtt_handler, tool_registry):
    """Test that tool registry executes schedule modifier tool."""
    # Execute schedule modifier tool
    result = await tool_registry.call_tool(
        "schedule_modifier",
        {
            "modify_type": "add",
            "time": "09:00",
            "activity": "Morning Exercise"
        }
    )
    
    # Verify tool execution
    assert result.get("success") is True
    
    # Verify schedule was added to DB
    schedule_items = await test_db.get_schedule_items()
    found = False
    for item in schedule_items:
        if item.get("time") == "09:00" and item.get("activity") == "Morning Exercise":
            found = True
            break
    
    assert found, "Schedule item not added to database"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_tool_registry_handles_invalid_tool(test_db, mqtt_handler, tool_registry):
    """Test that tool registry handles invalid tool names gracefully."""
    result = await tool_registry.call_tool(
        "invalid_tool_name",
        {}
    )
    
    # Verify error handling
    assert result.get("success") is False
    assert "error" in result
    assert "Unknown tool" in result.get("error", "")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_tool_parser_extracts_tool_calls():
    """Test that tool parser extracts tool calls from LLM response."""
    from services.tool_parser import ToolParser
    from services.tool_registry import ToolRegistry
    
    # Create a minimal tool registry for parser
    class MockDB:
        pass
    
    class MockMQTT:
        pass
    
    registry = ToolRegistry(MockDB(), MockMQTT())
    parser = ToolParser(registry)
    
    # Test valid JSON tool call
    response = '[{"tool": "chat_message", "arguments": {"message": "Hello"}}]'
    tool_calls = parser.parse(response)
    
    assert len(tool_calls) == 1
    assert tool_calls[0].get("tool") == "chat_message"
    assert tool_calls[0].get("arguments", {}).get("message") == "Hello"

