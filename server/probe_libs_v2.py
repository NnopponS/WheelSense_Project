print("DEBUG: importing sqlalchemy core", flush=True)
from sqlalchemy import create_engine, text, Column, Integer, String
print("DEBUG: sqlalchemy core ok", flush=True)

print("DEBUG: importing sqlalchemy.ext.asyncio", flush=True)
import sqlalchemy.ext.asyncio
print("DEBUG: sqlalchemy.ext.asyncio ok", flush=True)

print("DEBUG: EVERYTHING OK", flush=True)
