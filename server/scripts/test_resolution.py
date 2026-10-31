"""Test patient and staff name resolution."""
import asyncio
from app.agent_runtime.llm_tool_router import _resolve_patient_and_staff_for_task, _is_adl_request
from app.agent_runtime.entity_resolution import resolve_patient_mentions

async def main():
    # Test patient resolution
    msg = "สร้างงานให้ Ada เช็คประจำวันผู้ป่วย elenor ในเวลา 9:00 ในวันพรุ่งนี้"
    args = {"title": "test", "priority": "normal"}
    resolved = await _resolve_patient_and_staff_for_task(13, msg, args)
    print(f"Resolved args: {resolved}")
    print(f"patient_id: {resolved.get('patient_id')}")
    print(f"assigned_user_id: {resolved.get('assigned_user_id')}")

    # Test with "Eleanor" (correct spelling)
    msg2 = "create task for Eleanor: daily checkup"
    args2 = {"title": "daily checkup", "priority": "normal"}
    resolved2 = await _resolve_patient_and_staff_for_task(13, msg2, args2)
    print(f"\nResolved args2: {resolved2}")
    print(f"patient_id: {resolved2.get('patient_id')}")

    # Test ADL detection
    print(f"\nADL detect 'วิเคราะห์ ADL ของ Eleanor': {_is_adl_request('วิเคราะห์ ADL ของ Eleanor')}")
    print(f"ADL detect 'ADL analysis for Eleanor': {_is_adl_request('ADL analysis for Eleanor')}")

asyncio.run(main())
