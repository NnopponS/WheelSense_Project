from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    ROLE_ALL_AUTHENTICATED,
    RequireRole,
    get_current_user_workspace,
    get_db,
)
from app.models.core import Workspace
from app.models.users import User
from app.schemas.demo_control import (
    DemoActorMoveRequest,
    DemoActorOut,
    DemoControlStateOut,
    DemoResetRequest,
    DemoResetResponse,
    DemoRoomCaptureResponse,
    DemoScenarioResponse,
    DemoScenarioStartRequest,
    DemoScenarioStopRequest,
    DemoWorkflowAdvanceRequest,
    DemoWorkflowAdvanceResponse,
    SimulatorResetResponse,
    SimulatorStatusResponse,
)
from app.services.demo_control import (
    demo_control_service,
    start_demo_scenario,
    stop_demo_scenario,
)

router = APIRouter()


def _bad_request(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@router.get("/state", response_model=DemoControlStateOut)
async def get_demo_control_state(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(["admin"])),
):
    return await demo_control_service.list_actor_state(db, ws.id)


@router.post("/reset", response_model=DemoResetResponse)
async def reset_demo_workspace(
    payload: DemoResetRequest,
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(["admin"])),
):
    if payload.profile != "show-demo":
        raise HTTPException(status_code=400, detail="Only the 'show-demo' profile is supported")

    from scripts.seed_demo import run_seed

    await run_seed(ws.name, True)
    return DemoResetResponse(
        profile=payload.profile,
        status="ok",
        message="Show-demo workspace reset complete",
    )


@router.post("/actors/{actor_type}/{actor_id}/move", response_model=DemoActorOut)
async def move_demo_actor(
    actor_type: str,
    actor_id: int,
    payload: DemoActorMoveRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["admin"])),
):
    try:
        return await demo_control_service.move_actor(
            db,
            ws.id,
            actor_type=actor_type,
            actor_id=actor_id,
            room_id=payload.room_id,
            updated_by_user_id=current_user.id,
            note=payload.note,
        )
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/actors/patient/{actor_id}/fall", response_model=dict)
async def trigger_demo_patient_fall(
    actor_id: int,
    payload: DemoWorkflowAdvanceRequest | None = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["admin"])),
):
    try:
        return await demo_control_service.trigger_alert(
            db,
            ws.id,
            patient_id=actor_id,
            actor_user_id=current_user.id,
            alert_type=(payload.action if payload else "fall") or "fall",
        )
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/patients/{patient_id}/alerts", response_model=dict)
async def trigger_demo_patient_alert(
    patient_id: int,
    payload: DemoWorkflowAdvanceRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["admin"])),
):
    try:
        return await demo_control_service.trigger_alert(
            db,
            ws.id,
            patient_id=patient_id,
            actor_user_id=current_user.id,
            alert_type=payload.action or "fall",
        )
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/workflow/{item_type}/{item_id}/advance", response_model=DemoWorkflowAdvanceResponse)
async def advance_demo_workflow(
    item_type: str,
    item_id: int,
    payload: DemoWorkflowAdvanceRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["admin"])),
):
    try:
        return await demo_control_service.advance_workflow(
            db,
            ws.id,
            item_type=item_type,
            item_id=item_id,
            action=payload.action,
            actor_user_id=current_user.id,
            note=payload.note,
            target_mode=payload.target_mode,
            target_role=payload.target_role,
            target_user_id=payload.target_user_id,
        )
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/workflow/{item_type}/{item_id}/{action}", response_model=DemoWorkflowAdvanceResponse)
async def demo_workflow_action(
    item_type: str,
    item_id: int,
    action: str,
    payload: DemoWorkflowAdvanceRequest | None = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["admin"])),
):
    body = payload or DemoWorkflowAdvanceRequest()
    try:
        return await demo_control_service.advance_workflow(
            db,
            ws.id,
            item_type=item_type,
            item_id=item_id,
            action=action,
            actor_user_id=current_user.id,
            note=body.note,
            target_mode=body.target_mode,
            target_role=body.target_role,
            target_user_id=body.target_user_id,
        )
    except ValueError as exc:
        raise _bad_request(exc) from exc


@router.post("/rooms/{room_id}/capture", response_model=DemoRoomCaptureResponse)
async def capture_demo_room(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(["admin"])),
):
    try:
        result = await demo_control_service.capture_room(db, ws.id, room_id=room_id)
    except ValueError as exc:
        raise _bad_request(exc) from exc
    return DemoRoomCaptureResponse(
        status="success",
        message="Capture requested",
        room_id=room_id,
        node_device_id=result.get("device_id"),
        command_id=result.get("command_id"),
    )


@router.post("/scenarios/{scenario_id}/start", response_model=DemoScenarioResponse)
async def start_scenario(
    scenario_id: str,
    payload: DemoScenarioStartRequest | None = None,
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["admin"])),
):
    body = payload or DemoScenarioStartRequest()
    try:
        started = await start_demo_scenario(ws.id, scenario_id, current_user.id, body.interval_ms)
    except ValueError as exc:
        raise _bad_request(exc) from exc
    return DemoScenarioResponse(
        scenario_id=scenario_id,
        status="running" if started else "already_running",
        message="Scenario started" if started else "Scenario is already running",
    )


@router.post("/scenarios/{scenario_id}/stop", response_model=DemoScenarioResponse)
async def stop_scenario(
    scenario_id: str,
    payload: DemoScenarioStopRequest | None = None,
    ws: Workspace = Depends(get_current_user_workspace),
    __: User = Depends(RequireRole(["admin"])),
):
    _ = payload
    stopped = await stop_demo_scenario(ws.id, scenario_id)
    return DemoScenarioResponse(
        scenario_id=scenario_id,
        status="stopped" if stopped else "not_running",
        message="Scenario stopped" if stopped else "Scenario was not running",
    )


# ── Simulator Environment Endpoints ───────────────────────────────────────────

@router.post("/simulator/reset", response_model=SimulatorResetResponse)
async def reset_simulator_environment(
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(["admin"])),
):
    """Reset the simulator environment to baseline state.
    
    This endpoint is only available in simulator mode (ENV_MODE=simulator).
    It clears all dynamic data and re-seeds the baseline simulator workspace.
    
    Requires admin role.
    """
    from app.config import settings
    from app.services.simulator_reset import reset_simulator_workspace
    
    if not settings.is_simulator_mode:
        raise HTTPException(
            status_code=403,
            detail="Simulator reset is only available in simulator mode (ENV_MODE=simulator)",
        )
    
    result = await reset_simulator_workspace(ws.name)
    return SimulatorResetResponse(
        action=result["action"],
        workspace_id=result["workspace_id"],
        workspace_name=result["workspace_name"],
        cleared_counts=result.get("cleared_counts"),
        message=result["message"],
    )


@router.get("/simulator/status", response_model=SimulatorStatusResponse)
async def get_simulator_environment_status(
    db: AsyncSession = Depends(get_db),
    _ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    """Get the current simulator environment status.
    
    Returns environment mode, workspace info, and statistics.
    Read-only; any authenticated workspace user (used by TopBar for all roles).
    """
    from app.services.simulator_reset import get_simulator_status

    result = await get_simulator_status(db)
    return SimulatorStatusResponse(
        env_mode=result["env_mode"],
        is_simulator=result["is_simulator"],
        workspace_exists=result["workspace_exists"],
        workspace_id=result.get("workspace_id"),
        workspace_name=result.get("workspace_name"),
        statistics=result.get("statistics"),
    )
