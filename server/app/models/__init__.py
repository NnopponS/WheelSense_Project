from __future__ import annotations
from .base import Base
from .core import (
    Workspace,
    Device,
    DeviceActivityEvent,
    DeviceCommandDispatch,
    Room,
    SmartDevice,
)
from .facility import Facility, Floor
from .users import AuthSession, User
from .mcp_tokens import MCPToken
from .patients import Patient, PatientDeviceAssignment, PatientContact
from .caregivers import (
    CareGiver,
    CareGiverZone,
    CareGiverShift,
    CareGiverDeviceAssignment,
    CareGiverPatientAccess,
)
from .vitals import VitalReading, HealthObservation
from .activity import ActivityTimeline, Alert
from .telemetry import (
    IMUTelemetry,
    RSSIReading,
    RoomPrediction,
    RSSITrainingData,
    MotionTrainingData,
    PhotoRecord,
    NodeStatusTelemetry,
    MobileDeviceTelemetry,
    LocalizationConfig,
    LocalizationCalibrationSession,
    LocalizationCalibrationSample,
)
from .chat import ChatConversation, ChatMessage, WorkspaceAISettings
from .chat_actions import ChatAction
from .workflow import (
    CareSchedule,
    CareTask,
    RoleMessage,
    HandoverNote,
    CareDirective,
    AuditTrailEvent,
)
from .floorplans import FloorplanAsset, FloorplanLayout
from .care import DemoActorPosition, Specialist
from .medication import Prescription, PharmacyOrder
from .service_requests import ServiceRequest
from .support import SupportTicket, SupportTicketComment, SupportTicketAttachment
from .shift_checklist import ShiftChecklistState

__all__ = [
    "Base",
    "User",
    "AuthSession",
    "MCPToken",
    # Core
    "Workspace",
    "Device",
    "DeviceActivityEvent",
    "DeviceCommandDispatch",
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
    "CareGiverDeviceAssignment",
    "CareGiverPatientAccess",
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
    "NodeStatusTelemetry",
    "MobileDeviceTelemetry",
    "LocalizationConfig",
    "LocalizationCalibrationSession",
    "LocalizationCalibrationSample",
    # AI Chat
    "ChatConversation",
    "ChatMessage",
    "ChatAction",
    "WorkspaceAISettings",
    # Workflow domains
    "CareSchedule",
    "CareTask",
    "RoleMessage",
    "HandoverNote",
    "CareDirective",
    "AuditTrailEvent",
    # Operational care/map/medication domains
    "FloorplanAsset",
    "FloorplanLayout",
    "DemoActorPosition",
    "Specialist",
    "Prescription",
    "PharmacyOrder",
    "ServiceRequest",
    # Support
    "SupportTicket",
    "SupportTicketComment",
    "SupportTicketAttachment",
    "ShiftChecklistState",
]
