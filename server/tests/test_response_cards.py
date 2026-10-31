from __future__ import annotations

from app.agent_runtime.response_cards import (
    cards_for_execution_result,
    cards_for_tool_result,
    cards_for_tool_results,
)


def test_timeline_tool_result_builds_timeline_card():
    cards = cards_for_tool_result(
        "get_patient_timeline",
        {
            "patient_id": 7,
            "events": [
                {
                    "id": 1,
                    "event_type": "room_prediction",
                    "room_name": "Room 101",
                }
            ],
        },
    )

    assert cards[0]["kind"] == "timeline"
    assert cards[0]["patient_id"] == 7
    assert cards[0]["events"][0]["room_name"] == "Room 101"


def test_task_table_keeps_due_date_visible_in_six_column_chat():
    row = dict(id=41, title="Hydration round - Samuel", status="pending", priority="normal", task_type="specific", patient_id=6, patient_name="Samuel Ortiz", assigned_user_id=5, due_at="2026-10-18T23:51:00Z")
    card = cards_for_tool_result("list_task_management_tasks", [row])[0]
    assert "due_at" in card["columns"][:6]
    assert "patient_name" in card["columns"][:6]
    assert card["title"] == "Tasks"


def test_patient_details_card_preserves_complete_profile_payload():
    cards = cards_for_tool_result(
        "get_patient_details",
        {
            "id": 8,
            "first_name": "Card",
            "last_name": "Patient",
            "date_of_birth": "1940-01-02",
            "height_cm": 170,
            "weight_kg": 72.25,
            "bmi": 25.0,
            "blood_type": "O+",
            "medical_conditions": ["hypertension"],
            "allergies": ["penicillin"],
            "medications": [{"name": "Amlodipine"}],
            "past_surgeries": [{"procedure": "Hip replacement"}],
            "clinical_notes": "Needs fall-risk checks.",
            "emergency_contacts": [{"name": "Emergency Contact"}],
            "assigned_staff": [{"id": 3, "first_name": "Assigned"}],
            "room": {"id": 4, "name": "Room 204"},
        },
    )

    assert cards[0]["kind"] == "patient_summary"
    assert cards[0]["patient"]["patient_name"] == "Card Patient"
    assert cards[0]["patient"]["room_name"] == "Room 204"
    assert cards[0]["patient"]["bmi"] == 25.0
    assert cards[0]["patient"]["emergency_contacts"][0]["name"] == "Emergency Contact"


def test_current_user_context_builds_profile_summary_card():
    cards = cards_for_tool_result(
        "get_current_user_context",
        {
            "user_id": 12,
            "role": "patient",
            "user": {"id": 12, "username": "robert.c", "role": "patient", "status": "active"},
            "workspace": {"id": 2, "name": "WheelSense Demo Workspace"},
            "linked_patient": {
                "id": 8,
                "display_name": "Robert Chen",
                "room_name": "Room 402",
                "care_level": "critical",
            },
        },
    )

    assert cards[0]["kind"] == "profile_summary"
    assert cards[0]["profile"]["display_name"] == "Robert Chen"
    assert cards[0]["profile"]["role"] == "patient"
    assert cards[0]["profile"]["room_name"] == "Room 402"


def test_list_devices_tool_result_preserves_online_fields_in_data_table():
    cards = cards_for_tool_result(
        "list_devices",
        [
            {
                "device_id": "FRESH1",
                "display_name": "Fresh chair",
                "online": True,
                "status": "online",
            }
        ],
    )

    assert cards[0]["kind"] == "data_table"
    assert cards[0]["source"] == "list_devices"
    assert cards[0]["rows"][0]["device_id"] == "FRESH1"
    assert cards[0]["rows"][0]["online"] is True
    assert cards[0]["rows"][0]["status"] == "online"


def test_list_visible_patients_tool_result_uses_data_table_not_empty_summary():
    cards = cards_for_tool_result(
        "list_visible_patients",
        [
            {
                "id": 8,
                "first_name": "Robert",
                "last_name": "Chen",
                "nickname": "Robert",
                "room_id": 402,
            }
        ],
    )

    assert [card["kind"] for card in cards] == ["data_table"]
    assert cards[0]["source"] == "list_visible_patients"
    assert cards[0]["rows"][0]["first_name"] == "Robert"


def test_task_execution_result_builds_task_success_card():
    cards = cards_for_execution_result(
        {
            "steps": [
                {
                    "step_id": "task-1",
                    "tool_name": "create_task_management_task",
                    "result": {
                        "id": 12,
                        "title": "Blood draw",
                        "status": "pending",
                    },
                }
            ]
        }
    )

    assert cards[0]["kind"] == "task_success"
    assert cards[0]["task"]["id"] == 12
    assert cards[0]["task"]["title"] == "Blood draw"


def _presence_payload() -> dict:
    return {
        "facility_id": 1,
        "floor_id": 2,
        "computed_at": "2026-10-30T10:00:00Z",
        "rooms": [
            {
                "room_id": 25,
                "room_name": "Bedroom",
                "node_status": "online",
                "occupants": [{"display_name": "Robert Chen", "actor_type": "patient"}],
                "patient_hint": None,
                "alert_count": 0,
                "smart_devices_summary": [
                    {"id": 5, "name": "Bedroom Light", "device_type": "light", "state": "on", "is_active": True},
                    {"id": 7, "name": "Bedroom TV", "device_type": "switch", "state": "off", "is_active": True},
                ],
                "camera_summary": {"latest_photo_url": "/api/video/bedroom?t=1", "capture_available": True},
            },
            {
                "room_id": 26,
                "room_name": "Kitchen",
                "node_status": "online",
                "occupants": [],
                "patient_hint": None,
                "alert_count": 1,
                "smart_devices_summary": [
                    {"id": 9, "name": "Kitchen Light", "device_type": "light", "state": "off", "is_active": True},
                ],
                "camera_summary": {"latest_photo_url": None, "capture_available": True},
            },
        ],
    }


