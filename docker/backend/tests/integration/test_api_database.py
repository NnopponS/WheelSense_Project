"""
Integration tests for API → Database persistence.
"""

import pytest
from datetime import datetime


@pytest.mark.integration
@pytest.mark.asyncio
async def test_user_info_update_persists_to_db(test_db):
    """Test that user info update persists to database."""
    # Update user info
    await test_db.set_user_name(thai="ทดสอบ", english="Test User")
    await test_db.set_user_condition("diabetes")
    await test_db.set_current_location("kitchen")
    
    # Verify persistence
    user_info = await test_db.get_user_info()
    assert user_info["name_english"] == "Test User"
    assert user_info["condition"] == "diabetes"
    assert user_info["current_location"] == "kitchen"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_schedule_item_add_persists_to_db(test_db):
    """Test that schedule item addition persists to database."""
    # Add schedule item
    item = {
        "time": "08:00",
        "activity": "Breakfast",
        "location": "kitchen"
    }
    item_id = await test_db.add_schedule_item(item)
    
    # Verify persistence
    schedule_items = await test_db.get_schedule_items()
    assert len(schedule_items) > 0
    
    # Find the added item
    found = False
    for sched_item in schedule_items:
        if sched_item.get("time") == "08:00" and sched_item.get("activity") == "Breakfast":
            found = True
            assert sched_item.get("location") == "kitchen"
            break
    
    assert found, "Schedule item not found in database"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_appliance_state_update_persists_to_db(test_db):
    """Test that appliance state update persists to database."""
    # Set appliance state
    success = await test_db.set_appliance_state("kitchen", "light", True)
    assert success
    
    # Verify persistence
    appliances = await test_db.get_appliances_by_room("kitchen")
    light_appliance = None
    for app in appliances:
        if app.get("type") == "light":
            light_appliance = app
            break
    
    assert light_appliance is not None
    assert light_appliance.get("state") == 1
    assert light_appliance.get("isOn") == 1


@pytest.mark.integration
@pytest.mark.asyncio
async def test_chat_message_saves_to_history(test_db):
    """Test that chat messages are saved to chat history."""
    # Save user message
    await test_db.save_chat_message({
        "role": "user",
        "content": "Test message"
    })
    
    # Verify persistence
    history = await test_db.get_recent_chat_history(limit=10)
    assert len(history) > 0
    
    # Find the saved message
    found = False
    for msg in history:
        if msg.get("role") == "user" and msg.get("content") == "Test message":
            found = True
            break
    
    assert found, "Chat message not found in history"

