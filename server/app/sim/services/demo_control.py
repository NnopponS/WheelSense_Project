from __future__ import annotations

import asyncio
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models import Alert, CareDirective, CareSchedule, CareTask
from app.models.caregivers import CareGiver
from app.models.core import Room
from app.models.care import DemoActorPosition
from app.models.patients import Patient
from app.models.users import User
from app.services import device_management as dm
from app.services.workflow import (
    audit_trail_service,
    care_directive_service,
    care_task_service,
    schedule_service,
)

STAFF_ROLES = {"admin", "head_nurse", "supervisor", "observer"}


def _display_name(user: User, caregiver: CareGiver | None) -> str:
    if caregiver is not None:
        full_name = f"{caregiver.first_name} {caregiver.last_name}".strip()
        if full_name:
            return full_name
    return user.username


def _normalize_actor_type(actor_type: str) -> str:
    normalized = actor_type.strip().lower()
    if normalized == "patient":
        return "patient"
    if normalized in {"staff", "user"}:
        return "staff"
    raise ValueError("actor_type must be 'patient', 'staff', or 'user'")


def _workflow_target(
    *,
    target_mode: str | None,
    target_role: str | None,
    target_user_id: int | None,
) -> tuple[str | None, int | None]:
    if target_mode is None:
        return None, None
    if target_mode == "role":
        if not target_role:
            raise ValueError("target_role is required when target_mode=role")
        return target_role, None
    if target_mode == "user":
        if target_user_id is None:
            raise ValueError("target_user_id is required when target_mode=user")
        return None, target_user_id
    raise ValueError("target_mode must be 'role' or 'user'")


