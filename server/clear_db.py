import sys
import os

# Add current dir to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from app.config import settings
from app.models.base import Base

print("Connecting to DB:", settings.database_url_sync)
engine = create_engine(settings.database_url_sync)

print("Dropping all tables...")
Base.metadata.drop_all(bind=engine)
print("All tables dropped successfully.")
