from __future__ import annotations

"""Pydantic schemas for Patient, PatientDeviceAssignment, PatientContact."""

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, computed_field

# JSON column may store legacy list[str] or structured {condition, severity, ...} dicts.
MedicalConditionEntry = str | dict[str, Any]

# ── Patient ───────────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    nickname: str = ""
    date_of_birth: date | None = None
    gender: str = ""
    height_cm: float | None = None
    weight_kg: float | None = None
    blood_type: str = ""
    medical_conditions: list[MedicalConditionEntry] = []
    allergies: list[str] = []
    medications: list[dict[str, Any]] = []
    past_surgeries: list[dict[str, Any]] = []
    care_level: str = "normal"
    mobility_type: str = "wheelchair"
    notes: str = ""
    room_id: int | None = None

class PatientUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    nickname: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    blood_type: str | None = None
    care_level: str | None = None
    mobility_type: str | None = None
    notes: str | None = None
    medical_conditions: list[MedicalConditionEntry] | None = None
    allergies: list[str] | None = None
    medications: list[dict[str, Any]] | None = None
    past_surgeries: list[dict[str, Any]] | None = None
    room_id: int | None = None
    is_active: bool | None = None
    photo_url: str | None = None

class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    first_name: str
    last_name: str
    nickname: str
    date_of_birth: date | None
    gender: str
    height_cm: float | None
    weight_kg: float | None
    blood_type: str
    photo_url: str | None = None
    medical_conditions: list[MedicalConditionEntry]
    allergies: list[str]
    medications: list[dict[str, Any]]
    past_surgeries: list[dict[str, Any]]
    care_level: str
    mobility_type: str
    current_mode: str
    notes: str
    admitted_at: datetime
    is_active: bool
    room_id: int | None
    created_at: datetime


class PatientRoomOut(BaseModel):
    id: int
    name: str
    floor_id: int | None = None
    room_type: str
    node_device_id: str | None = None


class PatientAssignedStaffOut(BaseModel):
    id: int
    first_name: str
    last_name: str
    role: str
    phone: str = ""
    email: str = ""
    photo_url: str = ""

class ModeSwitchRequest(BaseModel):
    mode: str  # "wheelchair" | "walking"


class PatientCaregiverAccessReplace(BaseModel):
    """Replace active CareGiverPatientAccess rows for one patient (workspace-scoped)."""

    caregiver_ids: list[int] = Field(default_factory=list)


# ── Device Assignment ─────────────────────────────────────────────────────────

class DeviceAssignmentCreate(BaseModel):
    device_id: str
    device_role: str  # wheelchair_sensor | polar_hr | mobile

class DeviceAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    patient_id: int
    device_id: str
    device_role: str
    assigned_at: datetime
    is_active: bool

# ── Patient Contact ───────────────────────────────────────────────────────────

class PatientContactCreate(BaseModel):
    contact_type: str  # family | doctor | nurse | emergency
    name: str
    relationship: str = ""
    phone: str = ""
    email: str = ""
    is_primary: bool = False
    notes: str = ""

class PatientContactUpdate(BaseModel):
    contact_type: str | None = None
    name: str | None = None
    relationship: str | None = None
    phone: str | None = None
    email: str | None = None
    is_primary: bool | None = None
    notes: str | None = None

class PatientContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    patient_id: int
    contact_type: str
    name: str
    relationship: str
    phone: str
    email: str
    is_primary: bool
    notes: str = ""


class PatientDetailOut(PatientOut):
    bmi: float | None = None
    clinical_notes: str
    emergency_contacts: list[PatientContactOut] = Field(default_factory=list)
    assigned_staff: list[PatientAssignedStaffOut] = Field(default_factory=list)
    room: PatientRoomOut | None = None

    @computed_field
    @property
    def current_medications(self) -> list[dict[str, Any]]:
        return list(self.medications or [])

    @computed_field
    @property
    def emergency_contact(self) -> PatientContactOut | None:
        if not self.emergency_contacts:
            return None
        primary = next((contact for contact in self.emergency_contacts if contact.is_primary), None)
        return primary or self.emergency_contacts[0]
