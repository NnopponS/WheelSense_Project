from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.caregivers import CareGiver, CareGiverPatientAccess
from app.models.patients import Patient, PatientDeviceAssignment, PatientContact
from app.models.base import utcnow
from app.models.core import Device, Room
from app.schemas.patients import (
    DeviceAssignmentCreate,
    PatientContactCreate,
    PatientContactUpdate,
    PatientCreate,
    PatientUpdate,
)
from app.services.base import CRUDBase
from pydantic import BaseModel
from fastapi import HTTPException

class AssignmentUpdatePlaceholder(BaseModel):
    pass

class ContactService(CRUDBase[PatientContact, PatientContactCreate, PatientContactUpdate]):
    async def create_for_patient(
        self, session: AsyncSession, ws_id: int, patient_id: int, obj_in: PatientContactCreate
    ) -> PatientContact:
        data = obj_in.model_dump()
        data["patient_id"] = patient_id

        db_obj = self.model(**data)
        if hasattr(self.model, "workspace_id"):
            db_obj.workspace_id = ws_id

        session.add(db_obj)
        await session.commit()
        await session.refresh(db_obj)
        return db_obj

    async def update_for_patient(
        self,
        session: AsyncSession,
        ws_id: int,
        patient_id: int,
        contact_id: int,
        obj_in: PatientContactUpdate,
    ) -> PatientContact:
        patient = await patient_service.get(session, ws_id, patient_id)
        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")
        contact = await session.get(PatientContact, contact_id)
        if contact is None or contact.patient_id != patient_id:
            raise HTTPException(status_code=404, detail="Contact not found")
        update_data = obj_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(contact, field, value)
        session.add(contact)
        await session.commit()
        await session.refresh(contact)
        return contact

    async def delete_for_patient(
        self,
        session: AsyncSession,
        ws_id: int,
        patient_id: int,
        contact_id: int,
    ) -> None:
        patient = await patient_service.get(session, ws_id, patient_id)
        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")
        contact = await session.get(PatientContact, contact_id)
        if contact is None or contact.patient_id != patient_id:
            raise HTTPException(status_code=404, detail="Contact not found")
        await session.delete(contact)
        await session.commit()

