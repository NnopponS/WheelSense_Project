from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, JSON
from sqlalchemy.dialects.postgresql import JSONB

from .base import Base, utcnow

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(64), nullable=False)
    mode = Column(String(16), nullable=False, default="real")  # 'real' | 'simulation'
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String(32), nullable=False, index=True) # Uniqueness combined with workspace
    device_type = Column(String(16), nullable=False)  # 'wheelchair' | 'camera'
    ip_address = Column(String(45), default="")
    firmware = Column(String(16), default="")
    last_seen = Column(DateTime(timezone=True), default=utcnow)
    config = Column(JSON().with_variant(JSONB, "postgresql"), default=dict)

class Room(Base):
    """Room / ห้อง — maps 1:1 to a T-SIMCam Node."""
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    floor_id = Column(Integer, ForeignKey("floors.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(64), nullable=False)
    description = Column(Text, default="")
    node_device_id = Column(String(32), nullable=True, unique=True)  # T-SIMCam device_id (1:1 mapping)
    room_type = Column(String(32), default="general")  # general|bedroom|bathroom|dining|therapy|outdoor
    adjacent_rooms = Column(JSON().with_variant(JSONB, "postgresql"), default=list)  # [room_id, ...]
    config = Column(JSON().with_variant(JSONB, "postgresql"), default=dict)  # HA device IDs, etc.
    created_at = Column(DateTime(timezone=True), default=utcnow)

class SmartDevice(Base):
    """Smart Device mapped to HomeAssistant entities."""
    __tablename__ = "smart_devices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True, index=True)
    
    name = Column(String(128), nullable=False)
    ha_entity_id = Column(String(128), nullable=False, unique=True, index=True)  # e.g., light.bedroom_1
    device_type = Column(String(32), nullable=False)  # 'light', 'switch', 'climate', 'fan'
    
    is_active = Column(Boolean, default=True)
    state = Column(String(32), default="unknown")  # Cache of the last known HA state ('on', 'off')
    config = Column(JSON().with_variant(JSONB, "postgresql"), default=dict)  # Features, capabilities
    
    created_at = Column(DateTime(timezone=True), default=utcnow)
