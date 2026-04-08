import sys
print("DEBUG: sys ok", flush=True)
import os
print("DEBUG: os ok", flush=True)
from pathlib import Path
print("DEBUG: pathlib ok", flush=True)

# Add server to path
SERVER_ROOT = os.path.dirname(os.path.abspath(__file__))
if SERVER_ROOT not in sys.path:
    sys.path.insert(0, SERVER_ROOT)
print(f"DEBUG: path inserted: {SERVER_ROOT}", flush=True)

print("DEBUG: importing fastapi", flush=True)
import fastapi
print("DEBUG: fastapi ok", flush=True)

print("DEBUG: importing app.config", flush=True)
import app.config
print("DEBUG: app.config ok", flush=True)

print("DEBUG: importing app.db.session", flush=True)
import app.db.session
print("DEBUG: app.db.session ok", flush=True)

print("DEBUG: EVERYTHING OK", flush=True)