class PatientServiceCls(CRUDBase[Patient, PatientCreate, PatientUpdate]):
    async def get_with_contacts(
        self, session: AsyncSession, ws_id: int, id: int
    ) -> Optional[Patient]:
        result = await session.execute(
            select(self.model)
            .options(selectinload(self.model.contacts))
            .filter(
                self.model.id == id,
                self.model.workspace_id == ws_id
            )
        )
        return result.scalars().first()

    @staticmethod
    def calculate_bmi(height_cm: float | None, weight_kg: float | None) -> float | None:
        if height_cm is None or weight_kg is None or height_cm <= 0 or weight_kg <= 0:
            return None
        height_m = height_cm / 100
        return round(weight_kg / (height_m * height_m), 1)

    async def build_detail_payload(
        self,
        session: AsyncSession,
        ws_id: int,
        patient: Patient,
    ) -> dict[str, Any]:
        contacts = list(
            (
                await session.execute(
                    select(PatientContact)
                    .where(PatientContact.patient_id == patient.id)
                    .order_by(PatientContact.is_primary.desc(), PatientContact.id.asc())
                )
            )
            .scalars()
            .all()
        )
        staff = list(
            (
                await session.execute(
                    select(CareGiver)
                    .join(
                        CareGiverPatientAccess,
                        (CareGiverPatientAccess.caregiver_id == CareGiver.id)
                        & (CareGiverPatientAccess.workspace_id == CareGiver.workspace_id),
                    )
                    .where(
                        CareGiver.workspace_id == ws_id,
                        CareGiverPatientAccess.patient_id == patient.id,
                        CareGiverPatientAccess.is_active.is_(True),
                        CareGiver.is_active.is_(True),
                    )
                    .order_by(CareGiver.id.asc())
                )
            )
            .scalars()
            .all()
        )
        room = None
        if patient.room_id is not None:
            room = (
                await session.execute(
                    select(Room).where(
                        Room.id == patient.room_id,
                        Room.workspace_id == ws_id,
                    )
                )
            ).scalar_one_or_none()

        emergency_contacts = [
            contact
            for contact in contacts
            if contact.is_primary or str(contact.contact_type or "").lower() == "emergency"
        ]

        return {
            "id": patient.id,
            "workspace_id": patient.workspace_id,
            "first_name": patient.first_name,
            "last_name": patient.last_name,
            "nickname": patient.nickname,
            "date_of_birth": patient.date_of_birth.isoformat() if patient.date_of_birth else None,
            "gender": patient.gender,
            "height_cm": patient.height_cm,
            "weight_kg": patient.weight_kg,
            "bmi": self.calculate_bmi(patient.height_cm, patient.weight_kg),
            "blood_type": patient.blood_type,
            "photo_url": patient.photo_url,
            "medical_conditions": list(patient.medical_conditions or []),
            "allergies": list(patient.allergies or []),
            "medications": list(patient.medications or []),
            "past_surgeries": list(patient.past_surgeries or []),
            "care_level": patient.care_level,
            "mobility_type": patient.mobility_type,
            "current_mode": patient.current_mode,
            "notes": patient.notes,
            "clinical_notes": patient.notes,
            "admitted_at": patient.admitted_at.isoformat() if patient.admitted_at else None,
            "is_active": patient.is_active,
            "room_id": patient.room_id,
            "room": (
                {
                    "id": room.id,
                    "name": room.name,
                    "floor_id": room.floor_id,
                    "room_type": room.room_type,
                    "node_device_id": room.node_device_id,
                }
                if room
                else None
            ),
            "created_at": patient.created_at.isoformat() if patient.created_at else None,
            "emergency_contacts": [
                {
                    "id": contact.id,
                    "patient_id": contact.patient_id,
                    "contact_type": contact.contact_type,
                    "name": contact.name,
                    "relationship": contact.relationship,
                    "phone": contact.phone,
                    "email": contact.email,
                    "is_primary": contact.is_primary,
                    "notes": contact.notes,
                }
                for contact in emergency_contacts
            ],
            "assigned_staff": [
                {
                    "id": caregiver.id,
                    "first_name": caregiver.first_name,
                    "last_name": caregiver.last_name,
                    "role": caregiver.role,
                    "phone": caregiver.phone,
                    "email": caregiver.email,
                    "photo_url": caregiver.photo_url,
                }
                for caregiver in staff
            ],
        }

    async def assign_device(
        self, session: AsyncSession, ws_id: int, patient_id: int, obj_in: DeviceAssignmentCreate
    ) -> PatientDeviceAssignment:
        patient_row = await self.get(session, ws_id, patient_id)
        if patient_row is None:
            raise HTTPException(
                status_code=404, detail="Patient not found in current workspace"
            )
        device_result = await session.execute(
            select(Device).where(
                Device.workspace_id == ws_id,
                Device.device_id == obj_in.device_id,
            )
        )
        if device_result.scalars().first() is None:
            raise HTTPException(status_code=404, detail="Device not found in current workspace")

        # Deactivate assignments for this patient's same role and any existing owner of this device.
        stmt = select(PatientDeviceAssignment).filter(
            PatientDeviceAssignment.workspace_id == ws_id,
            PatientDeviceAssignment.is_active.is_(True),
        )
        existing = await session.execute(stmt)
        for assignment in existing.scalars().all():
            if not (
                assignment.device_id == obj_in.device_id
                or (
                    assignment.patient_id == patient_id
                    and assignment.device_role == obj_in.device_role
                )
            ):
                continue
            assignment.is_active = False
            if hasattr(assignment, "unassigned_at"):
                assignment.unassigned_at = utcnow()
            session.add(assignment)

        # Create new assignment
        new_assignment = PatientDeviceAssignment(
            workspace_id=ws_id,
            patient_id=patient_id,
            device_id=obj_in.device_id,
            device_role=obj_in.device_role,
            is_active=True,
        )
        session.add(new_assignment)
        await session.commit()
        await session.refresh(new_assignment)
        return new_assignment

    async def unassign_device(
        self, session: AsyncSession, ws_id: int, patient_id: int, device_id: str
    ) -> None:
        stmt = select(PatientDeviceAssignment).where(
            PatientDeviceAssignment.workspace_id == ws_id,
            PatientDeviceAssignment.patient_id == patient_id,
            PatientDeviceAssignment.device_id == device_id,
            PatientDeviceAssignment.is_active.is_(True),
        )
        result = await session.execute(stmt)
        assignment = result.scalars().first()
        if assignment is None:
            raise HTTPException(status_code=404, detail="Active assignment not found")
        assignment.is_active = False
        assignment.unassigned_at = utcnow()
        session.add(assignment)
        await session.commit()

patient_service = PatientServiceCls(Patient)
patient_assignment_service = CRUDBase[PatientDeviceAssignment, DeviceAssignmentCreate, AssignmentUpdatePlaceholder](PatientDeviceAssignment)
contact_service = ContactService(PatientContact)
