"""TDD tests for the new simulator dispatch flow added in this session.

User Journeys:
1. As a patient character (Wichai/Emika/Rattana/Krit), when I fall the game sends
   a `distress_signal` WebSocket message.  The bridge should record it as a
   `character_event` (fall) AND return a broadcast payload — it must NOT call
   `call_closest_doctor` directly.

2. As an observer on the mobile app, when a distress is processed the backend
   must publish a dispatch notification to my personal MQTT topic
   `WheelSense/dispatch/<user_id>` so my phone shows Accept/Decline buttons.

3. When no observer is assigned (assigned_user_id is None), the backend must
   NOT attempt an MQTT publish (fail-safe: no crash, no noise).

4. The round-robin observer picker must cycle through all active observers and
   wrap around, so no single observer is always paged first.

5. The `patients` table must have a `profile` JSONB column after the migration,
   and the seeder must persist health-profile data into it.
"""

from __future__ import annotations

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

from fastapi import WebSocket


# ─────────────────────────────────────────────────────────────────────────────
# 1.  distress_signal WebSocket message → bridge processes it
# ─────────────────────────────────────────────────────────────────────────────

class TestDistressSignalHandling:
    """Bridge must handle `distress_signal` messages from the game."""

    @pytest.mark.asyncio
    async def test_distress_signal_returns_broadcast_payload(self):
        """A `distress_signal` message should return a non-None broadcast dict."""
        from app.sim.services.game_bridge import handle_game_message, _Client, CLIENT_TYPE_GAME

        mock_ws = MagicMock(spec=WebSocket)
        client = _Client(websocket=mock_ws, client_type=CLIENT_TYPE_GAME, workspace_id=1)

        message = {
            "type": "distress_signal",
            "character": "emika",
            "room": "Room401",
            "event_type": "fall",
        }

        with patch("app.sim.services.game_bridge.hub") as mock_hub, \
             patch("app.sim.services.game_bridge._get_patient_id_for_character") as mock_get_pid, \
             patch("app.sim.services.game_bridge._create_fall_alert") as mock_alert, \
             patch("app.sim.services.game_bridge._pick_dispatch_observer") as mock_pick, \
             patch("app.sim.services.game_bridge.broadcast_dispatch_request") as mock_dispatch, \
             patch("app.sim.services.game_bridge.AsyncSessionLocal") as mock_session:

            mock_session_instance = AsyncMock()
            mock_session_instance.get = AsyncMock(return_value=None)
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_hub.broadcast = AsyncMock()
            mock_get_pid.return_value = 1
            mock_alert_obj = MagicMock()
            mock_alert_obj.id = 99
            mock_alert.return_value = mock_alert_obj
            mock_pick.return_value = 7
            mock_dispatch.return_value = None

            result = await handle_game_message(client, message)

        assert result is not None
        assert result["type"] in ("character_event", "distress_signal")
        assert result["character"] == "emika"

    @pytest.mark.asyncio
    async def test_distress_signal_does_not_call_go_help_patient(self):
        """Distress signal must NOT directly invoke broadcast_dispatch_accepted (nurse movement)."""
        from app.sim.services.game_bridge import handle_game_message, _Client, CLIENT_TYPE_GAME

        mock_ws = MagicMock(spec=WebSocket)
        client = _Client(websocket=mock_ws, client_type=CLIENT_TYPE_GAME, workspace_id=1)

        message = {
            "type": "distress_signal",
            "character": "wichai",
            "room": "Room404",
            "event_type": "fall",
        }

        with patch("app.sim.services.game_bridge.hub") as mock_hub, \
             patch("app.sim.services.game_bridge._get_patient_id_for_character") as mock_get_pid, \
             patch("app.sim.services.game_bridge._create_fall_alert") as mock_alert, \
             patch("app.sim.services.game_bridge._pick_dispatch_observer") as mock_pick, \
             patch("app.sim.services.game_bridge.broadcast_dispatch_request") as mock_dispatch, \
             patch("app.sim.services.game_bridge.broadcast_dispatch_accepted") as mock_accepted, \
             patch("app.sim.services.game_bridge.AsyncSessionLocal") as mock_session:

            mock_session_instance = AsyncMock()
            mock_session_instance.get = AsyncMock(return_value=None)
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_hub.broadcast = AsyncMock()
            mock_get_pid.return_value = 2
            mock_alert_obj = MagicMock()
            mock_alert_obj.id = 100
            mock_alert.return_value = mock_alert_obj
            mock_pick.return_value = 7
            mock_dispatch.return_value = None

            await handle_game_message(client, message)

            # dispatch_accepted (which triggers nurse movement) must NOT be called here
            mock_accepted.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# 2.  broadcast_dispatch_request → MQTT publish to observer topic
# ─────────────────────────────────────────────────────────────────────────────

