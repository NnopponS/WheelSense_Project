"""Phase 9 — EaseAI full feature tests.

Tests cover:
1. sos_create_alert MCP tool — patient-scoped enforcement
2. patient role allowlist includes sos_create_alert
3. sos_create_alert absent from non-patient roles that should not use it
4. Allowlist TDD check: every listed patient tool is actually in the registry
"""

from __future__ import annotations

import pytest

from app.mcp.context import McpActorContext, actor_scope
from app.services.ai_chat import get_role_mcp_tool_allowlist
from app.mcp.server import _WORKSPACE_TOOL_REGISTRY


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_patient_actor(patient_id: int = 42) -> McpActorContext:
    return McpActorContext(
        user_id=10,
        workspace_id=1,
        role="patient",
        patient_id=patient_id,
        caregiver_id=None,
        scopes={"alerts.read", "alerts.write"},
    )


def _make_staff_actor(role: str) -> McpActorContext:
    return McpActorContext(
        user_id=20,
        workspace_id=1,
        role=role,
        patient_id=None,
        caregiver_id=None,
        scopes={"alerts.read", "alerts.write"},
    )


# ---------------------------------------------------------------------------
# 1. sos_create_alert is registered in the MCP tool registry
# ---------------------------------------------------------------------------

class TestSosCreateAlertRegistered:
    def test_tool_exists_in_registry(self) -> None:
        assert "sos_create_alert" in _WORKSPACE_TOOL_REGISTRY, (
            "sos_create_alert must be registered in _WORKSPACE_TOOL_REGISTRY"
        )


# ---------------------------------------------------------------------------
# 2. patient allowlist includes sos_create_alert
# ---------------------------------------------------------------------------

class TestPatientAllowlist:
    def test_sos_create_alert_in_patient_tools(self) -> None:
        allowlist = get_role_mcp_tool_allowlist()
        assert "sos_create_alert" in allowlist["patient"], (
            "sos_create_alert must be in the patient tool allowlist"
        )

    def test_patient_cannot_use_create_alert_directly(self) -> None:
        """create_alert is the generic staff tool; patient should use sos_create_alert instead."""
        allowlist = get_role_mcp_tool_allowlist()
        assert "create_alert" not in allowlist["patient"], (
            "patient should NOT have access to the generic create_alert tool; use sos_create_alert"
        )

    def test_observer_does_not_have_sos_create_alert(self) -> None:
        """sos_create_alert is patient-exclusive; observer uses create_alert."""
        allowlist = get_role_mcp_tool_allowlist()
        assert "sos_create_alert" not in allowlist["observer"], (
            "observer should not have sos_create_alert (they use create_alert)"
        )

    def test_head_nurse_does_not_have_sos_create_alert(self) -> None:
        allowlist = get_role_mcp_tool_allowlist()
        assert "sos_create_alert" not in allowlist["head_nurse"]

    def test_all_patient_tools_exist_in_registry(self) -> None:
        """Every tool in the patient allowlist must be registered — no phantom references."""
        allowlist = get_role_mcp_tool_allowlist()
        missing = [t for t in allowlist["patient"] if t not in _WORKSPACE_TOOL_REGISTRY]
        assert missing == [], f"Patient allowlist references unregistered tools: {missing}"


# ---------------------------------------------------------------------------
# 3. sos_create_alert enforces patient-scope (no DB, pure context check)
# ---------------------------------------------------------------------------

class TestSosCreateAlertScope:
    def test_patient_actor_without_patient_id_raises(self) -> None:
        """A patient user whose McpActorContext has patient_id=None must get PermissionError."""
        from app.mcp.server import sos_create_alert  # type: ignore[attr-defined]

        actor = McpActorContext(
            user_id=10, workspace_id=1, role="patient",
            patient_id=None, caregiver_id=None,
            scopes={"alerts.read", "alerts.write"},
        )
        import asyncio
        with actor_scope(actor):
            with pytest.raises((PermissionError, ValueError, RuntimeError)):
                asyncio.get_event_loop().run_until_complete(
                    sos_create_alert(description="Help me")
                )

    def test_non_patient_role_raises_permission_error(self) -> None:
        """observer calling sos_create_alert should be rejected by role check."""
        from app.mcp.server import sos_create_alert  # type: ignore[attr-defined]

        import asyncio
        actor = _make_staff_actor("observer")
        with actor_scope(actor):
            with pytest.raises(PermissionError):
                asyncio.get_event_loop().run_until_complete(
                    sos_create_alert(description="fake sos")
                )