class DemoControlService:
    async def list_actor_state(self, session: AsyncSession, ws_id: int) -> dict:
        rooms = (
            await session.execute(select(Room).where(Room.workspace_id == ws_id))
        ).scalars().all()
        room_by_id = {room.id: room for room in rooms}

        patients = (
            await session.execute(
                select(Patient)
                .where(Patient.workspace_id == ws_id, Patient.is_active.is_(True))
                .order_by(Patient.id)
            )
        ).scalars().all()

        staff_users = (
            await session.execute(
                select(User)
                .where(
                    User.workspace_id == ws_id,
                    User.role.in_(sorted(STAFF_ROLES)),
                    User.is_active.is_(True),
                )
                .order_by(User.role.asc(), User.username.asc())
            )
        ).scalars().all()
        caregiver_ids = {user.caregiver_id for user in staff_users if user.caregiver_id is not None}
        caregivers_by_id: dict[int, CareGiver] = {}
        if caregiver_ids:
            caregiver_rows = (
                await session.execute(
                    select(CareGiver).where(
                        CareGiver.workspace_id == ws_id,
                        CareGiver.id.in_(caregiver_ids),
                    )
                )
            ).scalars().all()
            caregivers_by_id = {caregiver.id: caregiver for caregiver in caregiver_rows}

        position_rows = (
            await session.execute(
                select(DemoActorPosition).where(
                    DemoActorPosition.workspace_id == ws_id,
                    or_(
                        DemoActorPosition.actor_type == "staff",
                        DemoActorPosition.actor_type == "user",
                    ),
                )
            )
        ).scalars().all()
        position_by_actor_id = {row.actor_id: row for row in position_rows}

        actors: list[dict] = []
        for patient in patients:
            room = room_by_id.get(patient.room_id or -1)
            actors.append(
                {
                    "actor_type": "patient",
                    "actor_id": patient.id,
                    "display_name": (
                        patient.nickname
                        or f"{patient.first_name} {patient.last_name}".strip()
                        or f"Patient #{patient.id}"
                    ),
                    "role": "patient",
                    "room_id": patient.room_id,
                    "room_name": room.name if room else None,
                    "source": "room_assignment",
                    "updated_at": patient.updated_at,
                }
            )

        for user in staff_users:
            position = position_by_actor_id.get(user.id)
            room = room_by_id.get(position.room_id if position else -1)
            caregiver = caregivers_by_id.get(user.caregiver_id or -1)
            actors.append(
                {
                    "actor_type": "staff",
                    "actor_id": user.id,
                    "display_name": _display_name(user, caregiver),
                    "role": user.role,
                    "room_id": position.room_id if position else None,
                    "room_name": room.name if room else None,
                    "source": position.source if position else "manual",
                    "updated_at": position.updated_at if position else None,
                }
            )

        actors.sort(key=lambda actor: (actor["actor_type"], actor["display_name"]))
        return {"workspace_id": ws_id, "actors": actors}

    async def move_actor(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        actor_type: str,
        actor_id: int,
        room_id: int,
        updated_by_user_id: int,
        note: str = "",
    ) -> dict:
        normalized_type = _normalize_actor_type(actor_type)
        room = await session.get(Room, room_id)
        if room is None or room.workspace_id != ws_id:
            raise ValueError("Room not found in current workspace")

        if normalized_type == "patient":
            patient = await session.get(Patient, actor_id)
            if patient is None or patient.workspace_id != ws_id:
                raise ValueError("Patient not found in current workspace")
            patient.room_id = room_id
            session.add(patient)
            await audit_trail_service.log_event(
                session,
                ws_id,
                actor_user_id=updated_by_user_id,
                domain="demo",
                action="move_patient",
                entity_type="patient",
                entity_id=patient.id,
                patient_id=patient.id,
                details={"room_id": room_id, "note": note},
            )
            await session.commit()
            await session.refresh(patient)
            return {
                "actor_type": "patient",
                "actor_id": patient.id,
                "display_name": (
                    patient.nickname
                    or f"{patient.first_name} {patient.last_name}".strip()
                    or f"Patient #{patient.id}"
                ),
                "role": "patient",
                "room_id": patient.room_id,
                "room_name": room.name,
                "source": "room_assignment",
                "updated_at": patient.updated_at,
            }

        user = await session.get(User, actor_id)
        if user is None or user.workspace_id != ws_id or user.role not in STAFF_ROLES:
            raise ValueError("Staff user not found in current workspace")

        position = (
            await session.execute(
                select(DemoActorPosition).where(
                    DemoActorPosition.workspace_id == ws_id,
                    DemoActorPosition.actor_id == actor_id,
                    or_(
                        DemoActorPosition.actor_type == "staff",
                        DemoActorPosition.actor_type == "user",
                    ),
                )
            )
        ).scalar_one_or_none()
        if position is None:
            position = DemoActorPosition(
                workspace_id=ws_id,
                actor_type="staff",
                actor_id=actor_id,
                room_id=room_id,
                source="manual",
                note=note,
                updated_by_user_id=updated_by_user_id,
            )
            session.add(position)
        else:
            position.actor_type = "staff"
            position.room_id = room_id
            position.note = note
            position.source = "manual"
            position.updated_by_user_id = updated_by_user_id
            session.add(position)

        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=updated_by_user_id,
            domain="demo",
            action="move_staff",
            entity_type="user",
            entity_id=user.id,
            details={"room_id": room_id, "note": note},
        )
        await session.commit()
        await session.refresh(position)

        caregiver = await session.get(CareGiver, user.caregiver_id) if user.caregiver_id else None
        return {
            "actor_type": "staff",
            "actor_id": user.id,
            "display_name": _display_name(user, caregiver),
            "role": user.role,
            "room_id": position.room_id,
            "room_name": room.name,
            "source": position.source,
            "updated_at": position.updated_at,
        }

    async def advance_workflow(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        item_type: str,
        item_id: int,
        action: str,
        actor_user_id: int,
        note: str = "",
        target_mode: str | None = None,
        target_role: str | None = None,
        target_user_id: int | None = None,
    ) -> dict:
        normalized_action = action.strip().lower()
        handoff_role, handoff_user_id = _workflow_target(
            target_mode=target_mode,
            target_role=target_role,
            target_user_id=target_user_id,
        )

        if item_type == "task":
            item = await care_task_service.get(session, ws_id=ws_id, id=item_id)
            if item is None:
                raise ValueError("Task not found")
            if normalized_action == "advance":
                normalized_action = "complete" if item.status == "in_progress" else "start"
            if normalized_action == "claim":
                item = await care_task_service.claim(
                    session,
                    ws_id=ws_id,
                    actor_user_id=actor_user_id,
                    task_id=item_id,
                    note=note,
                )
            elif normalized_action == "handoff":
                item = await care_task_service.handoff(
                    session,
                    ws_id=ws_id,
                    actor_user_id=actor_user_id,
                    task_id=item_id,
                    target_role=handoff_role,
                    target_user_id=handoff_user_id,
                    note=note,
                )
            elif normalized_action == "start":
                item = await care_task_service.update_task(
                    session,
                    ws_id=ws_id,
                    actor_user_id=actor_user_id,
                    task_id=item_id,
                    obj_in={"status": "in_progress"},
                )
            elif normalized_action == "complete":
                item = await care_task_service.update_task(
                    session,
                    ws_id=ws_id,
                    actor_user_id=actor_user_id,
                    task_id=item_id,
                    obj_in={"status": "completed"},
                )
            else:
                raise ValueError("Unsupported task action")
            return {
                "item_type": item_type,
                "item_id": item_id,
                "status": item.status,
                "action": normalized_action,
                "message": f"Task {item.title} updated",
            }

        if item_type == "schedule":
            item = await schedule_service.get(session, ws_id=ws_id, id=item_id)
            if item is None:
                raise ValueError("Schedule not found")
            if normalized_action == "advance":
                normalized_action = "complete"
            if normalized_action == "claim":
                item = await schedule_service.claim(
                    session,
                    ws_id=ws_id,
                    actor_user_id=actor_user_id,
                    schedule_id=item_id,
                    note=note,
                )
            elif normalized_action == "handoff":
                item = await schedule_service.handoff(
                    session,
                    ws_id=ws_id,
                    actor_user_id=actor_user_id,
                    schedule_id=item_id,
                    target_role=handoff_role,
                    target_user_id=handoff_user_id,
                    note=note,
                )
            elif normalized_action == "complete":
                item = await schedule_service.set_status(
                    session,
                    ws_id=ws_id,
                    actor_user_id=actor_user_id,
                    schedule_id=item_id,
                    status="completed",
                )
            elif normalized_action == "cancel":
                item = await schedule_service.set_status(
                    session,
                    ws_id=ws_id,
                    actor_user_id=actor_user_id,
                    schedule_id=item_id,
                    status="cancelled",
                )
            else:
                raise ValueError("Unsupported schedule action")
            return {
                "item_type": item_type,
                "item_id": item_id,
                "status": item.status if item else "unknown",
                "action": normalized_action,
                "message": f"Schedule {item.title if item else item_id} updated",
            }

        if item_type == "directive":
            item = await care_directive_service.get(session, ws_id=ws_id, id=item_id)
            if item is None:
                raise ValueError("Directive not found")
            actor_role = (await session.get(User, actor_user_id)).role if actor_user_id else "admin"
            if normalized_action == "advance":
                normalized_action = "close" if item.status == "acknowledged" else "acknowledge"
            if normalized_action == "claim":
                item = await care_directive_service.claim(
                    session,
                    ws_id=ws_id,
                    actor_user_id=actor_user_id,
                    directive_id=item_id,
                    note=note,
                )
            elif normalized_action == "handoff":
                item = await care_directive_service.handoff(
                    session,
                    ws_id=ws_id,
                    actor_user_id=actor_user_id,
                    directive_id=item_id,
                    target_role=handoff_role,
                    target_user_id=handoff_user_id,
                    note=note,
                )
            elif normalized_action == "acknowledge":
                item = await care_directive_service.acknowledge(
                    session,
                    ws_id=ws_id,
                    actor_user_id=actor_user_id,
                    actor_user_role=actor_role,
                    directive_id=item_id,
                    note=note or "Demo controller acknowledgement",
                )
            elif normalized_action == "close":
                item = await care_directive_service.update(
                    session,
                    ws_id=ws_id,
                    db_obj=item,
                    obj_in={"status": "closed"},
                )
                await audit_trail_service.log_event(
                    session,
                    ws_id,
                    actor_user_id=actor_user_id,
                    domain="directive",
                    action="close",
                    entity_type="care_directive",
                    entity_id=item.id,
                    patient_id=item.patient_id,
                    details={"source": "demo_control", "note": note},
                )
                await session.commit()
                await session.refresh(item)
            else:
                raise ValueError("Unsupported directive action")
            return {
                "item_type": item_type,
                "item_id": item_id,
                "status": item.status if item else "unknown",
                "action": normalized_action,
                "message": f"Directive {item.title if item else item_id} updated",
            }

        raise ValueError("Unsupported workflow item type")

    async def trigger_alert(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        patient_id: int,
        actor_user_id: int,
        alert_type: str = "fall",
    ) -> dict:
        patient = await session.get(Patient, patient_id)
        if patient is None or patient.workspace_id != ws_id:
            raise ValueError("Patient not found")
        room = await session.get(Room, patient.room_id) if patient.room_id else None
        alert = Alert(
            workspace_id=ws_id,
            patient_id=patient.id,
            alert_type=alert_type,
            severity="critical" if alert_type == "fall" else "warning",
            title=f"Demo {alert_type.replace('_', ' ').title()} alert",
            description="Triggered from demo controller",
            data={"room_id": patient.room_id, "room_name": room.name if room else ""},
            status="active",
        )
        session.add(alert)
        await session.flush()
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="demo",
            action="trigger_alert",
            entity_type="alert",
            entity_id=alert.id,
            patient_id=patient.id,
            details={"alert_type": alert_type, "room_id": patient.room_id},
        )
        await session.commit()
        await session.refresh(alert)
        from app.services.mqtt_publish import publish_alert_to_mqtt_background

        publish_alert_to_mqtt_background(alert)
        return {"patient_id": patient.id, "room_id": patient.room_id, "alert_type": alert_type}

    async def capture_room(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        room_id: int,
    ) -> dict:
        room = await session.get(Room, room_id)
        if room is None or room.workspace_id != ws_id:
            raise ValueError("Room not found")
        if not room.node_device_id:
            raise ValueError("Room has no mapped node device")
        return await dm.camera_check_snapshot(session, ws_id, room.node_device_id)


