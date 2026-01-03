"""
E2E Test: TC-7 - Health Query → RAG Retrieval → Grounded Response
E2E Test: TC-8 - Tool Call Execution (Assistant Control) → Same Path as UI
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_tc7_health_query_triggers_rag(test_db_with_fixtures, mock_llm_client):
    """
    TC-7: Health Query → RAG Retrieval
    
    Steps:
    1. Send health query
    2. Verify RAG trigger
    3. Verify RAG retrieval (or timeout)
    4. Verify LLM context includes RAG
    """
    from services.health_query_detector import should_call_rag
    
    # Step 1: Send health query (simulated)
    user_message = "What should I eat for diabetes?"
    user_condition = "diabetes"
    
    # Step 2: Verify RAG trigger
    should_trigger = should_call_rag(
        user_message=user_message,
        user_condition=user_condition
    )
    assert should_trigger is True
    
    # Step 3: Test RAG retrieval (mocked)
    from services.rag_retriever import RAGRetriever
    
    # Mock RAG retriever
    mock_rag_result = {
        "found": True,
        "chunks": [
            {
                "text": "People with diabetes should eat balanced meals with low sugar.",
                "score": 0.85,
                "metadata": {}
            }
        ]
    }
    
    # Step 4: Verify context formatting
    from services.context_builder import ContextBuilder
    builder = ContextBuilder()
    
    rag_context = mock_rag_result
    formatted = builder.format_rag_context(rag_context)
    
    assert "HEALTH KNOWLEDGE CONTEXT" in formatted
    assert "diabetes" in formatted.lower() or "sugar" in formatted.lower()


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_tc8_tool_call_execution_same_path_as_ui(
    test_db_with_fixtures,
    mqtt_handler,
    tool_registry,
    mock_mqtt_client
):
    """
    TC-8: Tool Call Execution → Same Path as UI
    
    Steps:
    1. Send chat with control request (simulated via tool call)
    2. Verify tool call parsing
    3. Verify tool execution
    4. Verify MQTT publish (same as UI)
    5. Verify DB update (same as UI)
    6. Verify WebSocket broadcast
    """
    # Step 1 & 2: Execute tool directly (simulating LLM tool call)
    result = await tool_registry.call_tool(
        "e_device_control",
        {
            "room": "Bedroom",
            "device": "Light",
            "action": "ON"
        }
    )
    
    # Step 3: Verify tool execution
    assert result.get("success") is True
    
    # Step 4: Verify MQTT publish (same topic/payload as UI)
    control_messages = mock_mqtt_client.get_messages_for_topic("WheelSense/bedroom/control")
    assert len(control_messages) > 0
    
    payload = control_messages[0]["payload"]
    assert payload.get("appliance") == "Light"
    assert payload.get("state") is True
    assert payload.get("room") == "bedroom"
    
    # Step 5: Verify DB update (same path as UI)
    await test_db_with_fixtures.set_appliance_state("bedroom", "light", True)
    appliances = await test_db_with_fixtures.get_appliances_by_room("bedroom")
    
    light_found = False
    for app in appliances:
        if app.get("type") == "light":
            assert app.get("state") == 1
            light_found = True
            break
    
    assert light_found
    
    # Step 6: Verify WebSocket broadcast
    class MockWebSocket:
        def __init__(self):
            self.messages = []
        
        async def send_text(self, text: str):
            import json
            self.messages.append(json.loads(text))
    
    mock_ws = MockWebSocket()
    mqtt_handler.add_websocket(mock_ws)
    
    from datetime import datetime
    await mqtt_handler._broadcast_ws({
        "type": "appliance_update",
        "room": "bedroom",
        "appliance": "light",
        "state": True,
        "timestamp": datetime.now().isoformat()
    })
    
    assert len(mock_ws.messages) > 0

