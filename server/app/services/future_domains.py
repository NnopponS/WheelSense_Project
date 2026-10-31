from __future__ import annotations

"""Legacy compatibility layer for future-domain service imports."""

from .care import CAREGIVER_SPECIALIST_NOTE_PREFIX, SpecialistService, specialist_service
from .floorplans import (
    FloorplanLayoutService,
    FloorplanPresenceService,
    floorplan_presence_service,
    floorplan_service,
)
from .medication import PharmacyOrderService, PrescriptionService, pharmacy_order_service, prescription_service

