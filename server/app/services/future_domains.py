from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

"""Service-layer helpers for floorplans, specialists, prescriptions, and pharmacy."""

import secrets
from pathlib import Path

from pydantic import BaseModel
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.activity import Alert
from app.models.caregivers import CareGiver
from app.models.core import Device, Room, SmartDevice
from app.models.future_domains import (
    DemoActorPosition,
    FloorplanAsset,
    FloorplanLayout,
    PharmacyOrder,
    Prescription,
    Specialist,
)
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.telemetry import PhotoRecord, RoomPrediction
from app.models.users import User
from app.schemas.future_domains import (
    PharmacyOrderCreate,
    PharmacyOrderUpdate,
    PrescriptionCreate,
    PrescriptionUpdate,
    SpecialistCreate,
    SpecialistUpdate,
)
from app.services.base import CRUDBase

CAREGIVER_SPECIALIST_NOTE_PREFIX = "synced_from_caregiver:"


def _caregiver_specialist_note(caregiver_id: int) -> str:
    return f"{CAREGIVER_SPECIALIST_NOTE_PREFIX}{caregiver_id}"


class SpecialistService(CRUDBase[Specialist, SpecialistCreate, SpecialistUpdate]):
    async def list_from_caregivers(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        limit: int = 200,
    ) -> list[Specialist]:
        caregivers = list(
            (
                await session.execute(
                    select(CareGiver)
                    .where(
                        CareGiver.workspace_id == ws_id,
                        CareGiver.role == "supervisor",
                    )
                    .order_by(CareGiver.id)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        if not caregivers:
            return []

        notes = [_caregiver_specialist_note(caregiver.id) for caregiver in caregivers]
        existing = list(
            (
                await session.execute(
                    select(Specialist).where(
                        Specialist.workspace_id == ws_id,
                        Specialist.notes.in_(notes),
                    )
                )
            )
            .scalars()
            .all()
        )
        by_note = {specialist.notes: specialist for specialist in existing}
        synced: list[Specialist] = []
        changed = False

        for caregiver in caregivers:
            note = _caregiver_specialist_note(caregiver.id)
            row = by_note.get(note)
            if row is None:
                row = Specialist(workspace_id=ws_id, notes=note)
                session.add(row)
                changed = True

            values = {
                "first_name": caregiver.first_name,
                "last_name": caregiver.last_name,
                "specialty": caregiver.specialty or caregiver.role,
                "license_number": caregiver.license_number or caregiver.employee_code or None,
                "phone": caregiver.phone or None,
                "email": caregiver.email or None,
                "is_active": bool(caregiver.is_active),
            }
            for field, value in values.items():
                if getattr(row, field) != value:
                    setattr(row, field, value)
                    changed = True
            synced.append(row)

        if changed:
            await session.commit()
            for row in synced:
                await session.refresh(row)

        return synced

class PrescriptionService(CRUDBase[Prescription, PrescriptionCreate, PrescriptionUpdate]):
    async def list_for_patient(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        patient_id: Optional[int] = None,
        status: Optional[str] = None,
        visible_patient_ids: set[int] | None = None,
        limit: int = 100,
    ) -> list[Prescription]:
        stmt = select(Prescription).where(Prescription.workspace_id == ws_id)
        if visible_patient_ids is not None:
            if not visible_patient_ids:
                return []
            stmt = stmt.where(Prescription.patient_id.in_(visible_patient_ids))
        if patient_id is not None:
            stmt = stmt.where(Prescription.patient_id == patient_id)
        if status:
            stmt = stmt.where(Prescription.status == status)
        stmt = stmt.order_by(Prescription.created_at.desc()).limit(limit)
        result = await session.execute(stmt)
        return list(result.scalars().all())

class PharmacyOrderService(CRUDBase[PharmacyOrder, PharmacyOrderCreate, PharmacyOrderUpdate]):
    async def list_orders(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        patient_id: Optional[int] = None,
        prescription_id: Optional[int] = None,
        status: Optional[str] = None,
        visible_patient_ids: set[int] | None = None,
        limit: int = 100,
    ) -> list[PharmacyOrder]:
        stmt = select(PharmacyOrder).where(PharmacyOrder.workspace_id == ws_id)
        if visible_patient_ids is not None:
            if not visible_patient_ids:
                return []
            stmt = stmt.where(PharmacyOrder.patient_id.in_(visible_patient_ids))
        if patient_id is not None:
            stmt = stmt.where(PharmacyOrder.patient_id == patient_id)
        if prescription_id is not None:
            stmt = stmt.where(PharmacyOrder.prescription_id == prescription_id)
        if status:
            stmt = stmt.where(PharmacyOrder.status == status)
        stmt = stmt.order_by(PharmacyOrder.requested_at.desc()).limit(limit)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def create_patient_request(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        patient_id: int,
        prescription_id: int,
        pharmacy_name: str,
        quantity: int,
        notes: str,
    ) -> PharmacyOrder:
        prescription = await prescription_service.get(session, ws_id=ws_id, id=prescription_id)
        if not prescription or prescription.patient_id != patient_id:
            raise ValueError("Prescription not found for this patient")
        if prescription.status != "active":
            raise ValueError("Prescription is not active")

        now = datetime.now(timezone.utc)
        order_number = f"REQ-{patient_id}-{prescription_id}-{now.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3)}"
        payload = PharmacyOrderCreate(
            prescription_id=prescription_id,
            patient_id=patient_id,
            order_number=order_number,
            pharmacy_name=pharmacy_name,
            quantity=quantity,
            refills_remaining=0,
            status="pending",
            notes=notes,
        )
        return await self.create(session, ws_id=ws_id, obj_in=payload)

class FloorplanPresenceService:
    @staticmethod
    def _seconds_since(value: datetime | None, now: datetime) -> int | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return max(int((now - value).total_seconds()), 0)

    async def build_presence(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        facility_id: int,
        floor_id: int,
        visible_patient_ids: set[int] | None = None,
        filter_to_visible_rooms: bool = False,
    ) -> dict:
        now = datetime.now(timezone.utc)
        layout = await FloorplanLayoutService.get_for_scope(session, ws_id, facility_id, floor_id)
        layout_room_ids: set[int] = set()
        if layout and isinstance(layout.layout_json, dict):
            for item in layout.layout_json.get("rooms", []):
                if not isinstance(item, dict):
                    continue
                raw_id = str(item.get("id", ""))
                if raw_id.startswith("room-") and raw_id.removeprefix("room-").isdigit():
                    layout_room_ids.add(int(raw_id.removeprefix("room-")))

        rooms = list(
            (
                await session.execute(
                    select(Room)
                    .where(Room.workspace_id == ws_id, Room.floor_id == floor_id)
                    .order_by(Room.id)
                )
            )
            .scalars()
            .all()
        )
        room_ids = {room.id for room in rooms}

        node_device_ids = [room.node_device_id for room in rooms if room.node_device_id]
        device_by_id: dict[str, Device] = {}
        if node_device_ids:
            devices = await session.execute(
                select(Device).where(
                    Device.workspace_id == ws_id,
                    Device.device_id.in_(node_device_ids),
                )
            )
            device_by_id = {device.device_id: device for device in devices.scalars().all()}

        patient_by_room: dict[int, Patient] = {}
        if room_ids:
            patient_stmt = select(Patient).where(
                Patient.workspace_id == ws_id,
                Patient.room_id.in_(room_ids),
                Patient.is_active.is_(True),
            )
            if visible_patient_ids is not None:
                if not visible_patient_ids:
                    patient_stmt = patient_stmt.where(Patient.id == -1)
                else:
                    patient_stmt = patient_stmt.where(Patient.id.in_(visible_patient_ids))
            patients = await session.execute(patient_stmt)
            for patient in patients.scalars().all():
                if patient.room_id is not None:
                    patient_by_room.setdefault(patient.room_id, patient)

        latest_prediction_by_room: dict[int, RoomPrediction] = {}
        if room_ids:
            predictions = await session.execute(
                select(RoomPrediction)
                .where(
                    RoomPrediction.workspace_id == ws_id,
                    RoomPrediction.predicted_room_id.in_(room_ids),
                )
                .order_by(desc(RoomPrediction.timestamp))
                .limit(500)
            )
            for prediction in predictions.scalars().all():
                if prediction.predicted_room_id is not None:
                    latest_prediction_by_room.setdefault(prediction.predicted_room_id, prediction)

        assignment_by_device: dict[str, PatientDeviceAssignment] = {}
        assignments = await session.execute(
            select(PatientDeviceAssignment).where(
                PatientDeviceAssignment.workspace_id == ws_id,
                PatientDeviceAssignment.is_active.is_(True),
            )
        )
        for assignment in assignments.scalars().all():
            if visible_patient_ids is not None and assignment.patient_id not in visible_patient_ids:
                continue
            assignment_by_device.setdefault(assignment.device_id, assignment)

        room_alert_counts: dict[int, int] = {room_id: 0 for room_id in room_ids}
        if room_ids:
            alert_rows = await session.execute(
                select(Alert).where(
                    Alert.workspace_id == ws_id,
                    Alert.status == "active",
                )
            )
            visible_patient_room_ids = {
                patient.id: patient.room_id for patient in patient_by_room.values() if patient.room_id is not None
            }
            for alert in alert_rows.scalars().all():
                room_id = None
                if alert.patient_id is not None:
                    room_id = visible_patient_room_ids.get(alert.patient_id)
                if room_id is None and isinstance(alert.data, dict):
                    raw_room_id = alert.data.get("room_id")
                    if isinstance(raw_room_id, int):
                        room_id = raw_room_id
                if room_id in room_alert_counts:
                    room_alert_counts[room_id] += 1

        smart_devices_by_room: dict[int, list[SmartDevice]] = {room_id: [] for room_id in room_ids}
        if room_ids:
            smart_devices = await session.execute(
                select(SmartDevice).where(
                    SmartDevice.workspace_id == ws_id,
                    SmartDevice.room_id.in_(room_ids),
                )
            )
            for device in smart_devices.scalars().all():
                if device.room_id is not None:
                    smart_devices_by_room.setdefault(device.room_id, []).append(device)

        latest_photo_by_device: dict[str, PhotoRecord] = {}
        if node_device_ids:
            photo_rows = await session.execute(
                select(PhotoRecord)
                .where(
                    PhotoRecord.workspace_id == ws_id,
                    PhotoRecord.device_id.in_(node_device_ids),
                )
                .order_by(PhotoRecord.timestamp.desc())
                .limit(500)
            )
            for photo in photo_rows.scalars().all():
                latest_photo_by_device.setdefault(photo.device_id, photo)

        staff_positions_by_room: dict[int, list[dict]] = {room_id: [] for room_id in room_ids}
        if room_ids:
            positions = await session.execute(
                select(DemoActorPosition).where(
                    DemoActorPosition.workspace_id == ws_id,
                    DemoActorPosition.room_id.in_(room_ids),
                    or_(
                        DemoActorPosition.actor_type == "staff",
                        DemoActorPosition.actor_type == "user",
                    ),
                )
            )
            position_rows = list(positions.scalars().all())
            staff_user_ids = {row.actor_id for row in position_rows}
            staff_people: dict[int, User] = {}
            caregiver_by_id: dict[int, CareGiver] = {}
            if staff_user_ids:
                user_rows = await session.execute(
                    select(User).where(
                        User.workspace_id == ws_id,
                        User.id.in_(staff_user_ids),
                        User.is_active.is_(True),
                    )
                )
                users = list(user_rows.scalars().all())
                staff_people = {user.id: user for user in users}
                caregiver_ids = {user.caregiver_id for user in users if user.caregiver_id is not None}
                if caregiver_ids:
                    caregivers = await session.execute(
                        select(CareGiver).where(
                            CareGiver.workspace_id == ws_id,
                            CareGiver.id.in_(caregiver_ids),
                        )
                    )
                    caregiver_by_id = {caregiver.id: caregiver for caregiver in caregivers.scalars().all()}
            for position in position_rows:
                user = staff_people.get(position.actor_id)
                if user is None or position.room_id is None:
                    continue
                caregiver = caregiver_by_id.get(user.caregiver_id or -1)
                display_name = user.username
                if caregiver is not None:
                    display_name = f"{caregiver.first_name} {caregiver.last_name}".strip() or user.username
                staff_positions_by_room.setdefault(position.room_id, []).append(
                    {
                        "actor_type": "staff",
                        "actor_id": position.actor_id,
                        "display_name": display_name,
                        "subtitle": caregiver.role if caregiver and caregiver.role else user.role,
                        "role": user.role,
                        "user_id": user.id,
                        "caregiver_id": user.caregiver_id,
                        "room_id": position.room_id,
                        "source": position.source or "manual_control",
                        "updated_at": position.updated_at,
                    }
                )

        rows = []
        for room in rooms:
            sources: list[str] = []
            if room.id in layout_room_ids:
                sources.append("layout")

            node_status = "unmapped"
            if room.node_device_id:
                sources.append("node")
                device = device_by_id.get(room.node_device_id)
                if device is None:
                    node_status = "unknown"
                else:
                    last_seen_age = self._seconds_since(device.last_seen, now)
                    node_status = "online" if last_seen_age is not None and last_seen_age <= 300 else "stale"

            patient = patient_by_room.get(room.id)
            patient_hint = None
            occupants: list[dict] = []
            if patient is not None:
                sources.append("assignment")
                patient_hint = {
                    "patient_id": patient.id,
                    "first_name": patient.first_name,
                    "last_name": patient.last_name,
                    "nickname": patient.nickname or "",
                    "source": "room_assignment",
                }
                occupants.append(
                    {
                        "actor_type": "patient",
                        "actor_id": patient.id,
                        "display_name": (
                            patient.nickname
                            or f"{patient.first_name} {patient.last_name}".strip()
                            or f"Patient #{patient.id}"
                        ),
                        "subtitle": patient.care_level,
                        "patient_id": patient.id,
                        "room_id": room.id,
                        "source": "room_assignment",
                        "updated_at": patient.updated_at,
                    }
                )

            staff_occupants = staff_positions_by_room.get(room.id, [])
            if staff_occupants:
                sources.append("manual_staff_presence")
                occupants.extend(staff_occupants)

            prediction = latest_prediction_by_room.get(room.id)
            prediction_hint = None
            confidence = 0.0
            staleness_seconds = None
            if prediction is not None:
                assignment = assignment_by_device.get(prediction.device_id)
                if visible_patient_ids is not None and (
                    assignment is None or assignment.patient_id not in visible_patient_ids
                ):
                    prediction = None
            if prediction is not None:
                sources.append("prediction")
                staleness_seconds = self._seconds_since(prediction.timestamp, now) or 0
                confidence = float(prediction.confidence or 0.0)
                assignment = assignment_by_device.get(prediction.device_id)
                prediction_hint = {
                    "device_id": prediction.device_id,
                    "patient_id": assignment.patient_id if assignment else None,
                    "predicted_room_id": prediction.predicted_room_id,
                    "predicted_room_name": prediction.predicted_room_name or "",
                    "confidence": confidence,
                    "computed_at": prediction.timestamp,
                    "staleness_seconds": staleness_seconds,
                }

            smart_devices_summary = [
                {
                    "id": device.id,
                    "name": device.name,
                    "device_type": device.device_type,
                    "ha_entity_id": device.ha_entity_id,
                    "state": device.state or "unknown",
                    "is_active": bool(device.is_active),
                }
                for device in smart_devices_by_room.get(room.id, [])
            ]

            photo = latest_photo_by_device.get(room.node_device_id or "")
            camera_summary = {
                "device_id": room.node_device_id,
                "latest_photo_id": photo.id if photo else None,
                "latest_photo_url": f"/api/cameras/photos/{photo.id}/content" if photo else None,
                "captured_at": photo.timestamp if photo else None,
                "capture_available": bool(room.node_device_id),
            }

            row = {
                "room_id": room.id,
                "room_name": room.name,
                "floor_id": room.floor_id,
                "node_device_id": room.node_device_id,
                "node_status": node_status,
                "patient_hint": patient_hint,
                "occupants": occupants,
                "alert_count": room_alert_counts.get(room.id, 0),
                "smart_devices_summary": smart_devices_summary,
                "camera_summary": camera_summary,
                "prediction_hint": prediction_hint,
                "confidence": confidence,
                "computed_at": now,
                "staleness_seconds": staleness_seconds,
                "sources": sources,
            }
            if not filter_to_visible_rooms or patient_hint is not None or prediction_hint is not None:
                rows.append(row)

        return {"facility_id": facility_id, "floor_id": floor_id, "computed_at": now, "rooms": rows}

class _FloorplanCreate(BaseModel):
    pass

class _FloorplanUpdate(BaseModel):
    pass

class FloorplanService(CRUDBase[FloorplanAsset, _FloorplanCreate, _FloorplanUpdate]):
    @staticmethod
    def build_storage_root() -> Path:
        root = Path(settings.floorplan_storage_dir).resolve()
        root.mkdir(parents=True, exist_ok=True)
        return root

    async def create_asset(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        name: str,
        mime_type: str,
        payload: bytes,
        facility_id: Optional[int],
        floor_id: Optional[int],
        width: Optional[int],
        height: Optional[int],
        uploaded_by_user_id: int,
    ) -> FloorplanAsset:
        storage_root = self.build_storage_root()
        suffix = ".bin"
        if "/" in mime_type:
            guessed = mime_type.split("/")[-1].strip()
            if guessed:
                suffix = f".{guessed}"
        filename = f"{ws_id}_{secrets.token_hex(10)}{suffix}"
        target = storage_root / filename
        target.write_bytes(payload)

        db_obj = FloorplanAsset(
            workspace_id=ws_id,
            facility_id=facility_id,
            floor_id=floor_id,
            name=name,
            mime_type=mime_type,
            size_bytes=len(payload),
            storage_path=str(target),
            width=width,
            height=height,
            extra={},
            uploaded_by_user_id=uploaded_by_user_id,
        )
        session.add(db_obj)
        await session.commit()
        await session.refresh(db_obj)
        return db_obj

class FloorplanLayoutService:
    """Persist interactive floorplan JSON per facility floor."""

    @staticmethod
    async def get_for_scope(
        session: AsyncSession,
        ws_id: int,
        facility_id: int,
        floor_id: int,
    ) -> FloorplanLayout | None:
        stmt = select(FloorplanLayout).where(
            FloorplanLayout.workspace_id == ws_id,
            FloorplanLayout.facility_id == facility_id,
            FloorplanLayout.floor_id == floor_id,
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def upsert(
        session: AsyncSession,
        ws_id: int,
        facility_id: int,
        floor_id: int,
        layout_dict: dict,
    ) -> FloorplanLayout:
        existing = await FloorplanLayoutService.get_for_scope(
            session, ws_id, facility_id, floor_id
        )
        if existing:
            existing.layout_json = layout_dict
            session.add(existing)
            await session.commit()
            await session.refresh(existing)
            return existing
        row = FloorplanLayout(
            workspace_id=ws_id,
            facility_id=facility_id,
            floor_id=floor_id,
            layout_json=layout_dict,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row

specialist_service = SpecialistService(Specialist)
prescription_service = PrescriptionService(Prescription)
pharmacy_order_service = PharmacyOrderService(PharmacyOrder)
floorplan_service = FloorplanService(FloorplanAsset)
floorplan_presence_service = FloorplanPresenceService()
