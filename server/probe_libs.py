print("DEBUG: importing sqlalchemy.ext.asyncio", flush=True)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
print("DEBUG: sqlalchemy.ext.asyncio ok", flush=True)

print("DEBUG: importing sqlalchemy", flush=True)
from sqlalchemy import create_engine
print("DEBUG: sqlalchemy ok", flush=True)

print("DEBUG: importing pydantic_settings", flush=True)
from pydantic_settings import BaseSettings
print("DEBUG: pydantic_settings ok", flush=True)

print("DEBUG: ALL OK", flush=True)
