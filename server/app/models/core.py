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
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(64), nullable=False)
    description = Column(Text, default="")