@dataclass
class _ScenarioTask:
    scenario_id: str
    task: asyncio.Task[None]


class DemoScenarioRegistry:
    def __init__(self) -> None:
        self._tasks: dict[tuple[int, str], _ScenarioTask] = {}

    def is_running(self, ws_id: int, scenario_id: str) -> bool:
        row = self._tasks.get((ws_id, scenario_id))
        return row is not None and not row.task.done()

    async def start(self, ws_id: int, scenario_id: str, coro) -> bool:
        key = (ws_id, scenario_id)
        if self.is_running(ws_id, scenario_id):
            return False
        task = asyncio.create_task(coro)
        self._tasks[key] = _ScenarioTask(scenario_id=scenario_id, task=task)

        def _cleanup(_: asyncio.Task[None]) -> None:
            self._tasks.pop(key, None)

        task.add_done_callback(_cleanup)
        return True

    async def stop(self, ws_id: int, scenario_id: str) -> bool:
        key = (ws_id, scenario_id)
        row = self._tasks.get(key)
        if row is None:
            return False
        row.task.cancel()
        try:
            await row.task
        except asyncio.CancelledError:
            pass
        return True


async def _room_ids(session: AsyncSession, ws_id: int) -> list[int]:
    return list(
        (
            await session.execute(
                select(Room.id).where(Room.workspace_id == ws_id).order_by(Room.id.asc())
            )
        )
        .scalars()
        .all()
    )


