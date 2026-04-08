import sys
import os
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVER_ROOT))

print("DEBUG: starting probe v3", flush=True)
os.environ["WHEELSENSE_ENABLE_MCP"] = "0"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

print("DEBUG: importing app.db.session", flush=True)
import app.db.session
print("DEBUG: app.db.session ok", flush=True)

print("DEBUG: importing app.api.router", flush=True)
import app.api.router
print("DEBUG: app.api.router ok", flush=True)

print("DEBUG: importing app.main", flush=True)
import app.main
print("DEBUG: app.main ok", flush=True)

print("DEBUG: EVERYTHING OK", flush=True)
