from __future__ import annotations

"""Legacy compatibility layer for future-domain endpoints."""

from fastapi import APIRouter

from .care import router as care_router
from .floorplans import router as floorplans_router
from .medication import router as medication_router

router = APIRouter()
router.include_router(floorplans_router)
router.include_router(care_router)
router.include_router(medication_router)
