"""Test normalize_task_creation_calls directly."""
import asyncio
from app.agent_runtime.llm_tool_router import _normalize_task_creation_calls
from app.services.ai_chat import ParsedToolCall

async def test():
    message = "สร้างงานให้ Ada เช็คประจำวันผู้ป่วย elenor ในเวลา 9:00 ในวันพรุ่งนี้"
    calls = [ParsedToolCall(
        id="1",
        name="create_task_management_task",
        arguments={"title": "test", "description": "test", "priority": "normal", "due_at": "2026-08-23T09:00:00+00:00"}
    )]
    result = await _normalize_task_creation_calls(13, message, calls)
    for c in result:
        print(f"Name: {c.name}")
        print(f"Args: {c.arguments}")
        print(f"patient_id: {c.arguments.get('patient_id')}")
        print(f"assigned_user_id: {c.arguments.get('assigned_user_id')}")

asyncio.run(test())
