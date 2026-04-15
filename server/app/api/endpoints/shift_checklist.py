"""Shift checklist — observers/supervisors persist; admin & head nurse read workspace view."""

from __future__ import annotations

import re
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import RequireRole, ROLE_CLINICAL_STAFF, get_current_user_workspace, get_db
from app.models.core import Workspace
from app.models.users import User
from app.schemas.shift_checklist import (
    ShiftChecklistItem,
    ShiftChecklistMeOut,
    ShiftChecklistPutIn,
    ShiftChecklistTemplateOut,
    ShiftChecklistTemplatePutIn,
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


async def _get_same_workspace_user(
    db: AsyncSession,
    workspace_id: int,
    user_id: int,
) -> User:
    res = await db.execute(select(User).where(User.id == user_id, User.workspace_id == workspace_id))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/me", response_model=ShiftChecklistMeOut)
async def get_my_shift_checklist(
    shift_date: str | None = Query(default=None, description="Calendar date (UTC) YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    d = _parse_shift_date(shift_date)
    template = await shift_checklist_service.get_template_for_user(db, ws.id, current_user.id)
    row = await shift_checklist_service.get_me(db, ws.id, current_user.id, d)
    raw_state = row.items if row else []
    merged = shift_checklist_service.merge_template_with_state(template, raw_state)
    return ShiftChecklistMeOut(
        shift_date=d,
        user_id=current_user.id,
        items=merged,
        updated_at=row.updated_at if row else None,
    )


@router.put("/me", response_model=ShiftChecklistMeOut)
async def put_my_shift_checklist(
    body: ShiftChecklistPutIn,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    template = await shift_checklist_service.get_template_for_user(db, ws.id, current_user.id)
    try:
        validated = shift_checklist_service.validate_put_against_template(template, body.items)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row = await shift_checklist_service.upsert_me(
        db,
        ws.id,
        current_user.id,
        body.shift_date,
        validated,
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


@router.get("/users/{user_id}/template", response_model=ShiftChecklistTemplateOut)
async def get_user_shift_checklist_template(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(["admin", "head_nurse"])),
):
    await _get_same_workspace_user(db, ws.id, user_id)
    items = await shift_checklist_service.get_template_for_user(db, ws.id, user_id)
    tpl_row = await shift_checklist_service.get_user_template_row(db, ws.id, user_id)
    return ShiftChecklistTemplateOut(
        user_id=user_id,
        items=items,
        updated_at=tpl_row.updated_at if tpl_row else None,
    )


@router.put("/users/{user_id}/template", response_model=ShiftChecklistTemplateOut)
async def put_user_shift_checklist_template(
    user_id: int,
    body: ShiftChecklistTemplatePutIn,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(["admin", "head_nurse"])),
):
    target = await _get_same_workspace_user(db, ws.id, user_id)
    if target.role not in ("observer", "supervisor"):
        raise HTTPException(
            status_code=400,
            detail="Shift checklist templates apply to observer or supervisor accounts.",
        )
    raw = body.items
    if not raw:
        raise HTTPException(status_code=400, detail="At least one checklist item is required.")
    ids = [x.id for x in raw]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Duplicate checklist item ids.")
    normalized = [
        ShiftChecklistItem(
            id=x.id,
            label_key=x.label_key.strip(),
            category=x.category,
            checked=False,
        )
        for x in raw
    ]
    for x in normalized:
        if not x.label_key:
            raise HTTPException(status_code=400, detail="label_key must be non-empty for each item.")
    row = await shift_checklist_service.upsert_user_template(db, ws.id, user_id, normalized)
    await db.commit()
    items = await shift_checklist_service.get_template_for_user(db, ws.id, user_id)
    return ShiftChecklistTemplateOut(user_id=user_id, items=items, updated_at=row.updated_at)