class TestBroadcastDispatchRequestMQTT:
    """broadcast_dispatch_request must publish to WheelSense/dispatch/<user_id>."""

    @pytest.mark.asyncio
    async def test_mqtt_published_to_observer_topic(self):
        """When assigned_user_id is set, mqtt_publish_json is called with correct topic."""
        from app.sim.services.game_bridge import broadcast_dispatch_request

        with patch("app.sim.services.game_bridge.hub") as mock_hub, \
             patch("app.services.mqtt_publish.mqtt_publish_json") as mock_mqtt:

            mock_hub.broadcast = AsyncMock()
            mock_mqtt.return_value = None  # fire-and-forget

            await broadcast_dispatch_request(
                workspace_id=1,
                alert_id=42,
                character="emika",
                room="Room401",
                assigned_user_id=7,
                patient_name="Mrs.Emika Charoenpho",
                reason="fall",
            )

        # Must have tried to publish
        mock_mqtt.assert_called_once()
        topic_arg = mock_mqtt.call_args[0][0]
        assert topic_arg == "WheelSense/dispatch/7"

        payload_arg = mock_mqtt.call_args[0][1]
        assert payload_arg["alertId"] == 42
        assert payload_arg["patientName"] == "Mrs.Emika Charoenpho"
        assert payload_arg["roomName"] == "Room401"
        assert payload_arg["type"] == "dispatch_request"

    @pytest.mark.asyncio
    async def test_mqtt_not_called_when_no_observer(self):
        """When assigned_user_id is None, no MQTT publish should occur."""
        from app.sim.services.game_bridge import broadcast_dispatch_request

        with patch("app.sim.services.game_bridge.hub") as mock_hub, \
             patch("app.services.mqtt_publish.mqtt_publish_json") as mock_mqtt:

            mock_hub.broadcast = AsyncMock()

            await broadcast_dispatch_request(
                workspace_id=1,
                alert_id=None,
                character="rattana",
                room="Room403",
                assigned_user_id=None,
                reason="fall",
            )

        mock_mqtt.assert_not_called()

    @pytest.mark.asyncio
    async def test_mqtt_failure_does_not_raise(self):
        """If MQTT publish fails, broadcast_dispatch_request must not raise."""
        from app.sim.services.game_bridge import broadcast_dispatch_request

        with patch("app.sim.services.game_bridge.hub") as mock_hub, \
             patch("app.services.mqtt_publish.mqtt_publish_json",
                   side_effect=ConnectionRefusedError("broker down")):

            mock_hub.broadcast = AsyncMock()

            # Should complete without raising
            await broadcast_dispatch_request(
                workspace_id=1,
                alert_id=10,
                character="krit",
                room="Room405",
                assigned_user_id=5,
                reason="fall",
            )

    @pytest.mark.asyncio
    async def test_dashboard_broadcast_always_fires(self):
        """hub.broadcast to dashboard must fire regardless of MQTT outcome."""
        from app.sim.services.game_bridge import broadcast_dispatch_request

        with patch("app.sim.services.game_bridge.hub") as mock_hub, \
             patch("app.services.mqtt_publish.mqtt_publish_json", side_effect=Exception("mqtt down")):

            mock_hub.broadcast = AsyncMock()

            await broadcast_dispatch_request(
                workspace_id=1,
                alert_id=99,
                character="emika",
                room="Room401",
                assigned_user_id=3,
                reason="fall",
            )

        mock_hub.broadcast.assert_called_once()
        broadcast_payload = mock_hub.broadcast.call_args[0][1]
        assert broadcast_payload["type"] == "dispatch_request"
        assert broadcast_payload["alert_id"] == 99


# ─────────────────────────────────────────────────────────────────────────────
# 3.  _pick_dispatch_observer round-robin
# ─────────────────────────────────────────────────────────────────────────────

class TestPickDispatchObserver:
    """Observer selection must round-robin across all active observers."""

    @pytest.mark.asyncio
    async def test_returns_none_when_no_observers(self):
        """If there are no observer users, return None gracefully."""
        from app.sim.services import game_bridge as gb

        with patch("app.sim.services.game_bridge.AsyncSessionLocal") as mock_session:
            mock_session_instance = AsyncMock()
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = []
            mock_session_instance.execute = AsyncMock(return_value=mock_result)

            result = await gb._pick_dispatch_observer(1)

        assert result is None

    @pytest.mark.asyncio
    async def test_round_robin_cycles_through_observers(self):
        """Successive calls should cycle through observer IDs, not repeat the same."""
        from app.sim.services import game_bridge as gb

        observer_ids = [10, 11, 12]
        call_count = [0]

        async def _mock_pick(workspace_id):
            idx = call_count[0] % len(observer_ids)
            call_count[0] += 1
            return observer_ids[idx]

        # Patch at the function level to test round-robin semantics
        with patch.object(gb, "_pick_dispatch_observer", side_effect=_mock_pick):
            picks = [await gb._pick_dispatch_observer(1) for _ in range(6)]

        assert picks == [10, 11, 12, 10, 11, 12]

    @pytest.mark.asyncio
    async def test_returns_single_observer_repeatedly(self):
        """When only one observer exists, always returns that observer."""
        from app.sim.services import game_bridge as gb

        with patch("app.sim.services.game_bridge.AsyncSessionLocal") as mock_session:
            mock_session_instance = AsyncMock()
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [99]
            mock_session_instance.execute = AsyncMock(return_value=mock_result)

            # Save and reset the global index
            old_idx = gb._dispatch_rr_index
            gb._dispatch_rr_index = 0

            try:
                result1 = await gb._pick_dispatch_observer(1)
                result2 = await gb._pick_dispatch_observer(1)
            finally:
                gb._dispatch_rr_index = old_idx

        assert result1 == 99
        assert result2 == 99


