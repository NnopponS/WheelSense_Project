"""TDD tests for simulator game bridge service and endpoints.

User Journeys:
1. As a simulator user, I want the game bridge to handle WebSocket connections
   from both the Godot game and the admin dashboard, so that location updates
   and events flow bidirectionally between the game and backend.

2. As a simulator user, I want to retrieve game configuration via REST API
   so the Godot game can align its character and room mappings on startup.

3. As an admin, I want to change sensor modes per-character via REST API
   so I can switch between mock and real device vitals for specific patients.

4. As a simulator user, I want the MQTT ingestion to filter out BLE/RSSI
   readings for characters configured with real_device sensor mode, so that
   localization stays driven by the Godot game for those characters.
"""

from __future__ import annotations

import asyncio
import json
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

# Import models
from app.models.sim_game import (
    SENSOR_MODE_MOCK,
    SENSOR_MODE_REAL,
    ACTOR_ROLE_PATIENT,
    ACTOR_ROLE_CAREGIVER,
)


# ─────────────────────────────────────────────────────────────────────────────
# Unit Tests: Game Bridge Hub
# ─────────────────────────────────────────────────────────────────────────────

class TestGameBridgeHub:
    """Unit tests for the WebSocket hub client management."""

    @pytest.mark.asyncio
    async def test_hub_registers_game_client(self):
        """Hub should accept and track a game-type WebSocket client."""
        from app.sim.services.game_bridge import hub, CLIENT_TYPE_GAME

        mock_ws = MagicMock(spec=WebSocket)
        mock_ws.application_state = 1  # CONNECTED

        client = await hub.register(mock_ws, CLIENT_TYPE_GAME, workspace_id=1)

        assert client.client_type == CLIENT_TYPE_GAME
        assert client.workspace_id == 1
        assert client.websocket == mock_ws

        # Cleanup
        await hub.unregister(client)

    @pytest.mark.asyncio
    async def test_hub_registers_dashboard_client(self):
        """Hub should accept and track a dashboard-type WebSocket client."""
        from app.sim.services.game_bridge import hub, CLIENT_TYPE_DASHBOARD

        mock_ws = MagicMock(spec=WebSocket)
        mock_ws.application_state = 1  # CONNECTED

        client = await hub.register(mock_ws, CLIENT_TYPE_DASHBOARD, workspace_id=1)

        assert client.client_type == CLIENT_TYPE_DASHBOARD
        assert client.workspace_id == 1

        # Cleanup
        await hub.unregister(client)

    @pytest.mark.asyncio
    async def test_hub_rejects_invalid_client_type(self):
        """Hub should reject unknown client types."""
        from app.sim.services.game_bridge import hub

        mock_ws = MagicMock(spec=WebSocket)

        with pytest.raises(ValueError, match="Unknown client_type"):
            await hub.register(mock_ws, "invalid_type", workspace_id=1)

    @pytest.mark.asyncio
    async def test_hub_broadcasts_to_matching_clients(self):
        """Hub should broadcast messages to clients matching the filter."""
        from app.sim.services.game_bridge import hub, CLIENT_TYPE_GAME

        mock_ws = MagicMock(spec=WebSocket)
        mock_ws.application_state = 1
        mock_ws.send_text = AsyncMock()

        client = await hub.register(mock_ws, CLIENT_TYPE_GAME, workspace_id=1)

        message = {"type": "test", "data": "hello"}
        await hub.broadcast(1, message, only_to=(CLIENT_TYPE_GAME,))

        mock_ws.send_text.assert_called_once()
        sent_payload = json.loads(mock_ws.send_text.call_args[0][0])
        assert sent_payload["type"] == "test"

        # Cleanup
        await hub.unregister(client)

    @pytest.mark.asyncio
    async def test_hub_excludes_client_from_broadcast(self):
        """Hub should exclude the sender when requested."""
        from app.sim.services.game_bridge import hub, CLIENT_TYPE_GAME

        mock_ws = MagicMock(spec=WebSocket)
        mock_ws.application_state = 1
        mock_ws.send_text = AsyncMock()

        client = await hub.register(mock_ws, CLIENT_TYPE_GAME, workspace_id=1)

        message = {"type": "test"}
        await hub.broadcast(1, message, exclude=client)

        # Should not receive because excluded
        mock_ws.send_text.assert_not_called()

        # Cleanup
        await hub.unregister(client)

    @pytest.mark.asyncio
    async def test_hub_returns_snapshot_counts(self):
        """Hub should return counts of connected clients per type."""
        from app.sim.services.game_bridge import hub, CLIENT_TYPE_GAME, CLIENT_TYPE_DASHBOARD

        mock_ws1 = MagicMock(spec=WebSocket)
        mock_ws1.application_state = 1
        mock_ws2 = MagicMock(spec=WebSocket)
        mock_ws2.application_state = 1

        client1 = await hub.register(mock_ws1, CLIENT_TYPE_GAME, workspace_id=1)
        client2 = await hub.register(mock_ws2, CLIENT_TYPE_DASHBOARD, workspace_id=1)

        snapshot = hub.snapshot(1)

        assert snapshot["game"] == 1
        assert snapshot["dashboard"] == 1

        # Cleanup
        await hub.unregister(client1)
        await hub.unregister(client2)


