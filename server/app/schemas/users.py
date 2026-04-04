"""Pydantic schemas for Users and Authentication."""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


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


class UserCreate(UserBase):
    """Attributes when creating a new user."""
    password: str = Field(min_length=6, max_length=128)


class UserUpdate(BaseModel):
    """Attributes when updating a user."""
    password: Optional[str] = Field(None, min_length=6, max_length=128)
    role: Optional[str] = Field(
        None, pattern="^(admin|supervisor|head_nurse|observer|patient)$"
    )
    is_active: Optional[bool] = None
    caregiver_id: Optional[int] = None
    patient_id: Optional[int] = None


class UserOut(UserBase):
    """User response model."""
    id: int
    workspace_id: int
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
