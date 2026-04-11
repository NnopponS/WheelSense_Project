from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ShiftChecklistItem(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    label_key: str = Field(min_length=1, max_length=160)
    checked: bool = False
    category: Literal["shift", "room", "patient"]


class ShiftChecklistMeOut(BaseModel):
    shift_date: date
    user_id: int
    items: list[ShiftChecklistItem]
    updated_at: datetime | None = None


class ShiftChecklistPutIn(BaseModel):
    shift_date: date
    items: list[ShiftChecklistItem] = Field(default_factory=list)

    @field_validator("items")
    @classmethod
    def _limit_items(cls, v: list[ShiftChecklistItem]) -> list[ShiftChecklistItem]:
        if len(v) > 48:
            raise ValueError("Too many checklist items")
        return v


class ShiftChecklistWorkspaceRowOut(BaseModel):
    user_id: int
    username: str
    role: str
    shift_date: date
    items: list[ShiftChecklistItem]
    percent_complete: int = 0
    updated_at: datetime | None = None
