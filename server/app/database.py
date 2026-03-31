"""WheelSense Server — SQLAlchemy models and database engine."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, Float, Integer, SmallInteger, String, Text,
    create_engine,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

# Async engine (for FastAPI)
async_engine = create_async_engine(settings.database_url, echo=False, pool_size=5, max_overflow=10)
AsyncSessionLocal = sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

# Sync engine (for Alembic migrations and model training)
sync_engine = create_engine(settings.database_url_sync, echo=False)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(32), unique=True, nullable=False, index=True)
    device_type = Column(String(16), nullable=False)  # 'wheelchair' | 'camera'
    ip_address = Column(String(45), default="")
    firmware = Column(String(16), default="")
    last_seen = Column(DateTime(timezone=True), default=utcnow)
    config = Column(JSONB, default=dict)


class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(64), nullable=False)
    description = Column(Text, default="")


class IMUTelemetry(Base):
    __tablename__ = "imu_telemetry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(32), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)
    seq = Column(Integer, default=0)
    ax = Column(Float)
    ay = Column(Float)
    az = Column(Float)
    gx = Column(Float)
    gy = Column(Float)
    gz = Column(Float)
    distance_m = Column(Float)
    velocity_ms = Column(Float)
    accel_ms2 = Column(Float)
    direction = Column(SmallInteger)
    battery_pct = Column(SmallInteger)
    battery_v = Column(Float)
    charging = Column(Boolean, default=False)


class RSSIReading(Base):
    __tablename__ = "rssi_readings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(32), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)
    node_id = Column(String(32), nullable=False)
    rssi = Column(SmallInteger, nullable=False)
    mac = Column(String(17), default="")


class RoomPrediction(Base):
    __tablename__ = "room_predictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(32), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)
    predicted_room_id = Column(Integer, nullable=True)
    predicted_room_name = Column(String(64), default="")
    confidence = Column(Float, default=0.0)
    model_type = Column(String(16), default="knn")
    rssi_vector = Column(JSONB, default=dict)


class RSSITrainingData(Base):
    __tablename__ = "rssi_training_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(Integer, nullable=False)
    room_name = Column(String(64), default="")
    rssi_vector = Column(JSONB, nullable=False)  # {"WSN_001": -65, "WSN_002": -72}
    collected_at = Column(DateTime(timezone=True), default=utcnow)


class MotionTrainingData(Base):
    __tablename__ = "motion_training_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(32), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)
    action_label = Column(String(32), nullable=False, index=True)
    ax = Column(Float)
    ay = Column(Float)
    az = Column(Float)
    gx = Column(Float)
    gy = Column(Float)
    gz = Column(Float)
    distance_m = Column(Float)
    velocity_ms = Column(Float)
    accel_ms2 = Column(Float)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    """Create all tables."""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
