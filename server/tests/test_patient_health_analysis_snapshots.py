from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.patients import PatientHealthAnalysisSnapshot


async def _create_active_patient(client: AsyncClient, *, first_name: str = "Hybrid") -> tuple[int, int]:
    ws_resp = await client.post("/api/workspaces", json={"name": f"{first_name}-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")
    patient_resp = await client.post(
        "/api/patients",
        json={"first_name": first_name, "last_name": "Snapshot"},
    )
    return ws_id, patient_resp.json()["id"]


@pytest.mark.asyncio
async def test_manual_health_analysis_refresh_persists_ai_snapshot(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    async def fake_reply(**kwargs):
        attempts = kwargs.get("provider_attempts_out")
        if attempts is not None:
            attempts.append(
                {
                    "provider": "copilot",
                    "model": "gpt-4.1",
                    "phase": "health_analysis_snapshot",
                    "attempt": 1,
                    "status": "success",
                    "latency_ms": 3,
                }
            )
        return "AI snapshot: stable status with routine monitoring recommended."

    monkeypatch.setattr(
        "app.services.ai_chat.collect_chat_reply_best_effort",
        fake_reply,
    )

    _, patient_id = await _create_active_patient(client, first_name="Manual")

    refresh_resp = await client.post(f"/api/patients/{patient_id}/health-analysis/refresh")
    assert refresh_resp.status_code == 201
    snapshot = refresh_resp.json()
    assert snapshot["source"] == "ai"
    assert snapshot["status"] == "success"
    assert snapshot["provider"] == "copilot"
    assert snapshot["model_name"] == "gpt-4.1"
    assert snapshot["summary"].startswith("AI snapshot:")
    assert snapshot["evidence_baseline"]["patient_id"] == patient_id
    assert snapshot["snapshot_payload"]["overall_score"] == snapshot["evidence_baseline"]["overall_score"]

    reload_resp = await client.get(f"/api/patients/{patient_id}/health-analysis")
    assert reload_resp.status_code == 200
    latest = reload_resp.json()["latest_snapshot"]
    assert latest["id"] == snapshot["id"]
    assert latest["summary"] == snapshot["summary"]


@pytest.mark.asyncio
async def test_health_analysis_refresh_falls_back_to_deterministic_snapshot(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    async def failing_reply(**kwargs):
        attempts = kwargs.get("provider_attempts_out")
        if attempts is not None:
            attempts.append(
                {
                    "provider": "ollama",
                    "model": "test-model",
                    "phase": "health_analysis_snapshot",
                    "attempt": 1,
                    "status": "error",
                    "latency_ms": 2,
                    "error": "provider down",
                }
            )
        raise RuntimeError("provider down")

    monkeypatch.setattr(
        "app.services.ai_chat.collect_chat_reply_best_effort",
        failing_reply,
    )

    _, patient_id = await _create_active_patient(client, first_name="Fallback")

    refresh_resp = await client.post(f"/api/patients/{patient_id}/health-analysis/refresh")
    assert refresh_resp.status_code == 201
    snapshot = refresh_resp.json()
    assert snapshot["source"] == "deterministic"
    assert snapshot["status"] == "deterministic_fallback"
    assert "Deterministic score" in snapshot["summary"]
    assert snapshot["provider"] is None
    assert snapshot["model_name"] is None
    assert any(attempt["provider"] == "deterministic" for attempt in snapshot["provider_attempts"])


@pytest.mark.asyncio
async def test_health_analysis_get_reloads_latest_snapshot_metadata(
    client: AsyncClient,
    db_session: AsyncSession,
):
    ws_id, patient_id = await _create_active_patient(client, first_name="Reload")
    now = datetime.now(timezone.utc)
    old_snapshot = PatientHealthAnalysisSnapshot(
        workspace_id=ws_id,
        patient_id=patient_id,
        generated_at=now - timedelta(hours=1),
        deterministic_generated_at=now - timedelta(hours=1),
        window_hours=24,
        source="deterministic",
        status="deterministic_fallback",
        summary="old snapshot",
        snapshot_json={"summary": "old snapshot"},
        evidence_json={"patient_id": patient_id},
        provider_attempts=[],
    )
    latest_snapshot = PatientHealthAnalysisSnapshot(
        workspace_id=ws_id,
        patient_id=patient_id,
        generated_at=now,
        deterministic_generated_at=now,
        window_hours=24,
        source="ai",
        status="success",
        provider="copilot",
        model_name="gpt-4.1",
        summary="latest snapshot",
        snapshot_json={"summary": "latest snapshot"},
        evidence_json={"patient_id": patient_id},
        provider_attempts=[
            {
                "provider": "copilot",
                "model": "gpt-4.1",
                "phase": "health_analysis_snapshot",
                "attempt": 1,
                "status": "success",
                "latency_ms": 1,
            }
        ],
    )
    db_session.add_all([old_snapshot, latest_snapshot])
    await db_session.commit()

    resp = await client.get(f"/api/patients/{patient_id}/health-analysis")
    assert resp.status_code == 200
    latest = resp.json()["latest_snapshot"]
    assert latest["summary"] == "latest snapshot"
    assert latest["provider"] == "copilot"
    assert latest["model_name"] == "gpt-4.1"
