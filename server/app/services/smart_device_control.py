from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import Room, SmartDevice
from app.services import device_activity as device_activity_service
from app.services.homeassistant import ha_service
from app.services.legacy_firmware_control import (
    LegacyFirmwareCommand,
    publish_legacy_firmware_control,
)


@dataclass(frozen=True)
class SmartDeviceControlResult:
    homeassistant_sent: bool
    homeassistant_error: str | None
    legacy_firmware_command: LegacyFirmwareCommand | None
    legacy_firmware_error: str | None
    local_state: str | None

    @property
    def success(self) -> bool:
        return self.homeassistant_sent or self.legacy_firmware_command is not None

    def response_data(self, device: SmartDevice) -> dict[str, Any]:
        legacy = None
        if self.legacy_firmware_command is not None:
            legacy = {
                "topic": self.legacy_firmware_command.topic,
                "room": self.legacy_firmware_command.room,
                "appliance": self.legacy_firmware_command.appliance,
                "payload": self.legacy_firmware_command.payload,
            }
        return {
            "entity_id": device.ha_entity_id,
            "homeassistant": "sent" if self.homeassistant_sent else "failed",
            "homeassistant_error": self.homeassistant_error,
            "legacy_firmware": legacy,
            "legacy_firmware_error": self.legacy_firmware_error,
            "local_state": self.local_state,
        }


def local_state_for_control_action(action: str, current_state: str | None = None) -> str | None:
    service = action.split(".", 1)[1] if "." in action else action
    normalized = service.strip().lower().replace("_", " ")
    if normalized in {"turn on", "on"}:
        return "on"
    if normalized in {"turn off", "off"}:
        return "off"
    if normalized == "toggle":
        current = (current_state or "").strip().lower()
        return "off" if current in {"on", "heat", "cool", "fan_only", "dry", "auto"} else "on"
    return None


def _config_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "enabled"}
    return bool(value)


def _ha_enabled(device: SmartDevice) -> bool:
    cfg = device.config if isinstance(device.config, dict) else {}
    legacy_cfg = cfg.get("legacy_firmware")
    if isinstance(legacy_cfg, dict):
        value = legacy_cfg.get("ha_enabled")
        if value is not None:
            return _config_bool(value)
    for key in ("ha_enabled", "homeassistant_enabled"):
        value = cfg.get(key)
        if value is not None:
            return _config_bool(value)
    return True


def _mirror_homeassistant_after_legacy(device: SmartDevice) -> bool:
    cfg = device.config if isinstance(device.config, dict) else {}
    legacy_cfg = cfg.get("legacy_firmware")
    if isinstance(legacy_cfg, dict):
        for key in ("mirror_homeassistant", "ha_mirror"):
            value = legacy_cfg.get(key)
            if value is not None:
                return _config_bool(value)
    for key in ("legacy_firmware_mirror_homeassistant", "mirror_homeassistant"):
        value = cfg.get(key)
        if value is not None:
            return _config_bool(value)
    return False


def _delivery_message(result: SmartDeviceControlResult) -> str:
    transports: list[str] = []
    if result.legacy_firmware_command is not None:
        transports.append("public MQTT")
    if result.homeassistant_sent:
        transports.append("Home Assistant")
    return " and ".join(transports) if transports else "no transport"


async def control_smart_device_transports(
    session: AsyncSession,
    *,
    ws_id: int,
    device: SmartDevice,
    action: str,
    parameters: dict[str, Any] | None = None,
) -> SmartDeviceControlResult:
    room = await session.get(Room, device.room_id) if device.room_id is not None else None
    legacy_command: LegacyFirmwareCommand | None = None
    legacy_error: str | None = None
    try:
        legacy_command = await publish_legacy_firmware_control(
            device=device,
            room=room,
            action=action,
            parameters=parameters,
        )
    except Exception as exc:
        legacy_error = str(exc)

    ha_sent = False
    ha_error: str | None = None
    should_call_ha = _ha_enabled(device) and (
        legacy_command is None or _mirror_homeassistant_after_legacy(device)
    )
    if should_call_ha:
        try:
            ha_sent = await ha_service.call_service(
                action=action,
                entity_id=device.ha_entity_id,
                service_data=parameters,
            )
            if not ha_sent:
                ha_error = f"Home Assistant rejected command for {device.ha_entity_id}"
        except Exception as exc:  # pragma: no cover - defensive around upstream client
            ha_error = str(exc)
    elif legacy_command is not None:
        ha_error = "Skipped because public MQTT handled the command"
    else:
        ha_error = "Home Assistant disabled for this device"

    local_state = local_state_for_control_action(action, device.state)
    result = SmartDeviceControlResult(
        homeassistant_sent=ha_sent,
        homeassistant_error=ha_error,
        legacy_firmware_command=legacy_command,
        legacy_firmware_error=legacy_error,
        local_state=local_state if (ha_sent or legacy_command is not None) else None,
    )
    if result.success and result.local_state is not None:
        device.state = result.local_state
        await session.commit()
        await device_activity_service.log_event(
            session,
            ws_id,
            "smart_control",
            f"Smart device {device.name} set to {result.local_state} via {_delivery_message(result)}",
            smart_device_id=device.id,
            details=result.response_data(device),
        )
    return result