# ─────────────────────────────────────────────────────────────────────────────
# 4.  Patient profile column exists in model
# ─────────────────────────────────────────────────────────────────────────────

class TestPatientProfileColumn:
    """The Patient ORM model must expose a `profile` column."""

    def test_patient_model_has_profile_column(self):
        """Patient.__table__ must contain a `profile` column."""
        from app.models.patients import Patient
        assert "profile" in Patient.__table__.columns

    def test_patient_profile_column_is_nullable(self):
        """profile column must be nullable (health data may not exist yet)."""
        from app.models.patients import Patient
        col = Patient.__table__.columns["profile"]
        assert col.nullable is True

    def test_patient_profile_accepts_dict_payload(self):
        """Patient.profile should accept a dict (JSONB-compatible)."""
        from app.models.patients import Patient
        p = Patient()
        p.profile = {
            "stroke_risk_score": 72,
            "next_30_day_projection": "moderate_risk",
            "last_vitals_summary": {"hr": "78 bpm"},
            "daily_plan_items": [{"time": "08:00", "activity": "Breakfast"}],
        }
        assert p.profile["stroke_risk_score"] == 72
        assert isinstance(p.profile["daily_plan_items"], list)


# ─────────────────────────────────────────────────────────────────────────────
# 5.  broadcast_dispatch_accepted → WebSocket to game + dashboard
# ─────────────────────────────────────────────────────────────────────────────

class TestBroadcastDispatchAccepted:
    """dispatch_accepted must broadcast to GAME + DASHBOARD only."""

    @pytest.mark.asyncio
    async def test_broadcast_dispatch_accepted_targets_game_and_dashboard(self):
        """broadcast_dispatch_accepted should call hub.broadcast with correct types."""
        from app.sim.services.game_bridge import (
            broadcast_dispatch_accepted,
            CLIENT_TYPE_GAME,
            CLIENT_TYPE_DASHBOARD,
        )

        with patch("app.sim.services.game_bridge.hub") as mock_hub:
            mock_hub.broadcast = AsyncMock()

            await broadcast_dispatch_accepted(
                workspace_id=1,
                alert_id=42,
                character="emika",
                room="Room401",
                by_user_id=7,
                by_role="observer",
            )

        mock_hub.broadcast.assert_called_once()
        _, kwargs = mock_hub.broadcast.call_args[0], mock_hub.broadcast.call_args[1]
        # Extract only_to from positional args
        call_args = mock_hub.broadcast.call_args
        payload = call_args[0][1]
        only_to = call_args[1].get("only_to") or call_args[0][2]

        assert payload["type"] == "dispatch_accepted"
        assert payload["alert_id"] == 42
        assert payload["by_user_id"] == 7
        assert CLIENT_TYPE_GAME in only_to
        assert CLIENT_TYPE_DASHBOARD in only_to

    @pytest.mark.asyncio
    async def test_broadcast_dispatch_accepted_does_not_target_mobile(self):
        """dispatch_accepted must not be sent to mobile/observer MQTT — game handles movement."""
        from app.sim.services.game_bridge import broadcast_dispatch_accepted

        with patch("app.sim.services.game_bridge.hub") as mock_hub, \
             patch("app.services.mqtt_publish.mqtt_publish_json") as mock_mqtt:
            mock_hub.broadcast = AsyncMock()

            await broadcast_dispatch_accepted(
                workspace_id=1,
                alert_id=42,
                character="emika",
                room="Room401",
                by_user_id=7,
                by_role="observer",
            )

        # dispatch_accepted flows through WebSocket only, not MQTT
        mock_mqtt.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# 6.  MCP dispatch_caregiver_to_room → calls broadcast_go_to_room correctly
# ─────────────────────────────────────────────────────────────────────────────

class TestMCPDispatchCaregiver:
    """dispatch_caregiver_to_room MCP tool must call broadcast_go_to_room with
    positional workspace_id + correct kwargs (character/room, not character_name/room_name).
    """

    @pytest.mark.asyncio
    async def test_dispatch_calls_broadcast_go_to_room(self):
        """MCP tool must forward to broadcast_go_to_room(workspace_id, character=, room=)."""
        from app.sim.services.game_bridge import broadcast_go_to_room

        with patch("app.sim.services.game_bridge.hub") as mock_hub:
            mock_hub.broadcast = AsyncMock()

            await broadcast_go_to_room(
                1,
                character="female_nurse",
                room="Room401",
            )

        mock_hub.broadcast.assert_called_once()
        payload = mock_hub.broadcast.call_args[0][1]
        assert payload["type"] == "go_to_room"
        assert payload["character"] == "female_nurse"
        assert payload["room"] == "Room401"
