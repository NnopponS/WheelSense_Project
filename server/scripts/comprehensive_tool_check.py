"""Comprehensive MCP tool coverage and AI pipeline stress test."""
import asyncio, time, json, traceback
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.agent_runtime.llm_tool_router import build_openai_tools_for_role
from app.agent_runtime.service import propose_turn
from app.core.security import create_access_token
from sqlalchemy import select

# Common user asks grouped by domain
TEST_CASES = [
    # Identity / directory
    ("Who is Robert?", ["list_visible_patients", "list_staff"]),
    ("Where is Jane?", ["list_visible_patients", "list_staff"]),
    ("Show all patients", ["list_visible_patients"]),
    ("List staff", ["list_staff", "list_users"]),
    ("Show caregivers", ["list_caregivers"]),

    # Alerts
    ("Show active alerts", ["list_active_alerts"]),
    ("Any fall alerts?", ["list_active_alerts"]),
    ("Acknowledge alert 4211", ["acknowledge_alert"]),

    # Patient records
    ("Robert health", ["get_patient_health_analysis", "get_patient_vitals", "get_patient_details"]),
    ("Robert timeline", ["get_patient_timeline"]),
    ("Show vitals for patient 70", ["get_patient_vitals"]),

    # Devices
    ("Show devices", ["list_devices", "list_patient_devices"]),
    ("Device status", ["list_devices"]),
    ("Battery low devices", ["list_devices"]),

    # Location
    ("Who is in room 401?", ["list_visible_patients"]),
    ("Floorplan", ["get_floorplan_presence", "list_rooms"]),

    # Tasks / workflow
    ("Show my tasks", ["list_task_management_tasks"]),
    ("Create task for Robert: check blood pressure today", ["create_task_management_task"]),

    # Communication
    ("Messages", ["list_messages"]),
    ("Send message to nurse", ["send_message"]),

    # Medication / care
    ("Medication list", ["list_medications"]),
    ("Care notes for Robert", ["list_care_notes", "get_patient_timeline"]),

    # General
    ("Hello", []),
    ("What can you do?", []),
    ("Help", []),
]


def _contains_expected_tools(reply: str, expected: list[str]) -> bool:
    lowered = reply.lower()
    return any(t.lower().replace("_", " ") in lowered or t in reply for t in expected)


async def _run():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.role=="admin", User.is_active.is_(True)).limit(1))).scalar_one()
        ws = (await db.execute(select(Workspace).where(Workspace.id==user.workspace_id))).scalar_one()
    token = create_access_token(subject=str(user.id), role=user.role)

    # Catalog
    tools = build_openai_tools_for_role(user.role)
    print(f"Workspace: {ws.name} (id={ws.id})")
    print(f"MCP tool count: {len(tools)}")
    print(f"Tool names: {', '.join(sorted(t['function']['name'] for t in tools))}")
    print("=" * 80)

    results = []
    for message, expected_tools in TEST_CASES:
        print(f"\n>>> {message!r}")
        t0 = time.perf_counter()
        try:
            response = await asyncio.wait_for(
                propose_turn(actor_access_token=token, message=message, messages=[], conversation_id=None),
                timeout=120.0,
            )
            elapsed = time.perf_counter() - t0
            method = response.grounding.get("classification_method") if response.grounding else "none"
            tool_names = response.grounding.get("tool_names", []) if response.grounding else []
            reply = (response.assistant_reply or "")[:200]
            ok = (response.mode == "answer") and (not expected_tools or any(t in tool_names for t in expected_tools))
            print(f"    mode={response.mode} method={method} tools={tool_names}")
            print(f"    reply={reply}")
            print(f"    time={elapsed:.2f}s OK={ok}")
            results.append({"message": message, "ok": ok, "tools": tool_names, "latency": elapsed, "reply": reply})
        except Exception as e:
            elapsed = time.perf_counter() - t0
            print(f"    ERROR after {elapsed:.2f}s: {type(e).__name__}: {str(e)[:120]}")
            traceback.print_exc()
            results.append({"message": message, "ok": False, "tools": [], "latency": elapsed, "error": str(e)[:120]})

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    passed = sum(1 for r in results if r["ok"])
    print(f"Passed: {passed}/{len(results)}")
    for r in results:
        status = "✅" if r["ok"] else "❌"
        print(f"  {status} {r['message']:<45} ({r['latency']:.1f}s) tools={r.get('tools', [])}")

    # Coverage report
    print("\n" + "=" * 80)
    print("MCP COVERAGE GAPS")
    # Group tools by domain
    by_prefix = {}
    for t in tools:
        name = t["function"]["name"]
        desc = t["function"]["description"]
        prefix = name.split("_")[0]
        by_prefix.setdefault(prefix, []).append((name, desc))
    for prefix, items in sorted(by_prefix.items()):
        print(f"\n[{prefix}] ({len(items)} tools)")
        for n, d in items[:20]:
            print(f"  - {n}: {d[:80]}")


if __name__ == "__main__":
    asyncio.run(_run())
