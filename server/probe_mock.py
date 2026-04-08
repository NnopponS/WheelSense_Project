import sys
import time
from unittest.mock import MagicMock

print("Mocking sqlalchemy...")
sys.modules["sqlalchemy"] = MagicMock()
sys.modules["sqlalchemy.orm"] = MagicMock()
sys.modules["sqlalchemy.ext.asyncio"] = MagicMock()

start = time.time()
import sqlalchemy
print(f"Importing mocked sqlalchemy took: {time.time() - start:.4f}s")

from sqlalchemy import Column
print("Successfully used Column from mock")
