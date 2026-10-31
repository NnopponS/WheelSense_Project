"""Test full task creation flow: propose → confirm → execute."""
import requests
import json
from datetime import datetime, timezone, timedelta

BASE = "http://localhost:8000"


def login(username, password):
    r = requests.post(f"{BASE}/api/auth/login", data={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


def main():
    token = login("ada.m", "ada.m")
    print("[OK] Logged in as ada.m")

    msg = "สร้างงานให้ Ada เช็คประจำวันผู้ป่วย elenor ในเวลา 9:00 ในวันพรุ่งนี้"
    print(f"\nMessage: {msg}")

    # Step 1: Propose
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(f"{BASE}/api/chat/actions/propose", json={"message": msg}, headers=headers)
    print(f"Propose status: {r.status_code}")
    result = r.json()
    print(f"Mode: {result.get('mode')}")

    if result.get("mode") != "plan":
        print(f"[FAIL] Expected plan mode, got {result.get('mode')}")
        print(f"Reply: {result.get('assistant_reply', '')[:300]}")
        return

    actions = result.get("actions", [])
    if not actions:
        print("[FAIL] No actions in plan")
        return

    action_id = actions[0]["action_id"]
    plan = result.get("execution_plan", {})
    steps = plan.get("steps", [])
    print(f"Action ID: {action_id}")
    for step in steps:
        print(f"  Tool: {step.get('tool_name')}")
        print(f"  Args: {json.dumps(step.get('arguments', {}), ensure_ascii=False)}")

    # Verify args
    args = steps[0].get("arguments", {}) if steps else {}
    print(f"\n--- Verification ---")
    print(f"  patient_id: {args.get('patient_id')} (expected 69)")
    print(f"  assigned_user_id: {args.get('assigned_user_id')} (expected 115)")
    print(f"  due_at: {args.get('due_at')}")

    # Step 2: Confirm
    print(f"\n--- Confirming action {action_id} ---")
    r = requests.post(f"{BASE}/api/chat/actions/{action_id}/confirm", json={"approved": True}, headers=headers)
    print(f"Confirm status: {r.status_code}")
    if r.status_code != 200:
        print(f"Confirm error: {r.text[:300]}")
        return
    confirmed = r.json()
    print(f"Confirmed status: {confirmed.get('status')}")

    # Step 3: Execute
    print(f"\n--- Executing action {action_id} ---")
    r = requests.post(f"{BASE}/api/chat/actions/{action_id}/execute", json={"force": True}, headers=headers)
    print(f"Execute status: {r.status_code}")
    if r.status_code not in (200, 201):
        print(f"Execute error: {r.text[:500]}")
        return
    exec_result = r.json()
    print(f"Message: {exec_result.get('message', '')}")
    exec_data = exec_result.get("execution_result", {})
    print(f"Execution result: {json.dumps(exec_data, ensure_ascii=False)[:500]}")

    # Check if task was actually created
    print(f"\n--- Checking task in DB ---")
    r = requests.get(f"{BASE}/api/tasks", headers=headers)
    print(f"List tasks status: {r.status_code}")
    if r.status_code == 200:
        tasks = r.json()
        if isinstance(tasks, list) and tasks:
            latest = tasks[0]
            print(f"Latest task: {json.dumps(latest, ensure_ascii=False)[:400]}")
        elif isinstance(tasks, dict) and "items" in tasks:
            items = tasks["items"]
            if items:
                latest = items[0]
                print(f"Latest task: {json.dumps(latest, ensure_ascii=False)[:400]}")
        else:
            print(f"Tasks response: {json.dumps(tasks, ensure_ascii=False)[:300]}")


if __name__ == "__main__":
    main()