# ─────────────────────────────────────────────────────────────────────────────
# Integration Tests: Game Bridge Message Handlers
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_handle_game_message_character_enter_room():
    """Game 'character_enter_room' message should update DemoActorPosition."""
    from app.sim.services.game_bridge import handle_game_message, _Client, CLIENT_TYPE_GAME

    mock_ws = MagicMock(spec=WebSocket)
    client = _Client(websocket=mock_ws, client_type=CLIENT_TYPE_GAME, workspace_id=1)

    message = {
        "type": "character_enter_room",
        "character": "emika",
        "room": "Room401",
    }

    # Mock the database dependencies
    with patch("app.sim.services.game_bridge._resolve_character_and_room") as mock_resolve, \
         patch("app.sim.services.game_bridge._upsert_demo_position") as mock_upsert, \
         patch("app.sim.services.game_bridge.AsyncSessionLocal") as mock_session:

        # Setup mock returns
        mock_actor = MagicMock()
        mock_actor.patient_id = 1
        mock_actor.caregiver_id = None
        mock_resolve.return_value = (mock_actor, 21)  # room_id = 21

        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await handle_game_message(client, message)

        assert result is not None
        assert result["type"] == "character_enter_room"
        assert result["character"] == "emika"
        assert result["room"] == "Room401"
        assert result["room_id"] == 21


@pytest.mark.asyncio
async def test_handle_game_message_unknown_character():
    """Game message for unknown character should return None (no broadcast)."""
    from app.sim.services.game_bridge import handle_game_message, _Client, CLIENT_TYPE_GAME

    mock_ws = MagicMock(spec=WebSocket)
    client = _Client(websocket=mock_ws, client_type=CLIENT_TYPE_GAME, workspace_id=1)

    message = {
        "type": "character_enter_room",
        "character": "unknown_char",
        "room": "Room401",
    }

    with patch("app.sim.services.game_bridge._resolve_character_and_room") as mock_resolve, \
         patch("app.sim.services.game_bridge.AsyncSessionLocal") as mock_session:

        mock_resolve.return_value = (None, None)  # Unknown character

        mock_session.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await handle_game_message(client, message)

        assert result is None