async def _first_staff_user(session: AsyncSession, ws_id: int, role: str) -> User | None:
    return (
        await session.execute(
            select(User)
            .where(
                User.workspace_id == ws_id,
                User.role == role,
                User.is_active.is_(True),
            )
            .order_by(User.id.asc())
        )
    ).scalar_one_or_none()


async def _list_staff_users(session: AsyncSession, ws_id: int, role: str) -> list[User]:
    return list(
        (
            await session.execute(
                select(User)
                .where(
                    User.workspace_id == ws_id,
                    User.role == role,
                    User.is_active.is_(True),
                )
                .order_by(User.id.asc())
            )
        )
        .scalars()
        .all()
    )


async def _run_show_demo(ws_id: int, actor_user_id: int, interval_ms: int) -> None:
    delay = interval_ms / 1000
    async with AsyncSessionLocal() as session:
        state = await demo_control_service.list_actor_state(session, ws_id)
        patients = [actor for actor in state["actors"] if actor["actor_type"] == "patient"]
        observers = [actor for actor in state["actors"] if actor["actor_type"] == "staff" and actor["role"] == "observer"]
        if not patients or not observers:
            return
        first_patient = patients[0]
        second_patient = patients[1] if len(patients) > 1 else patients[0]
        for index, observer in enumerate(observers[:2]):
            await demo_control_service.move_actor(
                session,
                ws_id,
                actor_type="staff",
                actor_id=observer["actor_id"],
                room_id=patients[index % len(patients)]["room_id"],
                updated_by_user_id=actor_user_id,
                note="show_demo: observer dispatched",
            )

    await asyncio.sleep(delay)

    async with AsyncSessionLocal() as session:
        task = (
            await session.execute(
                select(CareTask).where(CareTask.workspace_id == ws_id).order_by(CareTask.id.asc()).limit(1)
            )
        ).scalar_one_or_none()
        if task is not None:
            await demo_control_service.advance_workflow(
                session,
                ws_id,
                item_type="task",
                item_id=task.id,
                action="start",
                actor_user_id=actor_user_id,
                note="show_demo: task started",
            )

    await asyncio.sleep(delay)

    async with AsyncSessionLocal() as session:
        await demo_control_service.trigger_alert(
            session,
            ws_id,
            patient_id=second_patient["actor_id"],
            actor_user_id=actor_user_id,
            alert_type="fall",
        )

    await asyncio.sleep(delay)

    async with AsyncSessionLocal() as session:
        if first_patient["room_id"] is not None:
            try:
                await demo_control_service.capture_room(session, ws_id, room_id=first_patient["room_id"])
            except ValueError:
                pass

    await asyncio.sleep(delay)

    async with AsyncSessionLocal() as session:
        directive = (
            await session.execute(
                select(CareDirective).where(CareDirective.workspace_id == ws_id).order_by(CareDirective.id.asc()).limit(1)
            )
        ).scalar_one_or_none()
        if directive is not None:
            await demo_control_service.advance_workflow(
                session,
                ws_id,
                item_type="directive",
                item_id=directive.id,
                action="acknowledge",
                actor_user_id=actor_user_id,
                note="show_demo: directive acknowledged",
            )


