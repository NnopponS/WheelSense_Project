"""Test specific MCP tools directly to find root causes."""
import asyncio, time, json, traceback
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.agent_runtime.service import _call_mcp_tool
from app.core.security import create_access_token
from sqlalchemy import select


async def _run():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.role=="admin", User.is_active.is_(True)).limit(1))).scalar_one()
        ws = (await db.execute(select(Workspace).where(Workspace.id==user.workspace_id))).scalar_one()
    token = create_access_token(subject=str(user.id), role=user.role)

    tests = [
        ("list_task_management_tasks", {}),
        ("get_patient_vitals", {"patient_id": 70}),
        ("get_patient_timeline", {"patient_id": 70}),
        ("get_patient_details", {"patient_id": 70}),
        ("list_visible_patients", {}),
        ("list_devices", {}),
        ("list_staff", {}),
        ("list_messages", {}),
        ("get_workspace_analytics", {}),
        ("list_medications", {}),
        ("list_rooms", {}),
        ("list_caregivers", {}),
        ("get_floorplan_layout", {}),
        ("get_floorplan_presence", {}),
    ]

    for tool, args in tests:
        t0 = time.perf_counter()
        try:
            result = await asyncio.wait_for(
                _call_mcp_tool(token, tool, args),
                timeout=15.0,
            )
            elapsed = time.perf_counter() - t0
            result_str = json.dumps(result) if not isinstance(result, str) else result
            preview = result_str[:200].replace("\n", " ")
            print(f"✅ {tool}({args}) {elapsed:.2f}s → {preview}")
        except Exception as e:
            elapsed = time.perf_counter() - t0
            err = str(e)[:200].replace("\n", " ")
            print(f"❌ {tool}({args}) {elapsed:.2f}s → {type(e).__name__}: {err}")


asyncio.run(_run())
