"""Parser coverage for the deterministic room smart-device control precheck."""
from __future__ import annotations

from app.agent_runtime.device_control import (
    build_control_arguments,
    parse_device_control_request,
)


def _args(message: str):
    parsed = parse_device_control_request(message)
    return None if parsed is None else build_control_arguments(parsed)


def test_english_room_appliance_commands():
    assert _args("Turn off the kitchen light") == {
        "action": "turn_off",
        "room": "kitchen",
        "appliance": "light",
    }
    assert _args("Turn on the bedroom light") == {
        "action": "turn_on",
        "room": "bedroom",
        "appliance": "light",
    }
    assert _args("Turn on the light in Room 401") == {
        "action": "turn_on",
        "room": "room 401",
        "appliance": "light",
    }
    assert _args("turn the kitchen light off") == {
        "action": "turn_off",
        "room": "kitchen",
        "appliance": "light",
    }
    assert _args("Can you turn off the kitchen light?") == {
        "action": "turn_off",
        "room": "kitchen",
        "appliance": "light",
    }
    assert _args("please switch on the living room fan") == {
        "action": "turn_on",
        "room": "living room",
        "appliance": "fan",
    }
    assert _args("turn on the AC in the bedroom") == {
        "action": "turn_on",
        "room": "bedroom",
        "appliance": "ac",
    }
    assert _args("toggle the kitchen light") == {
        "action": "toggle",
        "room": "kitchen",
        "appliance": "light",
    }


def test_thai_room_appliance_commands():
    assert _args("ปิดไฟห้องนอน") == {
        "action": "turn_off",
        "room": "bedroom",
        "appliance": "light",
    }
    assert _args("เปิดไฟห้องนั่งเล่น") == {
        "action": "turn_on",
        "room": "living room",
        "appliance": "light",
    }
    assert _args("ปิดแอร์ห้องครัว") == {
        "action": "turn_off",
        "room": "kitchen",
        "appliance": "ac",
    }
    assert _args("เปิดไฟในห้อง 401") == {
        "action": "turn_on",
        "room": "room 401",
        "appliance": "light",
    }
    assert _args("ปิดไฟห้องนอนให้หน่อย") == {
        "action": "turn_off",
        "room": "bedroom",
        "appliance": "light",
    }
    assert _args("เปิดพัดลมห้องนอนครับ") == {
        "action": "turn_on",
        "room": "bedroom",
        "appliance": "fan",
    }
    assert _args("ปิดไฟ") == {"action": "turn_off", "appliance": "light"}


def test_all_quantifier_sets_apply_to_all():
    parsed = parse_device_control_request("Turn off all the lights")
    assert parsed is not None
    assert parsed.apply_to_all is True
    assert parsed.appliance == "light"

    parsed = parse_device_control_request("turn off the light in every room")
    assert parsed is not None
    assert parsed.apply_to_all is True

    parsed = parse_device_control_request("ปิดไฟทุกห้อง")
    assert parsed is not None
    assert parsed.apply_to_all is True
    assert parsed.appliance == "light"

    parsed = parse_device_control_request("ปิดแอร์ทั้งหมด")
    assert parsed is not None
    assert parsed.apply_to_all is True
    assert parsed.appliance == "ac"


def test_single_room_commands_do_not_set_apply_to_all():
    for message in (
        "Turn off the kitchen light",
        "turn off the hallway light",
        "please switch on the living room fan",
        "ปิดไฟห้องนอน",
        "เปิดไฟห้องนั่งเล่น",
    ):
        parsed = parse_device_control_request(message)
        assert parsed is not None
        assert parsed.apply_to_all is False, message


def test_non_commands_do_not_match():
    assert parse_device_control_request("is the kitchen light on?") is None
    assert parse_device_control_request("how many patients are there") is None
    assert parse_device_control_request("สถานะไฟห้องนอน") is None
    assert parse_device_control_request("list devices") is None
    assert parse_device_control_request("create task") is None
    assert parse_device_control_request("") is None


def test_arguments_include_device_id_when_resolved():
    parsed = parse_device_control_request("Turn off the kitchen light")
    assert parsed is not None
    args = build_control_arguments(parsed, device_id=10)
    assert args == {
        "action": "turn_off",
        "device_id": 10,
        "room": "kitchen",
        "appliance": "light",
    }
