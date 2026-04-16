"""Shift checklist persistence — workspace-scoped; per-user template + daily state."""

from __future__ import annotations

from datetime import date
from typing import Literal

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.shift_checklist import ShiftChecklistState
from app.models.shift_checklist_user_template import ShiftChecklistUserTemplate
from app.models.users import User
from app.schemas.shift_checklist import ShiftChecklistItem, ShiftChecklistWorkspaceRowOut


def _percent(items: list[ShiftChecklistItem]) -> int:
    if not items:
        return 0
    done = sum(1 for i in items if i.checked)
    return int(round(100 * done / len(items)))


def default_shift_template() -> list[ShiftChecklistItem]:
    """Canonical default when no per-user template row exists (plain display text; field name remains label_key)."""
    specs: list[tuple[str, str, Literal["shift", "room", "patient"]]] = [
        ("1", "ลงเวลาเข้ากะ", "shift"),
        ("2", "ตรวจอุปกรณ์ฉุกเฉิน", "shift"),
        ("3", "ทบทวนผู้ป่วยที่รับผิดชอบ", "shift"),
        ("4", "ห้อง 101 - ตรวจสัญญาณชีพ", "room"),
        ("5", "ห้อง 102 - ช่วยมื้ออาหาร", "room"),
        ("6", "ห้อง 103 - ตรวจยา", "room"),
        ("7", "บันทึกการสังเกตผู้ป่วย", "patient"),
        ("8", "อัปเดตบันทึกการดูแล", "patient"),
    ]
    return [
        ShiftChecklistItem(id=i, label_key=k, checked=False, category=c)
        for i, k, c in specs
    ]


class ShiftChecklistService:
    @staticmethod
    async def get_me(
        db: AsyncSession,
        workspace_id: int,
        user_id: int,
        shift_date: date,
    ) -> ShiftChecklistState | None:
        res = await db.execute(
            select(ShiftChecklistState).where(
                ShiftChecklistState.workspace_id == workspace_id,
                ShiftChecklistState.user_id == user_id,
                ShiftChecklistState.shift_date == shift_date,
            )
        )
        return res.scalar_one_or_none()

    @staticmethod
    async def get_template_for_user(
        db: AsyncSession,
        workspace_id: int,
        user_id: int,
    ) -> list[ShiftChecklistItem]:
        res = await db.execute(
            select(ShiftChecklistUserTemplate).where(
                ShiftChecklistUserTemplate.workspace_id == workspace_id,
                ShiftChecklistUserTemplate.user_id == user_id,
            )
        )
        row = res.scalar_one_or_none()
        if row is None or not row.items:
            return default_shift_template()
        parsed = [ShiftChecklistItem.model_validate(x) for x in row.items]
        return [
            ShiftChecklistItem(id=x.id, label_key=x.label_key, category=x.category, checked=False)
            for x in parsed
        ]

    @staticmethod
    def merge_template_with_state(
        template: list[ShiftChecklistItem],
        state_items: list | None,
    ) -> list[ShiftChecklistItem]:
        by_id: dict[str, dict] = {}
        if state_items:
            for x in state_items:
                d = x if isinstance(x, dict) else ShiftChecklistItem.model_validate(x).model_dump()
                by_id[str(d["id"])] = d
        out: list[ShiftChecklistItem] = []
        for t in template:
            s = by_id.get(t.id)
            checked = bool(s.get("checked")) if s else False
            out.append(
                ShiftChecklistItem(
                    id=t.id,
                    label_key=t.label_key,
                    category=t.category,
                    checked=checked,
                )
            )
        return out

    @staticmethod
    def validate_put_against_template(
        template: list[ShiftChecklistItem],
        body: list[ShiftChecklistItem],
    ) -> list[ShiftChecklistItem]:
        tmap = {x.id: x for x in template}
        incoming = {x.id: x for x in body}
        if set(incoming.keys()) != set(tmap.keys()):
            raise ValueError("Checklist items must match the template for this user.")
        out: list[ShiftChecklistItem] = []
        for base in template:
            inc = incoming[base.id]
            if inc.label_key != base.label_key or inc.category != base.category:
                raise ValueError("Cannot change checklist row identity via this endpoint.")
            out.append(
                ShiftChecklistItem(
                    id=base.id,
                    label_key=base.label_key,
                    category=base.category,
                    checked=inc.checked,
                )
            )
        return out

    @staticmethod
    async def upsert_me(
        db: AsyncSession,
        workspace_id: int,
        user_id: int,
        shift_date: date,
        items: list[ShiftChecklistItem],
    ) -> ShiftChecklistState:
        payload = [i.model_dump() for i in items]
        existing = await ShiftChecklistService.get_me(db, workspace_id, user_id, shift_date)
        if existing:
            existing.items = payload
            await db.flush()
            await db.refresh(existing)
            return existing

        row = ShiftChecklistState(
            workspace_id=workspace_id,
            user_id=user_id,
            shift_date=shift_date,
            items=payload,
        )
        db.add(row)
        await db.flush()
        await db.refresh(row)
        return row

    @staticmethod
    async def get_user_template_row(
        db: AsyncSession,
        workspace_id: int,
        user_id: int,
    ) -> ShiftChecklistUserTemplate | None:
        res = await db.execute(
            select(ShiftChecklistUserTemplate).where(
                ShiftChecklistUserTemplate.workspace_id == workspace_id,
                ShiftChecklistUserTemplate.user_id == user_id,
            )
        )
        return res.scalar_one_or_none()

    @staticmethod
    async def upsert_user_template(
        db: AsyncSession,
        workspace_id: int,
        user_id: int,
        items: list[ShiftChecklistItem],
    ) -> ShiftChecklistUserTemplate:
        payload = [
            {
                "id": x.id,
                "label_key": x.label_key,
                "category": x.category,
                "checked": False,
            }
            for x in items
        ]
        existing = await ShiftChecklistService.get_user_template_row(db, workspace_id, user_id)
        if existing:
            existing.items = payload
            await db.flush()
            await db.refresh(existing)
            return existing
        row = ShiftChecklistUserTemplate(
            workspace_id=workspace_id,
            user_id=user_id,
            items=payload,
        )
        db.add(row)
        await db.flush()
        await db.refresh(row)
        return row

    @staticmethod
    async def list_workspace_floor_staff(
        db: AsyncSession,
        workspace_id: int,
        shift_date: date,
    ) -> list[ShiftChecklistWorkspaceRowOut]:
        stmt = (
            select(User, ShiftChecklistState)
            .select_from(User)
            .outerjoin(
                ShiftChecklistState,
                and_(
                    ShiftChecklistState.user_id == User.id,
                    ShiftChecklistState.shift_date == shift_date,
                    ShiftChecklistState.workspace_id == workspace_id,
                ),
            )
            .where(
                User.workspace_id == workspace_id,
                User.is_active.is_(True),
                User.role.in_(["observer", "supervisor"]),
            )
            .order_by(User.username)
        )
        rows = (await db.execute(stmt)).all()
        out: list[ShiftChecklistWorkspaceRowOut] = []
        for user, state in rows:
            template = await ShiftChecklistService.get_template_for_user(db, workspace_id, user.id)
            raw_state = state.items if state is not None else []
            merged = ShiftChecklistService.merge_template_with_state(template, raw_state)
            out.append(
                ShiftChecklistWorkspaceRowOut(
                    user_id=user.id,
                    username=user.username,
                    role=user.role,
                    shift_date=shift_date,
                    items=merged,
                    percent_complete=_percent(merged),
                    updated_at=state.updated_at if state else None,
                )
            )
        return out


shift_checklist_service = ShiftChecklistService()
