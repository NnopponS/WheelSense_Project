from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.models.patients import Patient, PatientDeviceAssignment, PatientContact
from app.models.base import utcnow
from app.models.core import Device
from app.schemas.patients import (
    DeviceAssignmentCreate,
    PatientContactCreate,
    PatientCreate,
    PatientUpdate,
)
from app.services.base import CRUDBase
from pydantic import BaseModel
from fastapi import HTTPException


class ContactServiceUpdatePlaceholder(BaseModel):
    pass


class AssignmentUpdatePlaceholder(BaseModel):
    pass


class ContactService(CRUDBase[PatientContact, PatientContactCreate, ContactServiceUpdatePlaceholder]):
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

    async def assign_device(
        self, session: AsyncSession, ws_id: int, patient_id: int, obj_in: DeviceAssignmentCreate
    ) -> PatientDeviceAssignment:
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


patient_service = PatientServiceCls(Patient)
patient_assignment_service = CRUDBase[PatientDeviceAssignment, DeviceAssignmentCreate, AssignmentUpdatePlaceholder](PatientDeviceAssignment)
contact_service = ContactService(PatientContact)
