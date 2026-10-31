from __future__ import annotations

"""Schemas for specialist and care directory data."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class SpecialistBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=64)
    last_name: str = Field(min_length=1, max_length=64)
    specialty: str = Field(min_length=1, max_length=64)
    license_number: Optional[str] = Field(default=None, max_length=64)
    phone: Optional[str] = Field(default=None, max_length=32)
    email: Optional[str] = Field(default=None, max_length=128)
    notes: str = ""
    is_active: bool = True


class SpecialistCreate(SpecialistBase):
    pass


class SpecialistUpdate(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    specialty: Optional[str] = Field(default=None, min_length=1, max_length=64)
    license_number: Optional[str] = Field(default=None, max_length=64)
    phone: Optional[str] = Field(default=None, max_length=32)
    email: Optional[str] = Field(default=None, max_length=128)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class SpecialistOut(SpecialistBase):
    id: int
    workspace_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
