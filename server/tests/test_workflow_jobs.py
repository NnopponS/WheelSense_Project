"""Tests for care workflow jobs (checklist + timeline on complete)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_care_workflow_job_complete_writes_timeline(client: AsyncClient):
    p = await client.post("/api/patients", json={"first_name": "Job", "last_name": "Patient"})
    assert p.status_code == 201, p.text
    pid = p.json()["id"]

    job = await client.post(
        "/api/workflow/jobs",
        json={
            "title": "Round job",
            "description": "integration test",
            "starts_at": "2026-04-15T10:00:00Z",
            "duration_minutes": 60,
            "patient_ids": [pid],
            "assignee_user_ids": [],
            "steps": [
                {"title": "Step A", "instructions": "Do A"},
                {"title": "Step B", "instructions": "Do B"},
            ],
        },
    )
    assert job.status_code == 201, job.text
    payload = job.json()
    job_id = payload["id"]
    steps = payload["steps"]
    assert len(steps) == 2
    s1, s2 = steps[0]["id"], steps[1]["id"]

    r1 = await client.patch(
        f"/api/workflow/jobs/{job_id}/steps/{s1}",
        json={"status": "done"},
    )
    assert r1.status_code == 200
    r2 = await client.patch(
        f"/api/workflow/jobs/{job_id}/steps/{s2}",
        json={"status": "done"},
    )
    assert r2.status_code == 200

    done = await client.post(f"/api/workflow/jobs/{job_id}/complete")
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "completed"

    tl = await client.get(f"/api/timeline?patient_id={pid}&limit=30")
    assert tl.status_code == 200
    event_types = [e["event_type"] for e in tl.json()]
    assert "workflow_job_completed" in event_types


@pytest.mark.asyncio
async def test_care_workflow_job_creates_shadow_care_task(client: AsyncClient):
    """Checklist jobs sync a companion care_tasks row for calendar/board feeds."""
    p = await client.post("/api/patients", json={"first_name": "Shadow", "last_name": "Patient"})
    assert p.status_code == 201, p.text
    pid = p.json()["id"]

    job = await client.post(
        "/api/workflow/jobs",
        json={
            "title": "Shadow link job",
            "description": "",
            "starts_at": "2026-05-01T12:00:00Z",
            "duration_minutes": 30,
            "patient_ids": [pid],
            "assignee_user_ids": [],
            "steps": [{"title": "Only step", "instructions": ""}],
        },
    )
    assert job.status_code == 201, job.text
    job_id = job.json()["id"]

    tasks = await client.get("/api/workflow/tasks?limit=200")
    assert tasks.status_code == 200
    rows = tasks.json()
    linked = [t for t in rows if t.get("workflow_job_id") == job_id]
    assert len(linked) == 1
    assert linked[0]["title"] == "Shadow link job"
    assert linked[0]["patient_id"] == pid
    assert linked[0]["status"] == "pending"

    tid = linked[0]["id"]
    conflict = await client.patch(f"/api/workflow/tasks/{tid}", json={"status": "completed"})
    assert conflict.status_code == 409, conflict.text
