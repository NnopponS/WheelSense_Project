"""Shift checklist — observers/supervisors persist; admin & head nurse read workspace view."""

from __future__ import annotations

import re
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import RequireRole, ROLE_CLINICAL_STAFF, get_current_user_workspace, get_db
from app.models.core import Workspace
from app.models.users import User
from app.schemas.shift_checklist import (
    ShiftChecklistItem,
    ShiftChecklistMeOut,
    ShiftChecklistPutIn,
    ShiftChecklistWorkspaceRowOut,
)
from app.services.shift_checklist import shift_checklist_service

router = APIRouter()

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _parse_shift_date(raw: str | None) -> date:
    if raw is None or raw == "":
        return datetime.now(timezone.utc).date()
    if not _DATE_RE.match(raw):
        raise HTTPException(status_code=422, detail="shift_date must be YYYY-MM-DD")
    y, m, d = (int(x) for x in raw.split("-"))
    return date(y, m, d)


@router.get("/me", response_model=ShiftChecklistMeOut)
async def get_my_shift_checklist(
    shift_date: str | None = Query(default=None, description="Calendar date (UTC) YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    d = _parse_shift_date(shift_date)
    row = await shift_checklist_service.get_me(db, ws.id, current_user.id, d)
    items = [ShiftChecklistItem.model_validate(x) for x in (row.items if row else [])]
    return ShiftChecklistMeOut(
        shift_date=d,
        user_id=current_user.id,
        items=items,
        updated_at=row.updated_at if row else None,
    )


@router.put("/me", response_model=ShiftChecklistMeOut)
async def put_my_shift_checklist(
    body: ShiftChecklistPutIn,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    row = await shift_checklist_service.upsert_me(
        db,
        ws.id,
        current_user.id,
        body.shift_date,
        body.items,
    )
    await db.commit()
    items = [ShiftChecklistItem.model_validate(x) for x in row.items]
    return ShiftChecklistMeOut(
        shift_date=row.shift_date,
        user_id=row.user_id,
        items=items,
        updated_at=row.updated_at,
    )


@router.get("/workspace", response_model=list[ShiftChecklistWorkspaceRowOut])
async def list_workspace_shift_checklists(
    shift_date: str | None = Query(default=None, description="Calendar date (UTC) YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(["admin", "head_nurse"])),
):
    d = _parse_shift_date(shift_date)
    return await shift_checklist_service.list_workspace_floor_staff(db, ws.id, d)
