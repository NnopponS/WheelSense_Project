from __future__ import annotations

"""Legacy compatibility layer for future-domain schema imports."""

from .care import SpecialistBase, SpecialistCreate, SpecialistOut, SpecialistUpdate
from .floorplans import (
    FloorplanAssetOut,
    FloorplanLayoutOut,
    FloorplanLayoutPayload,
    FloorplanPresenceOut,
    FloorplanPresencePatientHint,
    FloorplanPresencePredictionHint,
    FloorplanRoomShape,
    RoomCameraSummary,
    RoomCaptureOut,
    RoomOccupantOut,
    RoomSmartDeviceStateSummary,
)
from .medication import (
    PharmacyOrderBase,
    PharmacyOrderCreate,
    PharmacyOrderOut,
    PharmacyOrderRequest,
    PharmacyOrderUpdate,
    PrescriptionBase,
    PrescriptionCreate,
    PrescriptionOut,
    PrescriptionUpdate,
)