async def _run_morning_rounds(ws_id: int, actor_user_id: int, interval_ms: int) -> None:
    delay = interval_ms / 1000
    async with AsyncSessionLocal() as session:
        observers = await _list_staff_users(session, ws_id, "observer")
        patients = (
            await session.execute(
                select(Patient)
                .where(Patient.workspace_id == ws_id, Patient.is_active.is_(True))
                .order_by(Patient.id.asc())
            )
        ).scalars().all()
        for index, observer in enumerate(observers):
            if index >= len(patients):
                break
            if patients[index].room_id is None:
                continue
            await demo_control_service.move_actor(
                session,
                ws_id,
                actor_type="staff",
                actor_id=observer.id,
                room_id=patients[index].room_id,
                updated_by_user_id=actor_user_id,
                note="morning_rounds: assigned to occupied room",
            )

    await asyncio.sleep(delay)

    async with AsyncSessionLocal() as session:
        tasks = list(
            (
                await session.execute(
                    select(CareTask)
                    .where(CareTask.workspace_id == ws_id)
                    .order_by(CareTask.id.asc())
                    .limit(2)
                )
            )
            .scalars()
            .all()
        )
        for task in tasks:
            await demo_control_service.advance_workflow(
                session,
                ws_id,
                item_type="task",
                item_id=task.id,
                action="advance",
                actor_user_id=actor_user_id,
                note="morning_rounds: progressed task",
            )


