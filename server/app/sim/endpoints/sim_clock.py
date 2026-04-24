"""Sim clock admin endpoints (simulator-mode only).

Lets the `/admin/demo-control` UI advance or rewind time during a demo so
EaseAI "what happened in the last hour" and task reminder flows can be
exercised without waiting wall-clock time.
"""

from __future__ import annotations

import os
from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.dependencies import RequireRole
from app.sim.services.sim_clock import sim_clock

router = APIRouter()


class ClockStateOut(BaseModel):
    enabled: bool
    now: str
    speed: float
    anchor_real: str
    anchor_sim: str


class ClockSetIn(BaseModel):
    offset_seconds: float | None = Field(default=None, description="Shift simulated time (positive = forward)")
    speed: float | None = Field(default=None, gt=0, description="Simulated seconds per real second")
    reset: bool = False
    enable: bool | None = Field(default=None, description="Toggle SIM_CLOCK_ENABLED env var")


@router.get("", response_model=ClockStateOut)
async def get_clock() -> ClockStateOut:
    return ClockStateOut(**sim_clock.snapshot())


@router.post("", response_model=ClockStateOut)
async def set_clock(
    body: ClockSetIn = Body(...),
    _=Depends(RequireRole(["admin", "head_nurse"])),
) -> ClockStateOut:
    if body.enable is not None:
        os.environ["SIM_CLOCK_ENABLED"] = "1" if body.enable else "0"
    if body.reset:
        sim_clock.reset()
    if body.offset_seconds is not None:
        sim_clock.set_offset(body.offset_seconds)
    if body.speed is not None:
        sim_clock.set_speed(body.speed)
    return ClockStateOut(**sim_clock.snapshot())


@router.post("/preset/{preset}", response_model=ClockStateOut)
async def apply_preset(
    preset: Literal["plus_1h", "plus_4h", "plus_8h", "reset"],
    _=Depends(RequireRole(["admin", "head_nurse"])),
) -> ClockStateOut:
    if preset == "reset":
        sim_clock.reset()
    elif preset == "plus_1h":
        sim_clock.set_offset(3600)
    elif preset == "plus_4h":
        sim_clock.set_offset(3600 * 4)
    elif preset == "plus_8h":
        sim_clock.set_offset(3600 * 8)
    else:
        raise HTTPException(status_code=400, detail="unknown preset")
    return ClockStateOut(**sim_clock.snapshot())
