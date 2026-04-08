import sys
import os
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVER_ROOT))

print("DEBUG: starting probe")
os.environ["WHEELSENSE_ENABLE_MCP"] = "0"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

print("DEBUG: importing FastAPI")
from fastapi import FastAPI
print("DEBUG: imported FastAPI")

print("DEBUG: importing router")
# Instead of app.main, let's try importing the router directly
from app.api.router import api_router
print("DEBUG: imported router")

print("DEBUG: importing app.main")
from app.main import app
print("DEBUG: imported app.main")

print("DEBUG: success")