async def _run_handoff_pressure(ws_id: int, actor_user_id: int, interval_ms: int) -> None:
    delay = interval_ms / 1000
    async with AsyncSessionLocal() as session:
        supervisor = await _first_staff_user(session, ws_id, "supervisor")
        if supervisor is None:
            return
        task = (
            await session.execute(
                select(CareTask).where(CareTask.workspace_id == ws_id).order_by(CareTask.id.asc()).limit(1)
            )
        ).scalar_one_or_none()
        if task is not None:
            await demo_control_service.advance_workflow(
                session,
                ws_id,
                item_type="task",
                item_id=task.id,
                action="handoff",
                actor_user_id=actor_user_id,
                note="handoff_pressure: escalated to supervisor",
                target_mode="user",
                target_user_id=supervisor.id,
            )

    await asyncio.sleep(delay)

    async with AsyncSessionLocal() as session:
        schedule = (
            await session.execute(
                select(CareSchedule).where(CareSchedule.workspace_id == ws_id).order_by(CareSchedule.id.asc()).limit(1)
            )
        ).scalar_one_or_none()
        if schedule is not None:
            await demo_control_service.advance_workflow(
                session,
                ws_id,
                item_type="schedule",
                item_id=schedule.id,
                action="handoff",
                actor_user_id=actor_user_id,
                note="handoff_pressure: moved schedule to head nurse",
                target_mode="role",
                target_role="head_nurse",
            )


async def _run_photo_sweep(ws_id: int, actor_user_id: int, interval_ms: int) -> None:
    del actor_user_id
    delay = interval_ms / 1000
    async with AsyncSessionLocal() as session:
        room_ids = await _room_ids(session, ws_id)
    for room_id in room_ids[:3]:
        async with AsyncSessionLocal() as session:
            try:
                await demo_control_service.capture_room(session, ws_id, room_id=room_id)
            except ValueError:
                pass
        await asyncio.sleep(delay)


async def _run_emergency_drill(ws_id: int, actor_user_id: int, interval_ms: int) -> None:
    delay = interval_ms / 1000
    async with AsyncSessionLocal() as session:
        patient = (
            await session.execute(
                select(Patient)
                .where(Patient.workspace_id == ws_id, Patient.is_active.is_(True))
                .order_by(Patient.id.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        supervisor = await _first_staff_user(session, ws_id, "supervisor")
        if patient is None:
            return
        await demo_control_service.trigger_alert(
            session,
            ws_id,
            patient_id=patient.id,
            actor_user_id=actor_user_id,
            alert_type="fall",
        )
        if supervisor is not None and patient.room_id is not None:
            await demo_control_service.move_actor(
                session,
                ws_id,
                actor_type="staff",
                actor_id=supervisor.id,
                room_id=patient.room_id,
                updated_by_user_id=actor_user_id,
                note="emergency_drill: supervisor dispatched",
            )

    await asyncio.sleep(delay)

    async with AsyncSessionLocal() as session:
        directive = (
            await session.execute(
                select(CareDirective).where(CareDirective.workspace_id == ws_id).order_by(CareDirective.id.asc()).limit(1)
            )
        ).scalar_one_or_none()
        if directive is not None:
            await demo_control_service.advance_workflow(
                session,
                ws_id,
                item_type="directive",
                item_id=directive.id,
                action="advance",
                actor_user_id=actor_user_id,
                note="emergency_drill: advanced directive",
            )


demo_control_service = DemoControlService()
demo_scenario_registry = DemoScenarioRegistry()

SCENARIO_RUNNERS = {
    "show-demo": _run_show_demo,
    "ops-walkthrough": _run_show_demo,
    "morning-rounds": _run_morning_rounds,
    "handoff-pressure": _run_handoff_pressure,
    "photo-sweep": _run_photo_sweep,
    "emergency-drill": _run_emergency_drill,
}


async def start_demo_scenario(ws_id: int, scenario_id: str, actor_user_id: int, interval_ms: int) -> bool:
    runner = SCENARIO_RUNNERS.get(scenario_id)
    if runner is None:
        raise ValueError("Unsupported scenario")
    return await demo_scenario_registry.start(
        ws_id,
        scenario_id,
        runner(ws_id, actor_user_id, interval_ms),
    )


async def stop_demo_scenario(ws_id: int, scenario_id: str) -> bool:
    return await demo_scenario_registry.stop(ws_id, scenario_id)
