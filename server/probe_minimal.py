import sys
import os
print("DEBUG: started", flush=True)
import pydantic
print("DEBUG: pydantic ok", flush=True)
import fastapi
print("DEBUG: fastapi ok", flush=True)
import sqlalchemy
print("DEBUG: sqlalchemy ok", flush=True)
from sqlalchemy.ext.asyncio import AsyncSession
print("DEBUG: AsyncSession ok", flush=True)
print("DEBUG: SUCCESS", flush=True)
