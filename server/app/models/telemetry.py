from __future__ import annotations
from sqlalchemy import Column, Integer, String, Float, SmallInteger, Boolean, DateTime, ForeignKey, JSON

from sqlalchemy.dialects.postgresql import JSONB

from .base import Base, utcnow

class IMUTelemetry(Base):
    __tablename__ = "imu_telemetry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
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
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String(32), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)
    node_id = Column(String(32), nullable=False)
    rssi = Column(SmallInteger, nullable=False)
    mac = Column(String(17), default="")

class RoomPrediction(Base):
    __tablename__ = "room_predictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String(32), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)
    predicted_room_id = Column(Integer, nullable=True)
    predicted_room_name = Column(String(64), default="")
    confidence = Column(Float, default=0.0)
    model_type = Column(String(16), default="knn")
    rssi_vector = Column(JSON().with_variant(JSONB, "postgresql"), default=dict)

class RSSITrainingData(Base):
    __tablename__ = "rssi_training_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    room_id = Column(Integer, nullable=False)
    room_name = Column(String(64), default="")
    rssi_vector = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    collected_at = Column(DateTime(timezone=True), default=utcnow)

class MotionTrainingData(Base):
    __tablename__ = "motion_training_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(64), nullable=False, index=True, default="")
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

class PhotoRecord(Base):
    __tablename__ = "photo_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String(32), nullable=False, index=True)
    photo_id = Column(String(64), nullable=False, unique=True, index=True)
    filepath = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)

