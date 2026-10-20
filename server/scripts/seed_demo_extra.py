"""Add a daily demo data pack to the existing simulator without resetting it.

Run: docker exec wheelsense-platform-server python scripts/seed_demo_extra.py
The audit marker and all generated rows commit together; same-day reruns skip.
"""
from __future__ import annotations

import asyncio
from collections import Counter
from datetime import datetime, time, timedelta, timezone
import json
from pathlib import Path
import random
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select, text
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models import (
    ActivityTimeline, Alert, AuditTrailEvent, CareDirective, CareGiverShift,
    CareSchedule, CareTask, CareWorkflowJob, CareWorkflowJobAssignee,
    CareWorkflowJobPatient, CareWorkflowJobStep, Device, HandoverNote,
    HealthObservation, Patient, PatientDeviceAssignment, PatientFixRoutine,
    PharmacyOrder, Prescription, RoleMessage, RoutineTask, RoutineTaskLog,
    ServiceRequest, SupportTicket, SupportTicketComment, Task, TaskReport,
    User, VitalReading, Workspace,
)


async def main() -> None:
    if not settings.is_simulator_mode:
        raise RuntimeError("Demo packs require ENV_MODE=simulator.")
    now = datetime.now(timezone.utc)
    today = now.astimezone(ZoneInfo("Asia/Bangkok")).date()
    batch = f"demo-extra-{today.isoformat()}"
    rng = random.Random(4242)
    counts: Counter[str] = Counter()
    async with AsyncSessionLocal() as session, session.begin():
        ws = (await session.scalars(select(Workspace).where(
            Workspace.name == (settings.bootstrap_demo_workspace_name or "WheelSense Demo Workspace")
        ))).one()
        # Serialize repeat runs so the daily audit marker cannot race.
        await session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": ws.id})
        marker = await session.scalar(select(AuditTrailEvent.id).where(
            AuditTrailEvent.workspace_id == ws.id,
            AuditTrailEvent.action == "seed_demo_extra",
            AuditTrailEvent.details["batch"].as_string() == batch,
        ))
        if marker:
            print(json.dumps({"batch": batch, "skipped": "Already generated today"}))
            return
        patients = list(await session.scalars(select(Patient).where(
            Patient.workspace_id == ws.id, Patient.is_active.is_(True)
        ).order_by(Patient.id)))
        users = list(await session.scalars(select(User).where(
            User.workspace_id == ws.id, User.is_active.is_(True)
        ).order_by(User.id)))
        staff = [u for u in users if u.role == "caregiver" and u.caregiver_id]
        head = next(u for u in users if u.role == "head_caregiver")
        admin = next(u for u in users if u.role == "admin")
        assignments = dict((await session.execute(select(
            PatientDeviceAssignment.patient_id, PatientDeviceAssignment.device_id
        ).where(PatientDeviceAssignment.workspace_id == ws.id,
                PatientDeviceAssignment.is_active.is_(True)))).all())
        device_ids = set(await session.scalars(select(Device.device_id).where(Device.workspace_id == ws.id)))
        if not patients or not staff or any(assignments.get(p.id) not in device_ids for p in patients):
            raise RuntimeError("Seed the baseline patients, caregivers and device assignments first.")

        def add(model, **values):
            row = model(workspace_id=ws.id, **values)
            session.add(row)
            counts[model.__tablename__] += 1
            return row

        for i, patient in enumerate(patients):
            caregiver = staff[i % len(staff)]
            name = patient.first_name
            for day in range(14):
                ts = now - timedelta(days=day, minutes=10 + i)
                for hour in (0, 6, 12, 18):
                    hr = 72 + i * 2 + rng.randint(-5, 7)
                    add(VitalReading, patient_id=patient.id, device_id=assignments[patient.id],
                        timestamp=ts - timedelta(hours=hour), heart_rate_bpm=hr,
                        rr_interval_ms=round(60000 / hr, 1), spo2=96 + rng.randrange(4),
                        sensor_battery=90 - day, source="ble")
                add(HealthObservation, patient_id=patient.id, caregiver_id=caregiver.caregiver_id,
                    timestamp=ts, observation_type="daily_check", blood_pressure_sys=118 + i * 3 + rng.randrange(8),
                    blood_pressure_dia=72 + rng.randrange(9), temperature_c=round(36.4 + rng.random() * .6, 1),
                    pain_level=day % 3, description=f"[Demo] {name}: comfortable, skin intact; assisted care documented.",
                    data={"synthetic": True, "batch": batch})
                add(HealthObservation, patient_id=patient.id, caregiver_id=caregiver.caregiver_id,
                    timestamp=ts - timedelta(hours=1), observation_type="meal", meal_type="breakfast",
                    meal_portion="half" if day % 4 == 0 else "full", water_ml=200 + day % 3 * 50,
                    description="[Demo] Meal intake and hydration recorded.", data={"synthetic": True, "batch": batch})
                add(ActivityTimeline, patient_id=patient.id, timestamp=ts, event_type="observation",
                    room_id=patient.room_id, description=f"[Demo] {name}: daily comfort, mobility and hydration check.",
                    source="system", data={"synthetic": True, "batch": batch})

            for slot, label in enumerate(("Comfort and skin check", "Hydration round", "Assisted mobility")):
                starts = now + timedelta(hours=slot * 3 + i * .25)
                title = f"{label} - {name}"
                schedule = add(CareSchedule, patient_id=patient.id, room_id=patient.room_id,
                    title=title, schedule_type="care", starts_at=starts, ends_at=starts + timedelta(minutes=30),
                    assigned_role="caregiver", assigned_user_id=caregiver.id, created_by_user_id=head.id,
                    notes=f"[Demo] {batch}", status="scheduled")
                await session.flush()
                status = ("pending", "in_progress", "completed")[(i + slot) % 3]
                due = starts + timedelta(minutes=30)
                completed = now - timedelta(minutes=30) if status == "completed" else None
                if completed:
                    schedule.starts_at = now - timedelta(hours=2)
                    schedule.ends_at = completed
                    schedule.status = "completed"
                    due = completed
                add(CareTask, schedule_id=schedule.id, patient_id=patient.id, title=title,
                    description="[Demo] Follow the existing care plan and record observations.",
                    due_at=due, priority="high" if slot == 0 else "normal", status=status,
                    assigned_role="caregiver", assigned_user_id=caregiver.id, created_by_user_id=head.id,
                    completed_at=completed)
                task = add(Task, task_type="specific", patient_id=patient.id, title=title,
                    description=f"[Demo] {batch}: document care completion.", status=status,
                    priority="high" if slot == 0 else "normal", starts_at=schedule.starts_at,
                    ends_at=due, due_at=due, assigned_user_id=caregiver.id,
                    assigned_user_ids=[caregiver.id], created_by_user_id=head.id, completed_at=completed)
                await session.flush()
                if completed:
                    add(TaskReport, task_id=task.id, patient_id=patient.id, submitted_by_user_id=caregiver.id,
                        notes="[Demo] Completed; comfortable after assistance.", submitted_at=completed)

            for day in range(3):
                add(HandoverNote, patient_id=patient.id, author_user_id=caregiver.id,
                    target_role="head_caregiver", shift_date=today - timedelta(days=day),
                    shift_label="morning", priority="routine", created_at=now - timedelta(days=day),
                    note=f"[Demo] {name}: meals recorded, mobility assistance completed. Review next shift's tasks.")
            add(RoleMessage, patient_id=patient.id, sender_user_id=caregiver.id, recipient_user_id=head.id,
                recipient_role="head_caregiver", subject=f"Care update - {name}",
                body="[Demo] Observations are ready for review; next round is on the calendar.")
            add(RoleMessage, patient_id=patient.id, sender_user_id=head.id, recipient_user_id=caregiver.id,
                recipient_role="caregiver", subject=f"Next round - {name}",
                body="[Demo] Please complete the assigned comfort and hydration checks.")
            patient_user = next((u for u in users if u.patient_id == patient.id), None)
            if patient_user:
                add(RoleMessage, patient_id=patient.id, sender_user_id=head.id,
                    recipient_user_id=patient_user.id, recipient_role="patient",
                    subject=f"Your care update - {name}", body=f"[Demo] {batch}: your next assisted activity is on the calendar.")
                add(RoleMessage, patient_id=patient.id, sender_user_id=patient_user.id,
                    recipient_user_id=caregiver.id, recipient_role="caregiver",
                    subject=f"Activity request - {name}", body=f"[Demo] {batch}: please help me prepare for my next activity.")
            for n, service in enumerate(("food", "transport", "housekeeping")):
                done = n == 2
                add(ServiceRequest, patient_id=patient.id, requested_by_user_id=patient_user.id if patient_user else head.id,
                    service_type=service, title=f"{service.title()} assistance - {name}",
                    note=f"[Demo] {batch}: assistance requested for the demo walkthrough.",
                    status=("open", "in_progress", "fulfilled")[n],
                    claimed_by_user_id=caregiver.id if n else None,
                    claimed_at=now - timedelta(minutes=20) if n else None,
                    resolved_by_user_id=caregiver.id if done else None,
                    resolved_at=now - timedelta(minutes=5) if done else None,
                    resolution_note="[Demo] Assistance completed." if done else None,
                    created_at=now - timedelta(hours=1))
            status = ("active", "acknowledged", "resolved")[i % 3]
            ts = now - timedelta(hours=2 + i)
            add(Alert, patient_id=patient.id, device_id=assignments[patient.id], timestamp=ts,
                alert_type="abnormal_hr", severity="warning", title=f"[Demo] Vitals review - {name}",
                description="Synthetic elevated heart-rate scenario for triage demonstration.", status=status,
                data={"synthetic": True, "batch": batch},
                acknowledged_by=caregiver.caregiver_id if status != "active" else None,
                acknowledged_at=ts + timedelta(minutes=10) if status != "active" else None,
                resolved_at=ts + timedelta(minutes=30) if status == "resolved" else None,
                resolution_note="[Demo] Repeat observation recorded." if status == "resolved" else "")
            add(CareDirective, patient_id=patient.id, issued_by_user_id=head.id, target_role="caregiver",
                target_user_id=caregiver.id, title=f"Comfort and mobility review - {name}",
                directive_text="[Demo] Review the existing care plan at shift handover.",
                effective_from=now, effective_until=now + timedelta(days=7))
            add(PatientFixRoutine, title=f"Daily care - {name}", description=f"[Demo] {batch}",
                patient_ids=[patient.id], target_roles=["caregiver"], schedule_type="daily",
                recurrence_rule="FREQ=DAILY", created_by_user_id=head.id,
                steps=[{"title": "Comfort check", "instructions": "Record comfort and posture.", "sort_order": 0}])

        for i, caregiver in enumerate(staff):
            for day in range(7):
                shift_date = today + timedelta(days=day)
                existing = await session.scalar(select(CareGiverShift.id).where(
                    CareGiverShift.caregiver_id == caregiver.caregiver_id, CareGiverShift.shift_date == shift_date))
                if not existing:
                    session.add(CareGiverShift(caregiver_id=caregiver.caregiver_id, shift_date=shift_date,
                        start_time=time(7 if i % 2 == 0 else 15), end_time=time(15 if i % 2 == 0 else 23),
                        notes=f"[Demo] {batch}; Asia/Bangkok"))
                    counts["caregiver_shifts"] += 1
            for n, title in enumerate(("Morning equipment check", "Review care handover", "End-of-shift documentation")):
                routine = add(RoutineTask, title=title, description=f"[Demo] {batch}", category="round",
                    assigned_user_id=caregiver.id, created_by_user_id=head.id, sort_order=n)
                await session.flush()
                add(RoutineTaskLog, routine_task_id=routine.id, assigned_user_id=caregiver.id,
                    shift_date=today, status="done" if n == 0 else "pending",
                    completed_at=now - timedelta(minutes=15) if n == 0 else None,
                    note="[Demo] Equipment checked." if n == 0 else "")
            job = add(CareWorkflowJob, title=f"Care round - {caregiver.username}", description=f"[Demo] {batch}",
                starts_at=now, duration_minutes=60, created_by_user_id=head.id)
            await session.flush()
            session.add(CareWorkflowJobAssignee(job_id=job.id, user_id=caregiver.id, role_hint="caregiver"))
            counts["care_workflow_job_assignees"] += 1
            for patient in patients[i::len(staff)]:
                session.add(CareWorkflowJobPatient(job_id=job.id, patient_id=patient.id))
                counts["care_workflow_job_patients"] += 1
            for n, title in enumerate(("Review handover", "Visit assigned patients", "Record observations")):
                session.add(CareWorkflowJobStep(job_id=job.id, title=title, sort_order=n,
                    assigned_user_id=caregiver.id, status="done" if n == 0 else "pending",
                    completed_by_user_id=caregiver.id if n == 0 else None,
                    completed_at=now - timedelta(minutes=5) if n == 0 else None))
                counts["care_workflow_job_steps"] += 1

        for i, title in enumerate(("Wheelchair charging dock inspection", "Camera image review", "Room tablet connectivity")):
            ticket = add(SupportTicket, reporter_user_id=head.id, reporter_role=head.role,
                title=title, description=f"[Demo] {batch}: example maintenance request.", category="device",
                priority="normal", status=("open", "in_progress", "resolved")[i], assignee_user_id=admin.id)
            await session.flush()
            add(SupportTicketComment, ticket_id=ticket.id, author_user_id=admin.id, author_role=admin.role,
                body="[Demo] Request received and assigned to the support team.")
        prescriptions = list(await session.scalars(select(Prescription).where(Prescription.workspace_id == ws.id)))
        for i, prescription in enumerate(prescriptions):
            add(PharmacyOrder, patient_id=prescription.patient_id, prescription_id=prescription.id,
                order_number=f"{batch}-RX-{prescription.id}", pharmacy_name="Demo Pharmacy", quantity=30,
                status=("pending", "verified", "dispensed")[i % 3], requested_at=now - timedelta(hours=2),
                fulfilled_at=now - timedelta(hours=1) if i % 3 == 2 else None,
                notes="[Demo] Synthetic refill workflow; no external order submitted.")
        await session.flush()
        assert counts["vital_readings"] == len(patients) * 14 * 4
        assert counts["health_observations"] == len(patients) * 14 * 2
        assert counts["tasks"] == counts["care_schedules"] == len(patients) * 3
        add(AuditTrailEvent, actor_user_id=admin.id, domain="demo", action="seed_demo_extra",
            entity_type="workspace", entity_id=ws.id,
            details={"batch": batch, "synthetic": True, "counts": dict(counts)})
    print(json.dumps({"batch": batch, "workspace_id": ws.id, "patients": len(patients),
                      "added": dict(counts), "total_added": sum(counts.values())}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
