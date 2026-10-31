from __future__ import annotations

from pydantic import BaseModel, Field


class ClearDatabaseBody(BaseModel):
    password: str = Field(..., min_length=1, description="Current admin account password")


class ClearDatabaseResult(BaseModel):
    message: str
    preserved_user_id: int
    new_workspace_id: int
    preserved_username: str