def test_floorplan_presence_builds_smart_home_card():
    cards = cards_for_tool_result("get_floorplan_presence", _presence_payload())

    assert [card["kind"] for card in cards] == ["smart_home"]
    card = cards[0]
    assert card["stats"]["total_rooms"] == 2
    assert card["stats"]["occupied_rooms"] == 1
    assert card["stats"]["devices_on"] == 1
    assert card["stats"]["alerts"] == 1
    bedroom = card["rooms"][0]
    assert bedroom["occupied"] is True
    assert bedroom["occupants"] == ["Robert Chen"]
    assert bedroom["devices"][0]["on"] is True
    assert bedroom["devices"][1]["on"] is False
    assert bedroom["camera_url"] == "/api/video/bedroom?t=1"
    kitchen = card["rooms"][1]
    assert kitchen["occupied"] is False
    assert kitchen["alert_count"] == 1


def test_list_active_alerts_builds_alert_feed_card():
    cards = cards_for_tool_result(
        "list_active_alerts",
        [
            {"id": 3, "alert_type": "fall_detected", "severity": "critical", "status": "active", "patient_id": 8, "created_at": "2026-10-30T09:00:00Z"},
            {"id": 4, "alert_type": "device_offline", "severity": "warning", "status": "active", "patient_id": None, "created_at": "2026-10-30T09:05:00Z"},
        ],
    )

    assert [card["kind"] for card in cards] == ["alert_feed"]
    card = cards[0]
    assert card["total_count"] == 2
    assert card["alerts"][0]["severity"] == "critical"
    assert card["alerts"][0]["id"] == 3


def test_control_room_smart_device_builds_device_control_card():
    cards = cards_for_tool_result(
        "control_room_smart_device",
        {"device_id": 5, "ha_entity_id": "light.ws1_room25_bedroom_light", "action": "turn_off", "state": "off"},
    )

    assert [card["kind"] for card in cards] == ["device_control"]
    assert cards[0]["on"] is False
    assert cards[0]["state"] == "off"
    assert cards[0]["ha_entity_id"] == "light.ws1_room25_bedroom_light"


def test_device_control_card_surfaces_from_execution_result():
    cards = cards_for_execution_result(
        {
            "steps": [
                {
                    "step_id": "ctrl-1",
                    "tool_name": "control_room_smart_device",
                    "result": {"device_id": 5, "ha_entity_id": "light.ws1_room25_bedroom_light", "action": "turn_on", "state": "on"},
                }
            ]
        }
    )

    assert cards[0]["kind"] == "device_control"
    assert cards[0]["on"] is True


def test_smart_home_card_ignores_empty_presence():
    cards = cards_for_tool_result("get_floorplan_presence", {"facility_id": 1, "floor_id": 2, "rooms": []})

    assert [card["kind"] for card in cards] == ["tool_result"]


def test_layout_merges_geometry_into_smart_home_card():
    layout = {
        "facility_id": 1,
        "floor_id": 2,
        "floor_name": "Level 2 - Model Home",
        "has_layout": True,
        "layout": {
            "version": 3,
            "rooms": [
                {"id": "room-25", "room_id": 25, "label": "Bedroom", "x": 2.0, "y": 2.0, "w": 26.0, "h": 16.0},
                {"id": "room-26", "room_id": 26, "label": "Kitchen", "x": 30.0, "y": 2.0, "w": 26.0, "h": 16.0},
            ],
        },
    }
    cards = cards_for_tool_results(
        [
            ("get_floorplan_presence", _presence_payload()),
            ("get_floorplan_layout", layout),
        ]
    )

    kinds = [card["kind"] for card in cards]
    assert "smart_home" in kinds
    assert "floorplan_map" not in kinds  # folded into smart_home
    card = cards[0]
    assert card["layout_rooms"][0]["label"] == "Bedroom"
    bedroom = next(r for r in card["rooms"] if r["room_id"] == 25)
    assert bedroom["x"] == 2.0 and bedroom["w"] == 26.0
    kitchen = next(r for r in card["rooms"] if r["room_id"] == 26)
    assert kitchen["x"] == 30.0


def test_floorplan_layout_alone_builds_floorplan_map_card():
    cards = cards_for_tool_result(
        "get_floorplan_layout",
        {
            "facility_id": 1,
            "floor_id": 2,
            "floor_name": "Level 2 - Model Home",
            "has_layout": True,
            "layout": {
                "version": 3,
                "rooms": [
                    {"id": "room-25", "room_id": 25, "label": "Bedroom", "x": 2.0, "y": 2.0, "w": 26.0, "h": 16.0},
                ],
            },
        },
    )

    assert [card["kind"] for card in cards] == ["floorplan_map"]
    assert cards[0]["title"] == "Level 2 - Model Home"
    assert cards[0]["layout_rooms"][0]["room_id"] == 25
