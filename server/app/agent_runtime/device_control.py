"""Deterministic room smart-device control detection for propose_turn.

Detects imperative "turn on/off <appliance> (in) <room>" utterances in English
and Thai (e.g. "Turn off the kitchen light", "ปิดไฟห้องนอน") so the runtime can
propose a ``control_room_smart_device`` action plan without depending on the
LLM tool router — which hallucinates tool names when the provider prompt does
not carry the real MCP tool schema.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

CONTROL_ROOM_SMART_DEVICE_TOOL = "control_room_smart_device"


@dataclass
class DeviceControlRequest:
    """Parsed room smart-device control utterance."""

    action: str  # "turn_on" | "turn_off" | "toggle"
    appliance: str | None = None  # canonical appliance word: light/ac/fan/tv/alarm/switch
    room: str | None = None  # room phrase in English, e.g. "kitchen" or "room 401"
    apply_to_all: bool = False  # "all"/"every" quantifier -> act on every matched device


# Canonical appliance aliases -> value used for the tool's `appliance` argument.
# Values align with SmartDevice.device_type / config["appliance"] tokens.
_EN_APPLIANCE_ALIASES: list[tuple[str, str]] = [
    ("air conditioning", "ac"),
    ("air conditioner", "ac"),
    ("aircon", "ac"),
    ("a/c", "ac"),
    ("ac", "ac"),
    ("climate", "ac"),
    ("television", "tv"),
    ("telly", "tv"),
    ("tv", "tv"),
    ("lights", "light"),
    ("light", "light"),
    ("lamp", "light"),
    ("fan", "fan"),
    ("alarm", "alarm"),
    ("switch", "switch"),
]
# Longest-first so multi-word appliances win during suffix/prefix matching.
_EN_APPLIANCE_ALIASES.sort(key=lambda item: len(item[0]), reverse=True)

_TH_APPLIANCE_ALIASES: list[tuple[str, str]] = [
    ("แอร์", "ac"),
    ("เครื่องปรับอากาศ", "ac"),
    ("พัดลม", "fan"),
    ("โทรทัศน์", "tv"),
    ("ทีวี", "tv"),
    ("ไฟ", "light"),
    ("สัญญาณเตือน", "alarm"),
    ("ออแลร์ม", "alarm"),
    ("อลาร์ม", "alarm"),
    ("สวิตช์", "switch"),
]
_TH_APPLIANCE_ALIASES.sort(key=lambda item: len(item[0]), reverse=True)

# Thai room words -> English room-name fragments used by SmartDevice.config room_name.
_TH_ROOM_ALIASES: list[tuple[str, str]] = [
    ("นั่งเล่น", "living room"),
    ("รับแขก", "living room"),
    ("น้ำ", "bathroom"),
    ("ครัว", "kitchen"),
    ("อาหาร", "dining room"),
    ("พยาบาล", "nurses' station"),
    ("นอน", "bedroom"),
    ("สวน", "garden lounge"),
    ("เลานจ์", "garden lounge"),
]
_TH_ROOM_ALIASES.sort(key=lambda item: len(item[0]), reverse=True)

_EN_ACTION_VERB_RE = re.compile(r"(?:turn|switch|power)", re.IGNORECASE)
_EN_POLITE_PREFIX_RE = re.compile(
    r"^\s*(?:please\s+|(?:can|could|would|will)\s+you\s+(?:please\s+)?|(?:can|could|would|will)\s+)",
    re.IGNORECASE,
)
_TH_POLITE_PREFIX_RE = re.compile(r"^\s*(?:ช่วย|กรุณา|โปรด|ได้โปรด|รบกวน)\s*")
_TH_TRAILING_PARTICLES_RE = re.compile(r"(?:\s*(?:ให้)?(?:หน่อย|ด่วน))?\s*(?:ครับ|ค่ะ|คะ|ฮะ|นะ|ด้วย)?[.!?ๆ]*\s*$")


def _normalize_en_action(word: str) -> str | None:
    lowered = word.strip().lower()
    if lowered == "on":
        return "turn_on"
    if lowered == "off":
        return "turn_off"
    return None


def _split_en_target(tail: str) -> tuple[str | None, str | None]:
    """Split an English target phrase into (appliance, room).

    "light in the kitchen" -> ("light", "kitchen")
    "the kitchen light"    -> ("light", "kitchen")
    "light"                -> ("light", None)
    """
    text = re.sub(r"\s+", " ", tail.strip().lower())
    text = re.sub(r"^(?:the|a|an|all)\s+", "", text)
    if not text:
        return None, None

    appliance: str | None = None
    room: str | None = None

    in_split = re.match(r"^(?P<app>.+?)\s+(?:in|inside|of)\s+(?:the\s+)?(?P<room>.+?)$", text)
    if in_split:
        app_text = in_split.group("app").strip()
        room_text = in_split.group("room").strip()
        room = room_text or None
        text = app_text

    # Strip possessive-ish leading room words: "<room> <appliance>" (e.g. "kitchen light").
    matched_alias: str | None = None
    for alias, canonical in _EN_APPLIANCE_ALIASES:
        if text == alias:
            matched_alias = canonical
            break
        if text.endswith(" " + alias):
            matched_alias = canonical
            remainder = text[: -len(alias)].strip()
            if remainder and room is None:
                room = remainder
            break
    appliance = matched_alias
    if appliance is None:
        return None, None

    if room:
        room = re.sub(r"^(?:the|a|an)\s+", "", room).strip() or None
    return appliance, room


def _parse_en_device_control(message: str) -> DeviceControlRequest | None:
    text = _EN_POLITE_PREFIX_RE.sub("", message or "").strip()
    if not text:
        return None
    lowered = text.lower()

    # "turn/switch/power on|off <target>"
    m = re.match(
        r"^(?:turn|switch|power)\s+(on|off)\s+(?:the\s+|all\s+)?(.+?)[.!?\s]*$",
        lowered,
    )
    if not m:
        # "turn/switch/power <target> on|off" (e.g. "turn the kitchen light off")
        m = re.match(
            r"^(?:turn|switch|power)\s+(?:the\s+)?(.+?)\s+(on|off)[.!?\s]*$",
            lowered,
        )
        if not m:
            # "toggle <target>"
            m2 = re.match(r"^toggle\s+(?:the\s+)?(.+?)[.!?\s]*$", lowered)
            if m2:
                appliance, room = _split_en_target(m2.group(1))
                if appliance:
                    return DeviceControlRequest(action="toggle", appliance=appliance, room=room)
            # "shut off <target>"
            m3 = re.match(r"^shut\s+(?:off|down)\s+(?:the\s+)?(.+?)[.!?\s]*$", lowered)
            if m3:
                appliance, room = _split_en_target(m3.group(1))
                if appliance:
                    return DeviceControlRequest(action="turn_off", appliance=appliance, room=room)
            return None
        action = _normalize_en_action(m.group(2))
        tail = m.group(1)
    else:
        action = _normalize_en_action(m.group(1))
        tail = m.group(2)

    if action is None:
        return None
    appliance, room = _split_en_target(tail)
    if appliance is None:
        return None
    return DeviceControlRequest(action=action, appliance=appliance, room=room)


def _map_thai_room(remainder: str) -> str | None:
    text = remainder.strip()
    if not text:
        return None
    # ห้อง 401 / ห้อง401 / room 401
    num = re.search(r"(\d{1,4})", text)
    if num:
        return f"room {int(num.group(1))}"
    for th, en in _TH_ROOM_ALIASES:
        if th in text:
            return en
    # Keep any remaining text (may already be English, e.g. "ห้อง kitchen").
    stripped = re.sub(r"ห้อง|ในห้อง|ภายใน|ที่|ใน", "", text).strip()
    return stripped or None


def _parse_th_device_control(message: str) -> DeviceControlRequest | None:
    text = _TH_POLITE_PREFIX_RE.sub("", message or "").strip()
    m = re.match(r"^(เปิด|ปิด)\s*(.+)$", text)
    if not m:
        return None
    action = "turn_on" if m.group(1) == "เปิด" else "turn_off"
    tail = _TH_TRAILING_PARTICLES_RE.sub("", m.group(2)).strip()
    if not tail:
        return None

    appliance: str | None = None
    rest = ""
    for alias, canonical in _TH_APPLIANCE_ALIASES:
        if tail.startswith(alias):
            appliance = canonical
            rest = tail[len(alias):].strip()
            break
    if appliance is None:
        # English appliance word inside a Thai command, e.g. "ปิด light ห้องนอน".
        en_appliance, _ = _split_en_target(tail)
        if en_appliance is None:
            return None
        appliance = en_appliance
        rest = ""

    room = _map_thai_room(rest)
    return DeviceControlRequest(action=action, appliance=appliance, room=room)


_EN_ALL_QUANTIFIER_RE = re.compile(r"\b(?:all|every|each)\b", re.IGNORECASE)
_TH_ALL_QUANTIFIER_RE = re.compile(r"ทั้งหมด|ทุกห้อง|ทุกดวง|ทุกตัว|ทุก\s*ห้อง|หมดทุก")


def parse_device_control_request(message: str) -> DeviceControlRequest | None:
    """Return a DeviceControlRequest for imperative room-device commands, else None.

    Only imperative on/off/toggle phrasing matches — status questions like
    "is the kitchen light on?" deliberately fall through to the read pipeline.
    """
    text = (message or "").strip()
    if not text:
        return None
    # Status questions ("is the light on?", "สถานะไฟ") are not commands; the
    # imperative verb must lead the utterance, which the regexes already require.
    if re.match(r"^\s*(?:is|are|was|were|what|which|who|where|when|how|why|do|does|did)\b", text, re.IGNORECASE):
        return None
    if re.match(r"^\s*(?:สถานะ|อยู่|ใช่ไหม|หรือไม่|หรือเปล่า)", text):
        return None
    parsed = _parse_en_device_control(text)
    if parsed is None:
        parsed = _parse_th_device_control(text)
    if parsed is not None and (_EN_ALL_QUANTIFIER_RE.search(text) or _TH_ALL_QUANTIFIER_RE.search(text)):
        parsed.apply_to_all = True
    return parsed


def smart_device_matches(
    rows: list[Any],
    *,
    appliance: str | None,
    room: str | None,
    device_name: str | None = None,
) -> list[Any]:
    """Filter SmartDevice rows using the same rules as the MCP tool resolver.

    Mirrors ``control_room_smart_device``'s ``_matches`` in app/mcp/server.py so
    the deterministic precheck resolves the same device the tool would.
    """

    def _matches(dev: Any) -> bool:
        cfg = dev.config or {}
        hay = f"{dev.name} {dev.device_type} {cfg.get('appliance', '')} {cfg.get('room_key', '')}".lower()
        if device_name and device_name.strip().lower() not in dev.name.lower():
            return False
        if appliance:
            want = appliance.strip().lower()
            if want not in {dev.device_type.lower(), str(cfg.get("appliance", "")).lower()} and want not in hay:
                return False
        if room:
            raw = room.strip().lower().replace("model", "").strip()
            # Drop the generic "room" token — every room name/key contains it
            # ("living room" would otherwise substring-match "bedroom").
            room_words = [w for w in raw.split() if w and w not in {"room", "ห้อง"}]
            room_key = str(cfg.get("room_key", "")).lower()
            room_name = str(cfg.get("room_name", "")).lower()
            if room_words and not (
                (room_key and room_key in hay and any(w in room_key for w in room_words))
                or all(w in hay or w in room_name for w in room_words)
            ):
                return False
        return True

    return [d for d in rows if _matches(d)]


def build_control_arguments(
    request: DeviceControlRequest,
    *,
    device_id: int | None = None,
) -> dict[str, Any]:
    """Build ``control_room_smart_device`` arguments from a parsed request."""
    arguments: dict[str, Any] = {"action": request.action}
    if device_id is not None:
        arguments["device_id"] = device_id
    if request.room:
        arguments["room"] = request.room
    if request.appliance:
        arguments["appliance"] = request.appliance
    return arguments
