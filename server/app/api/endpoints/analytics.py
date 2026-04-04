"""Analytics endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import RequireRole, get_current_user_workspace, get_db
from app.models.core import Workspace
from app.models.users import User
from app.schemas.analytics import AlertSummaryOut, VitalsAverageOut, WardSummaryOut
from app.services.analytics import AnalyticsService

router = APIRouter(tags=["Analytics"])


@router.get("/alerts/summary", response_model=AlertSummaryOut)
async def get_alert_summary(
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(
        RequireRole(["admin", "supervisor", "head_nurse", "observer"])
    ),
):
    """Retrieve alert statistics and aggregations."""
    return await AnalyticsService.get_alert_summary(session, ws.id)


@router.get("/vitals/averages", response_model=VitalsAverageOut)
async def get_vitals_averages(
    hours: int = Query(24, description="Hours to look back"),
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(
        RequireRole(["admin", "supervisor", "head_nurse", "observer"])
    ),
):
    """Retrieve average vitals for the workspace."""
    return await AnalyticsService.get_vitals_averages(session, ws.id, hours=hours)


@router.get("/wards/summary", response_model=WardSummaryOut)
async def get_ward_summary(
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["admin", "supervisor", "head_nurse"])),
):
    """Retrieve ward overview statistics."""
    return await AnalyticsService.get_ward_summary(session, ws.id)
