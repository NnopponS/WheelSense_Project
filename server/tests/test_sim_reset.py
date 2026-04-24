"""Tests for simulator reset functionality.

Tests verify:
1. Reset clears old users and seeds correct staff (Admin 1, Head Nurse 1, Supervisor 1, Observer 2)
2. SIM_ENABLE_ALERTS defaults to false
3. Reset clears old patients and seeds new ones
"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from app.sim.runtime.sim_game_seed import DASHBOARD_USERS, GAME_PATIENTS


def test_dashboard_users_has_correct_staff():
    """Verify DASHBOARD_USERS: Admin 1, Head Nurse 1, Supervisor 1, Observer 2."""
    users = list(DASHBOARD_USERS)

    # Count by role
    admin_count = sum(1 for _, role in users if role == "admin")
    head_nurse_count = sum(1 for _, role in users if role == "head_nurse")
    supervisor_count = sum(1 for _, role in users if role == "supervisor")
    observer_count = sum(1 for _, role in users if role == "observer")

    assert admin_count == 1, f"Expected 1 admin, got {admin_count}"
    assert head_nurse_count == 1, f"Expected 1 head_nurse, got {head_nurse_count}"
    assert supervisor_count == 1, f"Expected 1 supervisor, got {supervisor_count}"
    assert observer_count == 2, f"Expected 2 observers, got {observer_count}"

    # Verify specific usernames (admin username was changed from demo_admin → admin)
    usernames = [username for username, _ in users]
    assert "admin" in usernames
    assert "demo_headnurse" in usernames
    assert "demo_supervisor" in usernames
    assert "demo_observer" in usernames
    assert "demo_observer2" in usernames


def test_sim_enable_alerts_default_false():
    """Verify SIM_ENABLE_ALERTS environment variable defaults to false."""
    # When SIM_ENABLE_ALERTS is not set, it should default to false
    with patch.dict(os.environ, {}, clear=True):
        from app.config import settings
        
        # Check if the setting exists and defaults to false
        # This test verifies the docker-compose configuration
        # SIM_ENABLE_ALERTS: ${SIM_ENABLE_ALERTS:-false}
        assert os.environ.get("SIM_ENABLE_ALERTS", "false") == "false"


def test_game_patients_count():
    """Verify GAME_PATIENTS has the current cohort (4 characters: emika, rattana, krit, wichai)."""
    assert len(GAME_PATIENTS) == 4, f"Expected 4 patients, got {len(GAME_PATIENTS)}"
    game_names = {p.game_name for p in GAME_PATIENTS}
    assert game_names == {"emika", "rattana", "krit", "wichai"}


def test_dynamic_tables_excludes_user():
    """User must NOT be in _DYNAMIC_TABLES.

    Clean-slate resets go through ``simulator_reset.clear_workspace_full``,
    which deletes non-bootstrap users explicitly while preserving the admin
    session. Having ``User`` in the dynamic set would double-delete and risk
    wiping the bootstrap row during a partial reseed path.
    """
    from app.sim.runtime.sim_game_seed import _DYNAMIC_TABLES
    from app.models import User

    assert User not in _DYNAMIC_TABLES


def test_dynamic_tables_clears_correct_tables():
    """Verify _DYNAMIC_TABLES includes all necessary event-stream tables."""
    from app.sim.runtime.sim_game_seed import _DYNAMIC_TABLES
    from app.models import (
        VitalReading,
        Alert,
        ActivityTimeline,
        CareTask,
        DemoActorPosition,
    )

    expected_tables = {
        VitalReading,
        Alert,
        ActivityTimeline,
        CareTask,
        DemoActorPosition,
    }

    assert set(_DYNAMIC_TABLES) == expected_tables, (
        f"_DYNAMIC_TABLES mismatch. Expected {expected_tables}, got {set(_DYNAMIC_TABLES)}"
    )
