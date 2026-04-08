from __future__ import annotations
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
    device_id = Column(String(32), nullable=False, index=True)  # Immutable hardware identity (per workspace)
    device_type = Column(String(32), nullable=False)  # legacy: wheelchair | camera | ...
    hardware_type = Column(
        String(32), nullable=False, default="wheelchair"
    )  # wheelchair | node | polar_sense | mobile_phone
    display_name = Column(String(128), nullable=False, default="")
    ip_address = Column(String(45), default="")
    firmware = Column(String(16), default="")
    last_seen = Column(DateTime(timezone=True), default=utcnow)
    config = Column(JSON().with_variant(JSONB, "postgresql"), default=dict)

class DeviceActivityEvent(Base):
    """Admin-facing device fleet activity (registry, HA mappings, commands, pairing)."""

    __tablename__ = "device_activity_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    occurred_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    event_type = Column(String(32), nullable=False, index=True)
    summary = Column(String(255), nullable=False, default="")
    registry_device_id = Column(String(32), nullable=True, index=True)
    smart_device_id = Column(Integer, nullable=True, index=True)
    details = Column(JSON().with_variant(JSONB, "postgresql"), default=dict)

class DeviceCommandDispatch(Base):
    """Audit trail for MQTT commands sent from admin/API (optional device ack)."""

    __tablename__ = "device_command_dispatches"

    id = Column(String(36), primary_key=True)  # UUID string
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id = Column(String(32), nullable=False, index=True)  # devices.device_id string
    topic = Column(String(256), nullable=False)
    payload = Column(JSON().with_variant(JSONB, "postgresql"), default=dict)
    status = Column(String(16), nullable=False, default="sent")  # sent | acked | failed
    error_message = Column(Text, default="")
    dispatched_at = Column(DateTime(timezone=True), default=utcnow)
    ack_at = Column(DateTime(timezone=True), nullable=True)
    ack_payload = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

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

