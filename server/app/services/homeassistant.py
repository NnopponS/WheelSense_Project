from __future__ import annotations

import httpx
import logging
from typing import Dict, Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.core import SmartDevice

logger = logging.getLogger(__name__)

class HomeAssistantService:
    def __init__(self):
        self.base_url = settings.ha_base_url.rstrip("/")
        self.token = settings.ha_access_token
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    async def get_state(self, entity_id: str) -> Optional[Dict[str, Any]]:
        """Fetch the current state of an entity from HomeAssistant."""
        if not self.token:
            logger.warning("HomeAssistant integration is incomplete (no access token).")
            return None

        url = f"{self.base_url}/api/states/{entity_id}"
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=self.headers, timeout=5.0)
                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 404:
                    logger.warning(f"Entity not found in HA: {entity_id}")
                    return None
                else:
                    logger.error(f"Failed to fetch state for {entity_id}: {response.text}")
                    return None
        except httpx.RequestError as exc:
            logger.error(f"Error communicating with HA while requesting {exc.request.url!r}.")
            return None

    async def call_service(self, action: str, entity_id: str, service_data: Dict[str, Any] = None) -> bool:
        """
        Call a HomeAssistant service.
        action format usually like: 'light.turn_on' or 'switch.toggle'.
        However, if the action is just 'turn_on', we can infer the domain from the entity_id (e.g. 'light').
        """
        if not self.token:
            logger.warning("HomeAssistant integration is incomplete (no access token).")
            return False

        if "." in action:
            domain, service = action.split(".", 1)
        else:
            domain = entity_id.split(".")[0]
            service = action

        url = f"{self.base_url}/api/services/{domain}/{service}"
        payload = {"entity_id": entity_id}
        if service_data:
            payload.update(service_data)

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=5.0)
                if response.status_code == 200:
                    return True
                else:
                    logger.error(f"Failed to call service {action} on {entity_id}: {response.text}")
                    return False
        except httpx.RequestError as exc:
            logger.error(f"Error communicating with HA while requesting {exc.request.url!r}.")
            return False

ha_service = HomeAssistantService()


# ── Shared smart-device control ───────────────────────────────────────────────
# Used by the REST endpoint (api/endpoints/homeassistant.py), the MCP tool
# (mcp/server.py) and the E84 room-node MQTT event path (services/room_node.py).


class SmartDeviceControlError(Exception):
    """Control failure carrying the HTTP status a route would have used."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def use_seeded_simulator_state(device: SmartDevice) -> bool:
    config = device.config if isinstance(device.config, dict) else {}
    return (
        settings.is_simulator_mode
        or config.get("seed") is True
        or config.get("pin_board") == "CucumberRS"
    )


async def forward_to_cucumber_if_mapped(
    db: AsyncSession,
    device: SmartDevice,
    *,
    is_on: bool,
    value: float | int | None = None,
) -> None:
    from app.hardware_bridge import facility_room_name_to_physical_key, hardware_bridge
    from app.models.core import Room

    cfg = device.config if isinstance(device.config, dict) else {}
    room_key = cfg.get("room_key")
    if not room_key and device.room_id is not None:
        rm = await db.get(Room, device.room_id)
        if rm is not None:
            room_key = facility_room_name_to_physical_key(rm.name)
    if not room_key:
        return

    appliance = cfg.get("appliance")
    if not appliance:
        dtype = (device.device_type or "").lower()
        name_low = (device.name or "").lower()
        if dtype == "climate" or "ac" in name_low or "air" in name_low:
            appliance = "AC"
        elif dtype == "fan" or "fan" in name_low:
            appliance = "fan"
        elif "tv" in name_low:
            appliance = "tv"
        elif "alarm" in name_low:
            appliance = "alarm"
        else:
            appliance = "light"

    await hardware_bridge.publish_cucumber_control(
        room_key=str(room_key),
        appliance=str(appliance),
        state=is_on,
        value=value,
    )


async def apply_smart_device_control(
    db: AsyncSession,
    device: SmartDevice,
    *,
    action: str,
    parameters: Dict[str, Any] | None = None,
    simulator: bool | None = None,
) -> Dict[str, Any]:
    """Apply a control action to a SmartDevice through the seeded/simulator path
    or a real HomeAssistant call — the same behavior as the REST control
    endpoint. Returns a result dict with entity_id/state/attributes.
    Raises SmartDeviceControlError on validation or transport failures.

    ``simulator`` lets the caller pin the branch (the REST endpoint resolves it
    through its own patchable ``_use_seeded_simulator_state`` hook); ``None``
    auto-detects via ``use_seeded_simulator_state``.
    """
    if not device.is_active:
        raise SmartDeviceControlError(400, "Smart device is marked inactive")

    parameters = dict(parameters or {})
    if simulator is None:
        simulator = use_seeded_simulator_state(device)

    if simulator:
        act = action.strip().lower()
        config = dict(device.config or {})
        current_state = (device.state or "off").strip().lower()

        if act == "turn_on":
            device.state = "cool" if device.device_type == "climate" else "on"
        elif act == "turn_off":
            device.state = "off"
        elif act == "toggle":
            if current_state not in {"off", "unknown", "unavailable"}:
                device.state = "off"
            else:
                device.state = "cool" if device.device_type == "climate" else "on"
        elif act in {"set_temperature", "climate.set_temperature"}:
            raw_temperature = parameters.get("temperature")
            try:
                temperature = float(raw_temperature)
            except (TypeError, ValueError) as exc:
                raise SmartDeviceControlError(400, "temperature must be a number") from exc
            if temperature < 16 or temperature > 30:
                raise SmartDeviceControlError(400, "temperature must be between 16 and 30 C")
            config["target_temperature"] = temperature
            config["temperature"] = temperature
            device.config = config
        else:
            raise SmartDeviceControlError(400, f"Unsupported simulator smart-device action: {action}")

        db.add(device)
        await db.commit()
        await db.refresh(device)

        is_now_on = (device.state or "off").strip().lower() not in {"off", "unknown", "unavailable"}
        temp_val = config.get("temperature") if device.device_type == "climate" else None
        await forward_to_cucumber_if_mapped(db, device, is_on=is_now_on, value=temp_val)

        return {
            "entity_id": device.ha_entity_id,
            "state": device.state or "unknown",
            "attributes": dict(device.config or {}),
            "simulator": True,
        }

    success = await ha_service.call_service(
        action=action,
        entity_id=device.ha_entity_id,
        service_data=parameters,
    )
    if not success:
        raise SmartDeviceControlError(
            502,
            f"Failed to communicate with HomeAssistant for {device.ha_entity_id}. Check HA token.",
        )

    # Refresh the cached state so downstream consumers (room screens) see truth.
    ha_state = await ha_service.get_state(device.ha_entity_id)
    if ha_state is not None and "state" in ha_state:
        device.state = ha_state["state"]
        db.add(device)
        await db.commit()
        await db.refresh(device)

    return {
        "entity_id": device.ha_entity_id,
        "state": device.state or "unknown",
        "attributes": dict(device.config or {}),
        "simulator": False,
    }
