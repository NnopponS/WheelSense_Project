import sys
import os
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVER_ROOT))

print("DEBUG: starting endpoint probe", flush=True)
os.environ["WHEELSENSE_ENABLE_MCP"] = "0"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

endpoints = [
    "workspaces", "devices", "rooms", "telemetry", "localization", "motion",
    "patients", "caregivers", "facilities", "vitals", "timeline", "alerts",
    "auth", "users", "homeassistant", "retention", "cameras", "analytics",
    "chat", "ai_settings", "workflow", "future_domains", "profile_images"
]

for ep in endpoints:
    print(f"DEBUG: importing app.api.endpoints.{ep}", flush=True)
    try:
        __import__(f"app.api.endpoints.{ep}", fromlist=["router"])
        print(f"DEBUG: imported {ep} ok", flush=True)
    except Exception as e:
        print(f"DEBUG: FAILED {ep}: {e}", flush=True)

print("DEBUG: probe finished", flush=True)
