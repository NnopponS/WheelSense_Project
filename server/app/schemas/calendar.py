from __future__ import annotations

"""Schemas for calendar read projection."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

CalendarEventType = Literal["schedule", "task", "directive", "shift"]


class CalendarEventOut(BaseModel):
    event_id: str
    event_type: CalendarEventType
    source_id: int
    title: str
    description: str = ""
    starts_at: datetime
    ends_at: datetime | None = None
    status: str | None = None
    patient_id: int | None = None
    person_user_id: int | None = None
    person_role: str | None = None
    can_edit: bool
    metadata: dict[str, Any] = Field(default_factory=dict)


class CalendarEventsOut(BaseModel):
    events: list[CalendarEventOut] = Field(default_factory=list)
