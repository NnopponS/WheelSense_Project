from __future__ import annotations

"""Schemas for prescriptions and pharmacy orders."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PrescriptionBase(BaseModel):
    patient_id: Optional[int] = None
    specialist_id: Optional[int] = None
    medication_name: str = Field(min_length=1, max_length=128)
    dosage: str = Field(min_length=1, max_length=64)
    frequency: str = Field(min_length=1, max_length=64)
    route: str = Field(default="oral", max_length=32)
    instructions: str = ""
    status: str = Field(default="active", pattern="^(active|paused|completed|cancelled)$")
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class PrescriptionCreate(PrescriptionBase):
    pass


class PrescriptionUpdate(BaseModel):
    specialist_id: Optional[int] = None
    medication_name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    dosage: Optional[str] = Field(default=None, min_length=1, max_length=64)
    frequency: Optional[str] = Field(default=None, min_length=1, max_length=64)
    route: Optional[str] = Field(default=None, max_length=32)
    instructions: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(active|paused|completed|cancelled)$")
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class PrescriptionOut(PrescriptionBase):
    id: int
    workspace_id: int
    prescribed_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PharmacyOrderBase(BaseModel):
    prescription_id: Optional[int] = None
    patient_id: Optional[int] = None
    order_number: str = Field(min_length=1, max_length=64)
    pharmacy_name: str = Field(min_length=1, max_length=128)
    quantity: int = Field(default=0, ge=0)
    refills_remaining: int = Field(default=0, ge=0)
    status: str = Field(default="pending", pattern="^(pending|verified|dispensed|cancelled)$")
    notes: str = ""


class PharmacyOrderCreate(PharmacyOrderBase):
    pass


class PharmacyOrderUpdate(BaseModel):
    quantity: Optional[int] = Field(default=None, ge=0)
    refills_remaining: Optional[int] = Field(default=None, ge=0)
    status: Optional[str] = Field(default=None, pattern="^(pending|verified|dispensed|cancelled)$")
    notes: Optional[str] = None
    fulfilled_at: Optional[datetime] = None


class PharmacyOrderOut(PharmacyOrderBase):
    id: int
    workspace_id: int
    requested_at: datetime
    fulfilled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PharmacyOrderRequest(BaseModel):
    prescription_id: int
    pharmacy_name: str = Field(default="Preferred pharmacy", min_length=1, max_length=128)
    quantity: int = Field(default=30, ge=1)
    notes: str = ""
