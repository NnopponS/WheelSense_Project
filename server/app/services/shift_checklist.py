"""Shift checklist persistence — workspace-scoped, one row per user per day."""

from __future__ import annotations

from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.shift_checklist import ShiftChecklistState
from app.models.users import User
from app.schemas.shift_checklist import ShiftChecklistItem, ShiftChecklistWorkspaceRowOut


def _percent(items: list[ShiftChecklistItem]) -> int:
    if not items:
        return 0
    done = sum(1 for i in items if i.checked)
    return int(round(100 * done / len(items)))


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
    async def upsert_me(
        db: AsyncSession,
        workspace_id: int,
        user_id: int,
        shift_date: date,
        items: list[ShiftChecklistItem],
    ) -> ShiftChecklistState:
        payload = [i.model_dump() for i in items]
        # SQLite tests: merge via SELECT then INSERT/UPDATE
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
            raw_items = state.items if state is not None else []
            items = [ShiftChecklistItem.model_validate(x) for x in raw_items]
            out.append(
                ShiftChecklistWorkspaceRowOut(
                    user_id=user.id,
                    username=user.username,
                    role=user.role,
                    shift_date=shift_date,
                    items=items,
                    percent_complete=_percent(items),
                    updated_at=state.updated_at if state else None,
                )
            )
        return out


shift_checklist_service = ShiftChecklistService()
