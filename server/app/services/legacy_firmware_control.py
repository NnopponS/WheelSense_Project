from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models.base import utcnow
from app.models.core import Room, SmartDevice
from app.services.device_management import publish_mqtt


LEGACY_ROOM_TOPICS = {
    "bedroom": "bedroom",
    "livingroom": "livingroom",
    "living_room": "livingroom",
    "living room": "livingroom",
    "bathroom": "bathroom",
    "kitchen": "kitchen",
    "dining": "kitchen",
    "dining room": "kitchen",
    "kitchen / dining": "kitchen",
}

LEGACY_ON_STATES = {"on", "heat", "cool", "fan_only", "dry", "auto"}


@dataclass(frozen=True)
class LegacyFirmwareCommand:
    topic: str
    payload: dict[str, Any]
    room: str
    appliance: str


def _norm(value: str | None) -> str:
    return (value or "").strip().lower().replace("_", " ").replace("-", " ")


def _device_config(device: SmartDevice) -> dict[str, Any]:
    return device.config if isinstance(device.config, dict) else {}


def _legacy_config(device: SmartDevice) -> dict[str, Any]:
    cfg = _device_config(device)
    nested = cfg.get("legacy_firmware")
    return nested if isinstance(nested, dict) else {}


def _config_value(device: SmartDevice, nested_key: str, *flat_keys: str) -> Any:
    nested = _legacy_config(device)
    if nested_key in nested:
        return nested[nested_key]
    cfg = _device_config(device)
    for key in flat_keys:
        if key in cfg:
            return cfg[key]
    return None


def _config_enabled(device: SmartDevice) -> bool | None:
    value = _config_value(
        device,
        "enabled",
        "legacy_firmware_enabled",
        "old_firmware_enabled",
        "use_legacy_firmware",
    )
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return _norm(value) in {"1", "true", "yes", "on", "enabled"}
    return bool(value)


def _legacy_room_from_override(value: Any) -> str | None:
    if value is None:
        return None
    normalized = _norm(str(value))
    return LEGACY_ROOM_TOPICS.get(normalized)


def _legacy_room_from_room(room: Room | None, *, include_room_type: bool = False) -> str | None:
    if room is None:
        return None
    name = _norm(room.name)
    room_type = _norm(room.room_type)
    if "401" in name or name == "bedroom":
        return "bedroom"
    if "402" in name or name in {"livingroom", "living room"}:
        return "livingroom"
    if name in {"bathroom", "bath room"}:
        return "bathroom"
    if name in {"dining", "dining room", "kitchen", "kitchen / dining"}:
        return "kitchen"
    if not include_room_type:
        return None
    if room_type in {"bedroom", "bathroom", "kitchen"}:
        return LEGACY_ROOM_TOPICS[room_type]
    if "living" in room_type or room_type == "lounge":
        return "livingroom"
    if "dining" in room_type:
        return "kitchen"
    return None


def legacy_room_for_device(device: SmartDevice, room: Room | None) -> str | None:
    explicit_enabled = _config_enabled(device)
    if explicit_enabled is False:
        return None

    override = _config_value(
        device,
        "room",
        "legacy_room",
        "legacy_firmware_room",
        "old_firmware_room",
        "firmware_room",
        "physical_zone",
    )
    legacy_room = _legacy_room_from_override(override)
    if legacy_room:
        return legacy_room

    auto_room = _legacy_room_from_room(room, include_room_type=explicit_enabled is True)
    if explicit_enabled is True or auto_room:
        return auto_room
    return None


def _legacy_appliance_from_override(value: Any) -> str | None:
    if value is None:
        return None
    normalized = _norm(str(value))
    if normalized in {"ac", "air", "aircon", "air con", "climate"}:
        return "AC"
    if normalized in {"light", "fan", "tv", "alarm"}:
        return normalized
    return None


def legacy_appliance_for_device(device: SmartDevice) -> str:
    override = _config_value(
        device,
        "appliance",
        "legacy_appliance",
        "legacy_firmware_appliance",
        "old_firmware_appliance",
        "firmware_appliance",
    )
    appliance = _legacy_appliance_from_override(override)
    if appliance:
        return appliance

    label = _norm(f"{device.device_type} {device.name} {device.ha_entity_id}")
    if "climate" in label or "aircon" in label or "air con" in label or " ac" in f" {label} ":
        return "AC"
    if "fan" in label:
        return "fan"
    if "tv" in label or "television" in label:
        return "tv"
    if "alarm" in label or "siren" in label:
        return "alarm"
    return "light"


def _is_on_state(value: str | None) -> bool:
    return _norm(value) in LEGACY_ON_STATES


def _state_for_action(action: str, current_state: str | None) -> bool | None:
    service = _norm(action.split(".", 1)[1] if "." in action else action)
    if service in {"turn on", "on"}:
        return True
    if service in {"turn off", "off"}:
        return False
    if service == "toggle":
        return not _is_on_state(current_state)
    return None


def _value_for_parameters(parameters: dict[str, Any] | None) -> int | None:
    if not parameters:
        return None
    for key in ("value", "brightness", "speed", "temperature"):
        raw = parameters.get(key)
        if raw is None:
            continue
        try:
            return int(float(raw))
        except (TypeError, ValueError):
            continue
    return None


def build_legacy_firmware_command(
    *,
    device: SmartDevice,
    room: Room | None,
    action: str,
    parameters: dict[str, Any] | None = None,
) -> LegacyFirmwareCommand | None:
    legacy_room = legacy_room_for_device(device, room)
    if legacy_room is None:
        return None

    state = _state_for_action(action, device.state)
    value = _value_for_parameters(parameters)
    if state is None and value is None:
        return None

    appliance = legacy_appliance_for_device(device)
    payload: dict[str, Any] = {
        "type": "control",
        "room": legacy_room,
        "appliance": appliance,
        "timestamp": utcnow().isoformat(),
    }
    if state is not None:
        payload["state"] = state
    if value is not None:
        payload["value"] = value

    return LegacyFirmwareCommand(
        topic=f"WheelSense/{legacy_room}/control",
        payload=payload,
        room=legacy_room,
        appliance=appliance,
    )


async def publish_legacy_firmware_control(
    *,
    device: SmartDevice,
    room: Room | None,
    action: str,
    parameters: dict[str, Any] | None = None,
) -> LegacyFirmwareCommand | None:
    command = build_legacy_firmware_command(
        device=device,
        room=room,
        action=action,
        parameters=parameters,
    )
    if command is None:
        return None
    await publish_mqtt(command.topic, command.payload)
    return command
