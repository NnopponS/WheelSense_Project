"""Map room node link strings (WSN_*, labels) to registry :class:`~app.models.core.Device` rows."""

from __future__ import annotations

from app.models.core import Device


def resolve_registry_node_device(raw: str | None, nodes: list[Device]) -> Device | None:
    """Resolve a room's ``node_device_id`` string to the canonical registry device.

    Rooms may store a beacon label (e.g. ``WSN_004``) while the fleet row uses ``CAM_*`` / ``BLE_*``.
    Match exact ``device_id`` first, then ``config.ble_node_id``, then ``display_name`` / first token.
    """
    if not raw or not str(raw).strip():
        return None
    key = str(raw).strip()
    key_lower = key.lower()
    for device in nodes:
        if device.device_id == key:
            return device
    for device in nodes:
        cfg = device.config if isinstance(device.config, dict) else {}
        ble_node = str(cfg.get("ble_node_id") or "").strip()
        if ble_node and ble_node.lower() == key_lower:
            return device
    for device in nodes:
        disp = (device.display_name or "").strip()
        if not disp:
            continue
        first = disp.split()[0] if disp else ""
        if disp.lower() == key_lower or first.lower() == key_lower:
            return device
    return None
