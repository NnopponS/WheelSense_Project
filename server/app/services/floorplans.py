from __future__ import annotations

"""Business logic for floorplan assets, layout, and presence projections."""

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import secrets

from pydantic import BaseModel
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.activity import Alert
from app.models.caregivers import CareGiver
from app.models.care import DemoActorPosition
from app.models.core import Device, Room, SmartDevice
from app.models.floorplans import FloorplanAsset, FloorplanLayout
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.telemetry import PhotoRecord, RoomPrediction
from app.models.users import User
from app.services.base import CRUDBase
from app.services.node_device_alias import resolve_registry_node_device


def _profile_photo_url(value: str | None) -> str | None:
    u = (value or "").strip()
    return u or None


class FloorplanPresenceService:
    LIVE_PREDICTION_WINDOW_SECONDS = 90
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

        room_scope_filters = [Room.floor_id == floor_id]
        if layout_room_ids:
            # Keep presence aligned to the saved floorplan layout even if a room's floor_id
            # is temporarily out of sync during room/node linking flows.
            room_scope_filters.append(Room.id.in_(layout_room_ids))
        rooms = list(
            (
                await session.execute(
                    select(Room)
                    .where(
                        Room.workspace_id == ws_id,
                        or_(*room_scope_filters),
                    )
                    .order_by(Room.id)
                )
            )
            .scalars()
            .all()
        )
        room_ids = {room.id for room in rooms}

        # Latest prediction per device — loaded before patient_by_room so we can expand `rooms`
        # to include predicted_room_id targets. Otherwise live_predicted_room_by_patient is empty
        # when that room row was missing from the floor/layout slice, and assignment wins (wrong room).
        latest_prediction_by_device: dict[str, RoomPrediction] = {}
        predictions_query = await session.execute(
            select(RoomPrediction)
            .where(RoomPrediction.workspace_id == ws_id)
            .order_by(desc(RoomPrediction.timestamp))
            .limit(1000),
        )
        for prediction in predictions_query.scalars().all():
            latest_prediction_by_device.setdefault(prediction.device_id, prediction)

        predicted_room_ids = {
            p.predicted_room_id
            for p in latest_prediction_by_device.values()
            if p.predicted_room_id is not None
        }
        missing_pred_rooms = predicted_room_ids - room_ids
        if missing_pred_rooms:
            extra_rooms = list(
                (
                    await session.execute(
                        select(Room).where(Room.workspace_id == ws_id, Room.id.in_(missing_pred_rooms)),
                    )
                )
                .scalars()
                .all(),
            )
            to_add = [
                er
                for er in extra_rooms
                if er.floor_id == floor_id or er.id in layout_room_ids
            ]
            if to_add:
                rooms.extend(to_add)
                rooms.sort(key=lambda r: r.id)
                room_ids = {room.id for room in rooms}

        raw_node_ids = list({room.node_device_id for room in rooms if room.node_device_id})
        all_node_devices = list(
            (
                await session.execute(
                    select(Device)
                    .where(
                        Device.workspace_id == ws_id,
                        Device.hardware_type == "node",
                    )
                    .order_by(Device.id)
                )
            )
            .scalars()
            .all()
        )
        resolved_device_by_room_key: dict[str, Device] = {}
        for raw in raw_node_ids:
            resolved = resolve_registry_node_device(raw, all_node_devices)
            if resolved is not None:
                resolved_device_by_room_key[raw] = resolved

        photo_device_ids: list[str] = []
        for raw in raw_node_ids:
            photo_device_ids.append(raw)
            mapped = resolved_device_by_room_key.get(raw)
            if mapped is not None:
                photo_device_ids.append(mapped.device_id)
        photo_device_ids = list(dict.fromkeys(photo_device_ids))

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

        predictions_by_room: dict[int, list[RoomPrediction]] = {}
        for prediction in latest_prediction_by_device.values():
            if prediction.predicted_room_id is not None and prediction.predicted_room_id in room_ids:
                predictions_by_room.setdefault(prediction.predicted_room_id, []).append(prediction)

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
        assigned_patient_ids = {assignment.patient_id for assignment in assignment_by_device.values()}
        assigned_patient_by_id: dict[int, Patient] = {}
        if assigned_patient_ids:
            assigned_patients_rows = await session.execute(
                select(Patient).where(
                    Patient.workspace_id == ws_id,
                    Patient.id.in_(assigned_patient_ids),
                    Patient.is_active.is_(True),
                )
            )
            assigned_patient_by_id = {
                patient.id: patient for patient in assigned_patients_rows.scalars().all()
            }

        latest_prediction_by_patient: dict[int, RoomPrediction] = {}
        for prediction in latest_prediction_by_device.values():
            assignment = assignment_by_device.get(prediction.device_id)
            if assignment is None:
                continue
            patient_id = assignment.patient_id
            previous = latest_prediction_by_patient.get(patient_id)
            if previous is None or prediction.timestamp > previous.timestamp:
                latest_prediction_by_patient[patient_id] = prediction

        live_predicted_room_by_patient: dict[int, int] = {}
        for patient_id, prediction in latest_prediction_by_patient.items():
            predicted_room_id = prediction.predicted_room_id
            if predicted_room_id is None or predicted_room_id not in room_ids:
                continue
            age = self._seconds_since(prediction.timestamp, now)
            if age is None or age > self.LIVE_PREDICTION_WINDOW_SECONDS:
                continue
            live_predicted_room_by_patient[patient_id] = predicted_room_id

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
        if photo_device_ids:
            photo_rows = await session.execute(
                select(PhotoRecord)
                .where(
                    PhotoRecord.workspace_id == ws_id,
                    PhotoRecord.device_id.in_(photo_device_ids),
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
                        "photo_url": _profile_photo_url(caregiver.photo_url) if caregiver else None,
                    }
                )

        rows = []
        for room in rooms:
            sources: list[str] = []
            if room.id in layout_room_ids:
                sources.append("layout")

            device: Device | None = None
            node_status = "unmapped"
            if room.node_device_id:
                sources.append("node")
                device = resolved_device_by_room_key.get(room.node_device_id)
                if device is None:
                    node_status = "unknown"
                else:
                    last_seen_age = self._seconds_since(device.last_seen, now)
                    node_status = "online" if last_seen_age is not None and last_seen_age <= 300 else "stale"

            patient = patient_by_room.get(room.id)
            patient_hint = None
            occupants: list[dict] = []
            if patient is not None:
                live_room_id = live_predicted_room_by_patient.get(patient.id)
                if live_room_id is None or live_room_id == room.id:
                    sources.append("assignment")
                    patient_hint = {
                        "patient_id": patient.id,
                        "first_name": patient.first_name,
                        "last_name": patient.last_name,
                        "nickname": patient.nickname or "",
                        "source": "room_assignment",
                        "photo_url": _profile_photo_url(patient.photo_url),
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
                            "photo_url": _profile_photo_url(patient.photo_url),
                        }
                    )

            staff_occupants = staff_positions_by_room.get(room.id, [])
            if staff_occupants:
                sources.append("manual_staff_presence")
                occupants.extend(staff_occupants)

            predictions = predictions_by_room.get(room.id, [])
            prediction_hint = None
            confidence = 0.0
            staleness_seconds = None
            
            valid_predictions = []
            for prediction in predictions:
                assignment = assignment_by_device.get(prediction.device_id)
                if visible_patient_ids is not None and (
                    assignment is None or assignment.patient_id not in visible_patient_ids
                ):
                    continue
                valid_predictions.append(prediction)

            if valid_predictions:
                sources.append("prediction")
                
                # Sort descending by timestamp so primary prediction is the freshest
                valid_predictions.sort(key=lambda p: p.timestamp, reverse=True)
                primary_pred = valid_predictions[0]
                primary_assignment = assignment_by_device.get(primary_pred.device_id)
                
                staleness_seconds = self._seconds_since(primary_pred.timestamp, now) or 0
                confidence = float(primary_pred.confidence or 0.0)
                
                prediction_hint = {
                    "device_id": primary_pred.device_id,
                    "patient_id": primary_assignment.patient_id if primary_assignment else None,
                    "predicted_room_id": primary_pred.predicted_room_id,
                    "predicted_room_name": primary_pred.predicted_room_name or "",
                    "confidence": confidence,
                    "model_type": primary_pred.model_type or "",
                    "computed_at": primary_pred.timestamp,
                    "staleness_seconds": staleness_seconds,
                }
                
                for prediction in valid_predictions:
                    assignment = assignment_by_device.get(prediction.device_id)
                    predicted_patient = (
                        assigned_patient_by_id.get(assignment.patient_id)
                        if assignment is not None
                        else None
                    )
                    
                    if predicted_patient is not None and not any(
                        item.get("actor_type") == "patient" and item.get("actor_id") == predicted_patient.id
                        for item in occupants
                    ):
                        live_room_id = live_predicted_room_by_patient.get(predicted_patient.id)
                        if live_room_id is not None and live_room_id != room.id:
                            continue
                        occupants.append(
                            {
                                "actor_type": "patient",
                                "actor_id": predicted_patient.id,
                                "display_name": (
                                    predicted_patient.nickname
                                    or f"{predicted_patient.first_name} {predicted_patient.last_name}".strip()
                                    or f"Patient #{predicted_patient.id}"
                                ),
                                "subtitle": "highest_rssi",
                                "patient_id": predicted_patient.id,
                                "room_id": room.id,
                                "source": "highest_rssi",
                                "updated_at": prediction.timestamp,
                                "photo_url": _profile_photo_url(predicted_patient.photo_url),
                            }
                        )
                        if patient_hint is None:
                            patient_hint = {
                                "patient_id": predicted_patient.id,
                                "first_name": predicted_patient.first_name,
                                "last_name": predicted_patient.last_name,
                                "nickname": predicted_patient.nickname or "",
                                "source": "highest_rssi",
                                "photo_url": _profile_photo_url(predicted_patient.photo_url),
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

            photo = None
            if room.node_device_id:
                if device is not None:
                    photo = latest_photo_by_device.get(device.device_id)
                if photo is None:
                    photo = latest_photo_by_device.get(room.node_device_id)
            effective_cam_id = device.device_id if device is not None else room.node_device_id
            camera_summary = {
                "device_id": effective_cam_id,
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
        existing = await FloorplanLayoutService.get_for_scope(session, ws_id, facility_id, floor_id)
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

floorplan_service = FloorplanService(FloorplanAsset)
floorplan_presence_service = FloorplanPresenceService()
