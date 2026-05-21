"""Tests for `sim_controller` env merge helpers (no MQTT / DB)."""

from __future__ import annotations

import os
from unittest.mock import patch

from sim_controller import ALERT_THRESHOLDS, SIMULATION_CONFIG, merge_env_sim_overrides
from sim_controller import PatientState, SimulationEngine
from app.models.core import Room


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


def test_generate_payload_uses_room_node_as_strongest_rssi() -> None:
    engine = SimulationEngine(config=SIMULATION_CONFIG.copy())
    engine.rooms = [
        Room(id=1, workspace_id=1, name="Room 401", room_type="bedroom", node_device_id="SIM_NODE_01")
    ]
    patient_state = PatientState(
        patient_id=1,
        device_id="SIM_WHEEL_01",
        care_level="normal",
        current_room_idx=0,
        home_room_idx=0,
        mobility_type="wheelchair",
    )

    payload = engine.generate_payload(
        "SIM_WHEEL_01",
        patient_state,
        {"heart_rate_bpm": 80, "rr_interval_ms": 750, "spo2": 98, "sensor_battery": 90},
        0,
    )

    assert payload["rssi"][0]["node"] == "SIM_NODE_01"
    assert payload["rssi"][0]["rssi"] >= -41


def test_move_actor_command_queues_patient_move() -> None:
    engine = SimulationEngine(config=SIMULATION_CONFIG.copy())

    engine._apply_control_command_sync(
        {"command": "move_actor", "actor_type": "patient", "patient_id": 5, "room_id": 12}
    )

    assert len(engine._pending_actor_moves) == 1
    queued = engine._pending_actor_moves[0]
    assert queued["actor_type"] == "patient"
    assert queued["patient_id"] == 5
    assert queued["room_id"] == 12


def test_connect_mqtt_resubscribes_control_topic_on_connect() -> None:
    engine = SimulationEngine(config=SIMULATION_CONFIG.copy())

    class FakeClient:
        def __init__(self, *_args, **_kwargs):
            self.on_connect = None
            self.on_message = None
            self.subscriptions: list[tuple[str, int]] = []

        def connect(self, *_args, **_kwargs):
            return 0

        def loop_start(self):
            return None

        def subscribe(self, topic, qos=0):
            self.subscriptions.append((topic, qos))

    fake = FakeClient()

    with patch("sim_controller.mqtt.Client", return_value=fake):
        engine.connect_mqtt()

    assert fake.on_connect is not None
    fake.on_connect(fake, None, None, 0, None)
    assert ("WheelSense/sim/control", 0) in fake.subscriptions


def test_merge_env_heart_rate_high():
    cfg = SIMULATION_CONFIG.copy()
    with patch.dict(os.environ, {"SIM_HEART_RATE_HIGH": "125"}, clear=False):
        merge_env_sim_overrides(cfg)
    assert cfg["heart_rate_high"] == 125
    assert cfg["heart_rate_high"] != ALERT_THRESHOLDS["heart_rate_high"]
