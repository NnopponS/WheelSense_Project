"""
WheelSense v2.0 identity helpers.
Canonical device IDs:
- wheelchair (M5): WS_##
- camera/node (Tsim): WSN_###
"""

from typing import Any


def infer_device_type_from_id(raw: Any) -> str:
    """Infer device class from a raw identifier."""
    upper = str(raw or "").strip().upper()
    if upper.startswith("WSN") or upper.startswith("NODE") or upper.startswith("N"):
        return "camera"
    if upper.startswith("WS"):
        return "wheelchair"
    return "wheelchair"


def normalize_device_id(raw: Any, device_type: str = "") -> str:
    """
    Normalize device IDs to canonical public format.
    - camera/node => WSN_###
    - wheelchair(M5) => WS_##
    """
    base = str(raw or "").strip()
    if not base:
        return ""

    digits = "".join(ch for ch in base if ch.isdigit())
    if not digits:
        return base

    try:
        num = int(digits)
    except ValueError:
        return base

    if num <= 0:
        num = 1

    kind = (device_type or "").strip().lower()
    if not kind:
        kind = infer_device_type_from_id(base)

    if kind == "wheelchair":
        num = num % 100 or 1
        return f"WS_{num:02d}"

    num = num % 1000 or 1
    return f"WSN_{num:03d}"


def id_candidates(raw: Any, device_type: str = "") -> list[str]:
    """Generate candidate IDs for backward-compatible lookup."""
    base = str(raw or "").strip()
    if not base:
        return []

    candidates: list[str] = [base]
    normalized = normalize_device_id(base, device_type=device_type)
    if normalized and normalized not in candidates:
        candidates.append(normalized)

    digits = "".join(ch for ch in base if ch.isdigit())
    if digits:
        try:
            num = int(digits)
        except ValueError:
            num = 0
        if num > 0:
            raw_num = str(num)
            node_plain = f"NODE-{num}"
            node_pad = f"NODE-{num:02d}"
            node_canonical = f"WSN_{(num % 1000) or 1:03d}"
            wheel_canonical = f"WS_{(num % 100) or 1:02d}"
            for item in (raw_num, node_plain, node_pad, node_canonical, wheel_canonical):
                if item not in candidates:
                    candidates.append(item)

    return candidates