@pytest.mark.asyncio
async def test_handle_dashboard_message_set_sensor_mode():
    """Dashboard 'set_sensor_mode' command should persist mode change."""
    from app.sim.services.game_bridge import handle_dashboard_message, _Client, CLIENT_TYPE_DASHBOARD

    mock_ws = MagicMock(spec=WebSocket)
    client = _Client(websocket=mock_ws, client_type=CLIENT_TYPE_DASHBOARD, workspace_id=1)

    message = {
        "type": "set_sensor_mode",
        "character": "emika",
        "mode": "real_device",
        "device_id": 123,
    }

    with patch("app.sim.services.game_bridge.update_sensor_mode") as mock_update:
        mock_actor = MagicMock()
        mock_actor.character_name = "emika"
        mock_actor.character_role = ACTOR_ROLE_PATIENT
        mock_actor.patient_id = 1
        mock_actor.caregiver_id = None
        mock_actor.sensor_mode = SENSOR_MODE_REAL
        mock_actor.real_device_id = 123
        mock_update.return_value = mock_actor

        result = await handle_dashboard_message(client, message)

        assert result is not None
        assert result["type"] == "sensor_mode_updated"
        assert result["character"] == "emika"
        assert result["mode"] == "real_device"
        mock_update.assert_called_once_with(1, "emika", "real_device", real_device_id=123)


# ─────────────────────────────────────────────────────────────────────────────
# Integration Tests: Sensor Mode Updates
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_sensor_mode_to_real_device():
    """update_sensor_mode should persist real_device mode with device reference."""
    from app.sim.services.game_bridge import update_sensor_mode

    with patch("app.sim.services.game_bridge.AsyncSessionLocal") as mock_session:
        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_actor = MagicMock()
        mock_actor.sensor_mode = SENSOR_MODE_REAL
        mock_actor.real_device_id = 42

        # Mock the query result
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_actor
        mock_session_instance.execute.return_value = mock_result

        result = await update_sensor_mode(1, "emika", SENSOR_MODE_REAL, real_device_id=42)

        assert result is not None
        assert result.sensor_mode == SENSOR_MODE_REAL
        assert result.real_device_id == 42


@pytest.mark.asyncio
async def test_update_sensor_mode_to_mock_clears_device():
    """update_sensor_mode to mock should clear the real_device_id."""
    from app.sim.services.game_bridge import update_sensor_mode

    with patch("app.sim.services.game_bridge.AsyncSessionLocal") as mock_session:
        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_actor = MagicMock()
        mock_actor.sensor_mode = SENSOR_MODE_MOCK
        mock_actor.real_device_id = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_actor
        mock_session_instance.execute.return_value = mock_result

        result = await update_sensor_mode(1, "emika", SENSOR_MODE_MOCK)

        assert result is not None
        assert result.sensor_mode == SENSOR_MODE_MOCK
        assert result.real_device_id is None


@pytest.mark.asyncio
async def test_update_sensor_mode_invalid_character():
    """update_sensor_mode should return None for unknown character."""
    from app.sim.services.game_bridge import update_sensor_mode

    with patch("app.sim.services.game_bridge.AsyncSessionLocal") as mock_session:
        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session_instance.execute.return_value = mock_result

        result = await update_sensor_mode(1, "unknown_char", SENSOR_MODE_MOCK)

        assert result is None


# ─────────────────────────────────────────────────────────────────────────────
# Integration Tests: RSSI Filter for Real Device Characters
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_is_rssi_from_real_device_character_true():
    """Should return True when device belongs to real_device character."""
    from app.sim.services.game_bridge import is_rssi_from_real_device_character

    with patch("app.sim.services.game_bridge.AsyncSessionLocal") as mock_session:
        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        # Mock Device query returning device.id = 5
        mock_device_result = MagicMock()
        mock_device_result.scalar_one_or_none.return_value = 5  # device.id

        # Mock SimGameActorMap query returning actor with real_device mode
        mock_actor = MagicMock()
        mock_actor.sensor_mode = SENSOR_MODE_REAL

        mock_actor_result = MagicMock()
        mock_actor_result.scalar_one_or_none.return_value = mock_actor

        mock_session_instance.execute.side_effect = [mock_device_result, mock_actor_result]

        result = await is_rssi_from_real_device_character(mock_session_instance, 1, "WS-WC-001")

        assert result is True


