"""
E2E Test: TC-4 - Schedule Add/Edit/Delete → DB → UI → LLM Context
Feature: Schedule CRUD with UI sync and LLM awareness
"""

import pytest


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_tc4_schedule_add_edit_delete_flow(
    test_db_with_fixtures,
    mqtt_handler
):
    """
    TC-4: Schedule CRUD End-to-End
    
    Steps:
    1. Add schedule item
    2. Verify DB persistence
    3. Verify WebSocket broadcast
    4. Verify UI can retrieve
    5. Verify LLM context includes schedule
    6. Edit schedule item
    7. Delete schedule item
    """
    # Step 1: Add schedule item
    item = {
        "time": "08:00",
        "activity": "Breakfast",
        "location": "kitchen"
    }
    item_id = await test_db_with_fixtures.add_schedule_item(item)
    
    # Step 2: Verify DB persistence
    schedule_items = await test_db_with_fixtures.get_schedule_items()
    found = False
    for sched_item in schedule_items:
        if sched_item.get("time") == "08:00" and sched_item.get("activity") == "Breakfast":
            found = True
            assert sched_item.get("location") == "kitchen"
            break
    
    assert found, "Schedule item not found in database"
    
    # Step 3: Verify WebSocket broadcast (simulated)
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
        "type": "schedule_item_update",
        "action": "created",
        "item": item,
        "item_id": item_id,
        "timestamp": datetime.now().isoformat()
    })
    
    assert len(mock_ws.messages) > 0
    assert mock_ws.messages[0].get("action") == "created"
    
    # Step 4: Verify UI can retrieve
    retrieved_items = await test_db_with_fixtures.get_schedule_items()
    assert len(retrieved_items) > 0
    
    # Step 5: Verify LLM context includes schedule
    from services.context_builder import ContextBuilder
    builder = ContextBuilder()
    context = await builder.build_full_context(test_db_with_fixtures, include_summary=False, include_history=False)
    
    system_context = context.get("system_context", "")
    assert "08:00" in system_context or "Breakfast" in system_context
    
    # Step 6: Edit schedule item (simulated by replacing all items)
    all_items = await test_db_with_fixtures.get_schedule_items()
    for idx, sched_item in enumerate(all_items):
        if sched_item.get("time") == "08:00":
            all_items[idx]["activity"] = "Morning Exercise"
            break
    
    await test_db_with_fixtures.set_schedule_items(all_items)
    
    # Verify edit
    updated_items = await test_db_with_fixtures.get_schedule_items()
    found_edited = False
    for sched_item in updated_items:
        if sched_item.get("time") == "08:00":
            assert sched_item.get("activity") == "Morning Exercise"
            found_edited = True
            break
    
    assert found_edited
    
    # Step 7: Delete schedule item
    success = await test_db_with_fixtures.delete_schedule_item_by_time("08:00")
    assert success
    
    # Verify deletion
    final_items = await test_db_with_fixtures.get_schedule_items()
    found_deleted = False
    for sched_item in final_items:
        if sched_item.get("time") == "08:00":
            found_deleted = True
            break
    
    assert not found_deleted, "Schedule item should be deleted"

