from .base import Base
from .core import Workspace, Device, Room, SmartDevice
from .facility import Facility, Floor
from .users import User
from .patients import Patient, PatientDeviceAssignment, PatientContact
from .caregivers import CareGiver, CareGiverZone, CareGiverShift
from .vitals import VitalReading, HealthObservation
from .activity import ActivityTimeline, Alert
from .telemetry import IMUTelemetry, RSSIReading, RoomPrediction, RSSITrainingData, MotionTrainingData, PhotoRecord
from .chat import ChatConversation, ChatMessage, WorkspaceAISettings
from .workflow import (
    CareSchedule,
    CareTask,
    RoleMessage,
    HandoverNote,
    CareDirective,
    AuditTrailEvent,
)
from .future_domains import (
    FloorplanAsset,
    FloorplanLayout,
    Specialist,
    Prescription,
    PharmacyOrder,
)

__all__ = [
    "Base",
    "User",
    # Core
    "Workspace",
    "Device",
    "Room",
    "SmartDevice",
    # Facility Hierarchy
    "Facility",
    "Floor",
    # People
    "Patient",
    "PatientDeviceAssignment",
    "PatientContact",
    "CareGiver",
    "CareGiverZone",
    "CareGiverShift",
    # Health
    "VitalReading",
    "HealthObservation",
    # Activity
    "ActivityTimeline",
    "Alert",
    # Telemetry
    "IMUTelemetry",
    "RSSIReading",
    "RoomPrediction",
    "RSSITrainingData",
    "MotionTrainingData",
    "PhotoRecord",
    # AI Chat
    "ChatConversation",
    "ChatMessage",
    "WorkspaceAISettings",
    # Workflow domains
    "CareSchedule",
    "CareTask",
    "RoleMessage",
    "HandoverNote",
    "CareDirective",
    "AuditTrailEvent",
    # Future domains
    "FloorplanAsset",
    "FloorplanLayout",
    "Specialist",
    "Prescription",
    "PharmacyOrder",
]
