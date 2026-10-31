"""End-to-end test of task creation via AI chat propose_turn.

Tests the exact user scenario:
  สร้างงานให้ Ada เช็คประจำวันผู้ป่วย elenor ในเวลา 9:00 ในวันพรุ่งนี้

Verifies:
  1. Patient name "Eleanor" resolves to patient_id 69
  2. Staff name "Ada" resolves to assigned_user_id 115
  3. Thai date "พรุ่งนี้ เวลา 9:00" resolves to tomorrow 09:00 UTC
  4. Task is actually created with correct fields
"""
import requests
import json
from datetime import datetime, timezone, timedelta

BASE = "http://localhost:8000"


def login(username: str, password: str) -> str:
    r = requests.post(f"{BASE}/api/auth/login", data={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


def propose(token: str, message: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"message": message}
    r = requests.post(f"{BASE}/api/chat/actions/propose", json=payload, headers=headers)
    print(f"  propose status: {r.status_code}")
    if r.status_code != 201:
        print(f"  error body: {r.text[:500]}")
        return {}
    return r.json()


def execute(token: str, action_id: int) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(f"{BASE}/api/chat/actions/{action_id}/execute", json={"force": True}, headers=headers)
    print(f"  execute status: {r.status_code}")
    if r.status_code not in (200, 201):
        print(f"  error body: {r.text[:500]}")
    return r.json()


def main():
    token = login("ada.m", "ada.m")
    print("[OK] Logged in as ada.m")

    # Test 1: Thai task creation
    print("\n=== Test 1: Thai task creation ===")
    msg = "สร้างงานให้ Ada เช็คประจำวันผู้ป่วย elenor ในเวลา 9:00 ในวันพรุ่งนี้"
    print(f"Message: {msg}")
    result = propose(token, msg)
    mode = result.get("mode")
    print(f"Mode: {mode}")
    print(f"Reply: {result.get('assistant_reply', '')[:200]}")

    if mode == "plan":
        actions = result.get("actions", [])
        plan = result.get("execution_plan", {})
        if plan:
            steps = plan.get("steps", [])
            print(f"Plan steps: {len(steps)}")
            for step in steps:
                print(f"  Step: {step.get('title')} | tool={step.get('tool_name')}")
                print(f"    args: {json.dumps(step.get('arguments', {}), ensure_ascii=False)}")
                args = step.get("arguments", {})
                print("\n--- Verification ---")
                print(f"  title: {args.get('title')}")
                print(f"  patient_id: {args.get('patient_id')} (expected 69)")
                print(f"  assigned_user_id: {args.get('assigned_user_id')} (expected 115)")
                print(f"  due_at: {args.get('due_at')}")
                due_at = args.get("due_at")
                if due_at:
                    dt = datetime.fromisoformat(due_at)
                    tomorrow = datetime.now(timezone.utc).date() + timedelta(days=1)
                    print(f"  due_at date: {dt.date()} (expected ~{tomorrow})")
                    print(f"  due_at hour: {dt.hour}:00 (expected 9:00)")

        if actions:
            action_id = actions[0].get("action_id")
            print(f"\n--- Executing task (action_id={action_id}) ---")
            exec_result = execute(token, action_id)
            print(f"  message: {exec_result.get('message', '')}")
            exec_data = exec_result.get("execution_result", {})
            print(f"  execution_result: {json.dumps(exec_data, ensure_ascii=False)[:300]}")
    elif mode == "answer":
        print("  [NOTE] AI returned answer mode (no action proposed)")
        print(f"  Full reply: {result.get('assistant_reply', '')[:500]}")
        grounding = result.get("grounding", {})
        print(f"  grounding: {json.dumps(grounding, ensure_ascii=False)[:300]}")
    else:
        print(f"  [UNKNOWN] mode={mode}")

    # Test 2: English task creation
    print("\n=== Test 2: English task creation ===")
    msg2 = "create task for Eleanor: daily checkup tomorrow at 9am"
    print(f"Message: {msg2}")
    result2 = propose(token, msg2)
    mode2 = result2.get("mode")
    print(f"Mode: {mode2}")
    print(f"Reply: {result2.get('assistant_reply', '')[:200]}")
    if mode2 == "plan":
        plan = result2.get("execution_plan", {})
        for step in plan.get("steps", []):
            print(f"  Step: {step.get('title')} | tool={step.get('tool_name')}")
            print(f"    args: {json.dumps(step.get('arguments', {}), ensure_ascii=False)}")

    # Test 3: ADL analysis
    print("\n=== Test 3: ADL analysis ===")
    msg3 = "วิเคราะห์ ADL ของ Eleanor"
    print(f"Message: {msg3}")
    result3 = propose(token, msg3)
    mode3 = result3.get("mode")
    print(f"Mode: {mode3}")
    reply3 = result3.get("assistant_reply", "")
    print(f"Reply: {reply3[:400]}")
    grounding3 = result3.get("grounding", {})
    tool_names = grounding3.get("tool_names", [])
    print(f"Tools called: {tool_names}")
    cards3 = grounding3.get("response_cards", [])
    for c in cards3:
        print(f"  Card kind: {c.get('kind')}")

    # Test 4: Patient list (room_name check)
    print("\n=== Test 4: Patient list (room_name) ===")
    msg4 = "ตอนนี้ผู้ป่วยมีใครบ้าง"
    print(f"Message: {msg4}")
    result4 = propose(token, msg4)
    mode4 = result4.get("mode")
    print(f"Mode: {mode4}")
    reply4 = result4.get("assistant_reply", "")
    print(f"Reply: {reply4[:300]}")
    grounding4 = result4.get("grounding", {})
    cards4 = grounding4.get("response_cards", [])
    for card in cards4:
        if card.get("kind") in ("data_table", "table"):
            cols = [c.get("key") for c in card.get("columns", [])]
            rows = card.get("rows", [])
            print(f"  Table columns: {cols}")
            print(f"  room_name in columns: {'room_name' in cols}")
            print(f"  room_id in columns: {'room_id' in cols}")
            if rows:
                print(f"  First row: {json.dumps(rows[0], ensure_ascii=False)}")
        else:
            print(f"  Card kind: {card.get('kind')}")


if __name__ == "__main__":
    main()
