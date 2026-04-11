from __future__ import annotations

"""Medication endpoints for prescriptions and pharmacy orders."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RequireRole,
    ROLE_ALL_AUTHENTICATED,
    get_current_user_workspace,
    get_db,
)
from app.models.core import Workspace
from app.models.users import User
from app.schemas.medication import (
    PharmacyOrderCreate,
    PharmacyOrderOut,
    PharmacyOrderRequest,
    PharmacyOrderUpdate,
    PrescriptionCreate,
    PrescriptionOut,
    PrescriptionUpdate,
)
from app.api.dependencies import assert_patient_record_access_db, get_visible_patient_ids
from app.services.medication import pharmacy_order_service, prescription_service

router = APIRouter()

ROLE_MEDICATION_MANAGERS = ["admin", "head_nurse", "supervisor"]


@router.get("/prescriptions", response_model=list[PrescriptionOut])
async def list_prescriptions(
    patient_id: Optional[int] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    if patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, patient_id)
    else:
        patient_id = current_user.patient_id if current_user.role == "patient" else None
    visible_patient_ids = await get_visible_patient_ids(db, ws.id, current_user)
    return await prescription_service.list_for_patient(
        db,
        ws_id=ws.id,
        patient_id=patient_id,
        status=status,
        visible_patient_ids=visible_patient_ids,
        limit=200,
    )


@router.post("/prescriptions", response_model=PrescriptionOut, status_code=201)
async def create_prescription(
    payload: PrescriptionCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_MEDICATION_MANAGERS)),
):
    if payload.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, payload.patient_id)
    data = payload.model_copy(update={"patient_id": payload.patient_id, "specialist_id": payload.specialist_id})
    created = await prescription_service.create(db, ws_id=ws.id, obj_in=data)
    created.prescribed_by_user_id = current_user.id
    db.add(created)
    await db.commit()
    await db.refresh(created)
    return created


@router.patch("/prescriptions/{prescription_id}", response_model=PrescriptionOut)
async def update_prescription(
    prescription_id: int,
    payload: PrescriptionUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_MEDICATION_MANAGERS)),
):
    current = await prescription_service.get(db, ws_id=ws.id, id=prescription_id)
    if not current:
        raise HTTPException(status_code=404, detail="Prescription not found")
    if current.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, current.patient_id)
    return await prescription_service.update(db, ws_id=ws.id, db_obj=current, obj_in=payload)


@router.get("/pharmacy/orders", response_model=list[PharmacyOrderOut])
async def list_pharmacy_orders(
    patient_id: Optional[int] = None,
    prescription_id: Optional[int] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    if current_user.role == "patient":
        patient_id = current_user.patient_id
        if patient_id is None:
            raise HTTPException(403, "Patient account is not linked to a patient record")
    elif patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, patient_id)
    visible_patient_ids = await get_visible_patient_ids(db, ws.id, current_user)
    return await pharmacy_order_service.list_orders(
        db,
        ws_id=ws.id,
        patient_id=patient_id,
        prescription_id=prescription_id,
        status=status,
        visible_patient_ids=visible_patient_ids,
        limit=200,
    )


@router.post("/pharmacy/orders", response_model=PharmacyOrderOut, status_code=201)
async def create_pharmacy_order(
    payload: PharmacyOrderCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_MEDICATION_MANAGERS)),
):
    if payload.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, payload.patient_id)
    return await pharmacy_order_service.create(db, ws_id=ws.id, obj_in=payload)


@router.post("/pharmacy/orders/request", response_model=PharmacyOrderOut, status_code=201)
async def request_pharmacy_order(
    payload: PharmacyOrderRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["patient"])),
):
    patient_id = current_user.patient_id
    if patient_id is None:
        raise HTTPException(403, "Patient account is not linked to a patient record")
    try:
        return await pharmacy_order_service.create_patient_request(
            db,
            ws_id=ws.id,
            patient_id=patient_id,
            prescription_id=payload.prescription_id,
            pharmacy_name=payload.pharmacy_name,
            quantity=payload.quantity,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/pharmacy/orders/{order_id}", response_model=PharmacyOrderOut)
async def update_pharmacy_order(
    order_id: int,
    payload: PharmacyOrderUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_MEDICATION_MANAGERS)),
):
    current = await pharmacy_order_service.get(db, ws_id=ws.id, id=order_id)
    if not current:
        raise HTTPException(status_code=404, detail="Pharmacy order not found")
    if current.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, current.patient_id)
    return await pharmacy_order_service.update(db, ws_id=ws.id, db_obj=current, obj_in=payload)
