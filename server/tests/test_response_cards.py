from __future__ import annotations

from app.agent_runtime.response_cards import (
    cards_for_execution_result,
    cards_for_tool_result,
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
