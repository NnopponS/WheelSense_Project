from __future__ import annotations

"""Pydantic schemas for Users and Authentication."""

import re
from datetime import datetime
from typing import Optional
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

class TokenData(BaseModel):
    """Data extracted from JWT."""
    username: Optional[str] = None
    role: Optional[str] = None

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

class UserOut(UserBase):
    """User response model."""
    id: int
    workspace_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UserSearchOut(BaseModel):
    """Search result shape for person-target assignment controls."""
    id: int
    username: str
    role: str
    caregiver_id: Optional[int] = None
    patient_id: Optional[int] = None
    display_name: str
