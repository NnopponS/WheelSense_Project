"""Tests for `sim_controller` env merge helpers (no MQTT / DB)."""

from __future__ import annotations

import os
from unittest.mock import patch

from app.sim.runtime.sim_controller import (
    ALERT_THRESHOLDS,
    SIMULATION_CONFIG,
    merge_env_sim_overrides,
)


def test_merge_env_vital_update_interval():
    cfg = SIMULATION_CONFIG.copy()
    with patch.dict(os.environ, {"SIM_VITAL_UPDATE_INTERVAL": "90"}, clear=False):
        merge_env_sim_overrides(cfg)
    assert cfg["vital_update_interval"] == 90


def test_merge_env_disable_alerts():
    cfg = SIMULATION_CONFIG.copy()
    cfg["enable_alerts"] = True
    with patch.dict(os.environ, {"SIM_ENABLE_ALERTS": "false"}, clear=False):
        merge_env_sim_overrides(cfg)
    assert cfg["enable_alerts"] is False


def test_merge_env_heart_rate_high():
    cfg = SIMULATION_CONFIG.copy()
    with patch.dict(os.environ, {"SIM_HEART_RATE_HIGH": "125"}, clear=False):
        merge_env_sim_overrides(cfg)
    assert cfg["heart_rate_high"] == 125
    assert cfg["heart_rate_high"] != ALERT_THRESHOLDS["heart_rate_high"]