@pytest.mark.asyncio
async def test_is_rssi_from_real_device_character_false_when_mock():
    """Should return False when device belongs to mock character."""
    from app.sim.services.game_bridge import is_rssi_from_real_device_character

    with patch("app.sim.services.game_bridge.AsyncSessionLocal") as mock_session:
        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_device_result = MagicMock()
        mock_device_result.scalar_one_or_none.return_value = 5

        mock_actor = MagicMock()
        mock_actor.sensor_mode = SENSOR_MODE_MOCK

        mock_actor_result = MagicMock()
        mock_actor_result.scalar_one_or_none.return_value = mock_actor

        mock_session_instance.execute.side_effect = [mock_device_result, mock_actor_result]

        result = await is_rssi_from_real_device_character(mock_session_instance, 1, "WS-WC-001")

        assert result is False


@pytest.mark.asyncio
async def test_is_rssi_from_real_device_character_false_when_no_actor():
    """Should return False when device is not mapped to any character."""
    from app.sim.services.game_bridge import is_rssi_from_real_device_character

    with patch("app.sim.services.game_bridge.AsyncSessionLocal") as mock_session:
        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_device_result = MagicMock()
        mock_device_result.scalar_one_or_none.return_value = 5

        mock_actor_result = MagicMock()
        mock_actor_result.scalar_one_or_none.return_value = None  # No actor mapping

        mock_session_instance.execute.side_effect = [mock_device_result, mock_actor_result]

        result = await is_rssi_from_real_device_character(mock_session_instance, 1, "WS-WC-001")

        assert result is False


# ─────────────────────────────────────────────────────────────────────────────
# Integration Tests: MQTT Handler RSSI Filter
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_should_drop_rssi_returns_false_in_production_mode():
    """In production mode (not simulator), should never drop RSSI."""
    from app.mqtt_handler import _should_drop_rssi_for_sim_real_device
    from app.config import settings

    with patch.object(settings, "is_simulator_mode", False):
        mock_session = AsyncMock()
        result = await _should_drop_rssi_for_sim_real_device(mock_session, 1, "WS-WC-001")

        assert result is False


@pytest.mark.asyncio
async def test_should_drop_rssi_returns_true_for_real_device_in_sim_mode():
    """In simulator mode, should return True for real_device character."""
    from app.mqtt_handler import _should_drop_rssi_for_sim_real_device
    from app.config import settings

    with patch.object(settings, "is_simulator_mode", True), \
         patch("app.mqtt_handler.is_rssi_from_real_device_character") as mock_check:

        mock_check.return_value = True
        mock_session = AsyncMock()

        result = await _should_drop_rssi_for_sim_real_device(mock_session, 1, "WS-WC-001")

        assert result is True
        mock_check.assert_called_once_with(mock_session, 1, "WS-WC-001")


@pytest.mark.asyncio
async def test_should_drop_rssi_returns_false_for_mock_device_in_sim_mode():
    """In simulator mode, should return False for mock character (RSSI allowed)."""
    from app.mqtt_handler import _should_drop_rssi_for_sim_real_device
    from app.config import settings

    with patch.object(settings, "is_simulator_mode", True), \
         patch("app.mqtt_handler.is_rssi_from_real_device_character") as mock_check:

        mock_check.return_value = False
        mock_session = AsyncMock()

        result = await _should_drop_rssi_for_sim_real_device(mock_session, 1, "WS-WC-001")

        assert result is False


@pytest.mark.asyncio
async def test_should_drop_rssi_handles_import_failure_gracefully():
    """Should return False (don't drop) if game bridge import fails."""
    from app.mqtt_handler import _should_drop_rssi_for_sim_real_device
    from app.config import settings

    with patch.object(settings, "is_simulator_mode", True), \
         patch("app.mqtt_handler.is_rssi_from_real_device_character", side_effect=ImportError("No module named 'app.sim'")):

        mock_session = AsyncMock()
        result = await _should_drop_rssi_for_sim_real_device(mock_session, 1, "WS-WC-001")

        # Should not drop on import error (fail safe)
        assert result is False
