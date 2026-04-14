from __future__ import annotations

"""Pydantic schemas for Users and Authentication."""

import re
from datetime import date, datetime
from typing import Literal, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

_HOSTED_RELATIVE = re.compile(r"^/api/public/profile-images/[a-f0-9]{32}\.jpg$")

def validate_optional_profile_image_url(v: Optional[str]) -> Optional[str]:
    """http(s) URL or platform-hosted avatar path; rejects data: / script schemes."""
    if v is None:
        return None
    s = v.strip()
    if not s:
        return None
    low = s.lower()
    if low.startswith("data:") or low.startswith("javascript:") or low.startswith("vbscript:"):
        raise ValueError("Data URLs and non-HTTP schemes are not allowed")
    if _HOSTED_RELATIVE.fullmatch(s):
        return s
    parsed = urlparse(s)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Profile image must be an http(s) URL or a hosted platform path")
    if not parsed.netloc:
        raise ValueError("Invalid profile image URL")
    return s

class Token(BaseModel):
    """JWT Token response."""
    access_token: str
    token_type: str
    session_id: Optional[str] = None
    impersonation: bool = False
    actor_admin_id: Optional[int] = None
    impersonated_user_id: Optional[int] = None

class TokenData(BaseModel):
    """Data extracted from JWT."""
    username: Optional[str] = None
    role: Optional[str] = None
    session_id: Optional[str] = None
    actor_admin_id: Optional[int] = None
    scopes: list[str] = Field(default_factory=list)

class UserBase(BaseModel):
    """Base user attributes."""
    username: str = Field(min_length=3, max_length=128)
    role: str = Field(
        pattern="^(admin|supervisor|head_nurse|observer|patient)$",
        default="observer",
    )
    is_active: bool = True
    caregiver_id: Optional[int] = None
    patient_id: Optional[int] = None
    profile_image_url: str = Field(default="", max_length=8192)

    @field_validator("profile_image_url")
    @classmethod
    def validate_profile_image_url(cls, v: str) -> str:
        normalized = validate_optional_profile_image_url(v)
        return normalized or ""

class UserCreate(UserBase):
    """Attributes when creating a new user."""
    password: str = Field(min_length=6, max_length=128)

class UserUpdate(BaseModel):
    """Attributes when updating a user."""
    username: Optional[str] = Field(None, min_length=3, max_length=128)
    password: Optional[str] = Field(None, min_length=6, max_length=128)
    role: Optional[str] = Field(
        None, pattern="^(admin|supervisor|head_nurse|observer|patient)$"
    )
    is_active: Optional[bool] = None
    caregiver_id: Optional[int] = None
    patient_id: Optional[int] = None
    profile_image_url: Optional[str] = Field(None, max_length=8192)

    @field_validator("profile_image_url")
    @classmethod
    def validate_profile_image_url(cls, v: Optional[str]) -> Optional[str]:
        return validate_optional_profile_image_url(v)

class MePatch(BaseModel):
    """Self-service profile update (PATCH /api/auth/me). Only fields listed here apply."""

    profile_image_url: Optional[str] = Field(None, max_length=8192)

    @field_validator("profile_image_url")
    @classmethod
    def validate_profile_image_url(cls, v: Optional[str]) -> Optional[str]:
        return validate_optional_profile_image_url(v)

class SelfCaregiverProfilePatch(BaseModel):
    first_name: Optional[str] = Field(default=None, max_length=64)
    last_name: Optional[str] = Field(default=None, max_length=64)
    employee_code: Optional[str] = Field(default=None, max_length=32)
    department: Optional[str] = Field(default=None, max_length=64)
    employment_type: Optional[str] = Field(default=None, max_length=32)
    specialty: Optional[str] = Field(default=None, max_length=64)
    license_number: Optional[str] = Field(default=None, max_length=64)
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=128)
    emergency_contact_name: Optional[str] = Field(default=None, max_length=128)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=32)
    photo_url: Optional[str] = Field(default=None, max_length=256)

class SelfPatientProfilePatch(BaseModel):
    first_name: Optional[str] = Field(default=None, max_length=64)
    last_name: Optional[str] = Field(default=None, max_length=64)
    nickname: Optional[str] = Field(default=None, max_length=32)
    date_of_birth: Optional[date] = None
    gender: Optional[str] = Field(default=None, max_length=10)
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    blood_type: Optional[str] = Field(default=None, max_length=4)
    allergies: Optional[list[str]] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = Field(default=None, max_length=256)

class SelfUserProfilePatch(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=128)
    profile_image_url: Optional[str] = Field(default=None, max_length=8192)
    email: Optional[str] = Field(default=None, max_length=128)
    phone: Optional[str] = Field(default=None, max_length=20)

    @field_validator("profile_image_url")
    @classmethod
    def validate_profile_image_url(cls, v: Optional[str]) -> Optional[str]:
        return validate_optional_profile_image_url(v)

class AuthMeProfilePatch(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=128)
    profile_image_url: Optional[str] = Field(default=None, max_length=8192)
    caregiver: Optional[SelfCaregiverProfilePatch] = None
    patient: Optional[SelfPatientProfilePatch] = None
    user: Optional[SelfUserProfilePatch] = None
    linked_caregiver: Optional[SelfCaregiverProfilePatch] = None
    linked_patient: Optional[SelfPatientProfilePatch] = None

    @field_validator("profile_image_url")
    @classmethod
    def validate_profile_image_url(cls, v: Optional[str]) -> Optional[str]:
        return validate_optional_profile_image_url(v)

class UserOut(UserBase):
    """User response model."""
    id: int
    workspace_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AuthMeOut(UserOut):
    """Current authenticated user, with optional impersonation context."""

    impersonation: bool = False
    impersonated_by_user_id: Optional[int] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class AuthHydrateOut(BaseModel):
    """Browser-friendly session probe: always HTTP 200, never 401 for missing/invalid tokens."""

    authenticated: bool
    user: Optional[AuthMeOut] = None


class LinkedCaregiverProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    first_name: str
    last_name: str
    role: str
    employee_code: str
    department: str
    employment_type: str
    specialty: str
    license_number: str
    phone: str
    email: str
    emergency_contact_name: str
    emergency_contact_phone: str
    photo_url: str
    is_active: bool

class LinkedPatientProfileOut(BaseModel):
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
    allergies: list[str]
    notes: str
    photo_url: str
    is_active: bool

class AuthMeProfileOut(BaseModel):
    user: AuthMeOut
    linked_caregiver: Optional[LinkedCaregiverProfileOut] = None
    linked_patient: Optional[LinkedPatientProfileOut] = None

class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=6, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)

class ImpersonationStart(BaseModel):
    """Request body for admin act-as token creation."""

    target_user_id: int


class AuthSessionOut(BaseModel):
    """Server-tracked auth session visible to the signed-in user."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_agent: str
    ip_address: str
    impersonated_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    current: bool = False

class UserSearchOut(BaseModel):
    """Search result shape for person-target assignment controls."""
    id: int
    username: str
    role: str
    is_active: bool = True
    caregiver_id: Optional[int] = None
    patient_id: Optional[int] = None
    kind: Literal["staff", "patient", "unlinked"]
    linked_name: Optional[str] = None
    employee_code: Optional[str] = None
    display_name: str
