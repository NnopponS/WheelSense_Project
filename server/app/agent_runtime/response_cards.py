"""Canonical rich response-card helpers for EaseAI chat grounding."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from app.schemas.agent_runtime import ExecutionPlan, ExecutionPlanStep

RESPONSE_CARD_KINDS: frozenset[str] = frozenset(
    {
        "timeline",
        "patient_health_analysis",
        "task_draft",
        "question_choices",
        "plan_summary",
        "task_success",
        "data_table",
        "patient_summary",
        "profile_summary",
        "staff_summary",
        "navigation",
        "tool_result",
    }
)


def _jsonable(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if hasattr(value, "model_dump"):
        return _jsonable(value.model_dump(mode="json"))
    return value


def _clean_dict(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        key: _jsonable(value)
        for key, value in payload.items()
        if value is not None
    }


def make_response_card(kind: str, **payload: Any) -> dict[str, Any]:
    """Build a normalized card dict and reject unknown card kinds."""
    if kind not in RESPONSE_CARD_KINDS:
        raise ValueError(f"Unknown EaseAI response card kind: {kind}")
    return {"kind": kind, **_clean_dict(payload)}


def normalize_response_cards(cards: Any) -> list[dict[str, Any]]:
    if not isinstance(cards, list):
        return []
    normalized: list[dict[str, Any]] = []
    for card in cards:
        if not isinstance(card, dict):
            continue
        kind = card.get("kind")
        if kind not in RESPONSE_CARD_KINDS:
            continue
        normalized.append(_clean_dict(dict(card)))
    return normalized


def attach_response_cards(
    grounding: dict[str, Any] | None,
    cards: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload = dict(grounding or {})
    merged = normalize_response_cards(payload.get("response_cards"))
    merged.extend(normalize_response_cards(cards or []))
    payload["response_cards"] = merged
    return payload


def question_choices_card(
    *,
    question: str,
    choices: list[dict[str, Any]],
    title: str = "More details needed",
    missing_fields: list[str] | None = None,
    draft: dict[str, Any] | None = None,
    active_field: str | None = None,
    custom_placeholder: str | None = None,
    custom_reply_template: str | None = None,
) -> dict[str, Any]:
    return make_response_card(
        "question_choices",
        title=title,
        question=question,
        choices=choices,
        missing_fields=missing_fields or [],
        active_field=active_field,
        draft=draft or None,
        allow_custom=True,
        custom_placeholder=custom_placeholder,
        custom_reply_template=custom_reply_template,
    )


def task_clarification_card(
    *,
    question: str,
    missing_fields: list[str],
    draft: dict[str, Any] | None = None,
    active_field: str | None = None,
    choices: list[dict[str, Any]] | None = None,
    custom_placeholder: str | None = None,
    custom_reply_template: str | None = None,
) -> dict[str, Any]:
    return question_choices_card(
        title="Answer one detail",
        question=question,
        choices=choices or [],
        missing_fields=missing_fields,
        active_field=active_field,
        draft=draft,
        custom_placeholder=custom_placeholder,
        custom_reply_template=custom_reply_template,
    )


def vague_target_choices_card(*, question: str) -> dict[str, Any]:
    return question_choices_card(
        title="Choose action target",
        question=question,
        choices=[
            {
                "id": "patient",
                "label": "Patient",
                "description": "Provide the patient name or ID.",
            },
            {
                "id": "room",
                "label": "Room",
                "description": "Provide the room name or ID.",
            },
            {
                "id": "task_or_alert",
                "label": "Task or alert",
                "description": "Provide the task, alert, or item ID.",
            },
        ],
    )


def _task_draft_from_arguments(arguments: dict[str, Any]) -> dict[str, Any]:
    keys = {
        "title",
        "description",
        "priority",
        "patient_id",
        "assigned_role",
        "assigned_user_id",
        "assign_to_self",
        "due_at",
        "checklist",
        "report_template",
    }
    return {key: _jsonable(arguments.get(key)) for key in keys if key in arguments}


def task_draft_card_from_step(step: ExecutionPlanStep) -> dict[str, Any] | None:
    if step.tool_name != "create_task_management_task":
        return None
    draft = _task_draft_from_arguments(dict(step.arguments or {}))
    return make_response_card(
        "task_draft",
        title=str(draft.get("title") or step.title or "Task draft"),
        task=draft,
        risk_level=step.risk_level,
        permission_basis=step.permission_basis,
        affected_entities=step.affected_entities,
    )


def cards_for_plan(plan: ExecutionPlan | None) -> list[dict[str, Any]]:
    if plan is None:
        return []
    steps = [
        {
            "id": step.id,
            "title": step.title,
            "tool_name": step.tool_name,
            "arguments": step.arguments,
            "risk_level": step.risk_level,
            "requires_confirmation": step.requires_confirmation,
        }
        for step in plan.steps
    ]
    cards = [
        make_response_card(
            "plan_summary",
            title=plan.summary,
            summary=plan.summary,
            playbook=plan.playbook,
            risk_level=plan.risk_level,
            model_target=plan.model_target,
            reasoning_target=plan.reasoning_target,
            permission_basis=plan.permission_basis,
            affected_entities=plan.affected_entities,
            steps=steps,
        )
    ]
    for step in plan.steps:
        card = task_draft_card_from_step(step)
        if card is not None:
            cards.append(card)
    return cards


def _table_card(
    *,
    title: str,
    rows: list[dict[str, Any]],
    source: str,
    max_rows: int = 20,
) -> dict[str, Any] | None:
    if not rows:
        return None
    columns: list[str] = []
    for row in rows[:max_rows]:
        for key in row.keys():
            if key not in columns:
                columns.append(str(key))
    return make_response_card(
        "data_table",
        title=title,
        source=source,
        columns=columns[:12],
        rows=rows[:max_rows],
        total_count=len(rows),
    )


def _patient_summary_payload(payload: dict[str, Any]) -> dict[str, Any]:
    room = payload.get("room")
    room_name = payload.get("room_name")
    if not room_name and isinstance(room, dict):
        room_name = room.get("name")
    return {
        **payload,
        "patient_id": payload.get("patient_id") or payload.get("id"),
        "patient_name": payload.get("patient_name")
        or " ".join(
            str(part)
            for part in (payload.get("first_name"), payload.get("last_name"))
            if part
        ).strip()
        or payload.get("display_name"),
        "room_name": room_name,
        "status": payload.get("status") or ("active" if payload.get("is_active") is True else None),
    }


def _patient_summary_from_payload(tool_name: str, payload: Any) -> dict[str, Any] | None:
    if tool_name == "get_patient_details" and isinstance(payload, dict):
        return make_response_card(
            "patient_summary",
            title="Patient summary",
            patient=_patient_summary_payload(payload),
        )
    return None


def _profile_summary_from_payload(tool_name: str, payload: Any) -> dict[str, Any] | None:
    if tool_name != "get_current_user_context" or not isinstance(payload, dict):
        return None
    user = payload.get("user") if isinstance(payload.get("user"), dict) else {}
    workspace = payload.get("workspace") if isinstance(payload.get("workspace"), dict) else {}
    linked_patient = (
        _patient_summary_payload(payload["linked_patient"])
        if isinstance(payload.get("linked_patient"), dict)
        else None
    )
    linked_staff = payload.get("linked_staff") if isinstance(payload.get("linked_staff"), dict) else None
    profile: dict[str, Any] = {
        "id": user.get("id"),
        "display_name": (
            (linked_patient or {}).get("display_name")
            or (linked_staff or {}).get("display_name")
            or user.get("username")
            or f"User #{payload.get('user_id')}"
        ),
        "username": user.get("username"),
        "role": user.get("role") or payload.get("role"),
        "status": user.get("status"),
        "workspace_name": workspace.get("name"),
        "workspace_id": workspace.get("id") or payload.get("workspace_id"),
        "patient_id": (linked_patient or {}).get("id"),
        "caregiver_id": (linked_staff or {}).get("id"),
        "room_id": (linked_patient or {}).get("room_id"),
        "room_name": (linked_patient or {}).get("room_name"),
        "department": (linked_staff or {}).get("department"),
        "phone": (linked_staff or {}).get("phone"),
        "email": (linked_staff or {}).get("email"),
        "summary": f"Signed in as {user.get('username') or payload.get('user_id')} in {workspace.get('name') or 'current workspace'}.",
    }
    return make_response_card(
        "profile_summary",
        title="Your profile",
        profile=profile,
        user=user,
        workspace=workspace,
        linked_patient=linked_patient,
        linked_staff=linked_staff,
    )


def cards_for_tool_result(tool_name: str | None, result: Any) -> list[dict[str, Any]]:
    if not tool_name:
        return []
    payload = _jsonable(result)
    cards: list[dict[str, Any]] = []

    patient_card = _patient_summary_from_payload(tool_name, payload)
    if patient_card is not None:
        cards.append(patient_card)
    profile_card = _profile_summary_from_payload(tool_name, payload)
    if profile_card is not None:
        cards.append(profile_card)

    if tool_name == "get_patient_timeline" and isinstance(payload, dict):
        cards.append(
            make_response_card(
                "timeline",
                title="Patient timeline",
                patient_id=payload.get("patient_id"),
                events=list(payload.get("events") or [])[:20],
                total_count=len(list(payload.get("events") or [])),
            )
        )
    elif tool_name == "get_patient_vitals" and isinstance(payload, dict):
        vitals = [row for row in payload.get("vitals", []) if isinstance(row, dict)]
        observations = [
            row for row in payload.get("observations", []) if isinstance(row, dict)
        ]
        vitals_card = _table_card(
            title="Recent vitals",
            rows=vitals,
            source=tool_name,
        )
        observations_card = _table_card(
            title="Recent observations",
            rows=observations,
            source=tool_name,
        )
        cards.extend(card for card in (vitals_card, observations_card) if card is not None)
    elif isinstance(payload, dict) and {"overall_score", "risk_level", "latest_vitals"} <= set(payload.keys()):
        cards.append(
            make_response_card(
                "patient_health_analysis",
                title="Patient health analysis",
                analysis=payload,
            )
        )
    elif tool_name == "create_task_management_task" and isinstance(payload, dict):
        cards.append(
            make_response_card(
                "task_success",
                title="Task created",
                task=payload,
            )
        )
    elif isinstance(payload, list) and all(isinstance(row, dict) for row in payload):
        table = _table_card(
            title=tool_name.replace("_", " ").title(),
            rows=list(payload),
            source=tool_name,
        )
        if table is not None:
            cards.append(table)

    if not cards:
        cards.append(
            make_response_card(
                "tool_result",
                title=tool_name.replace("_", " ").title(),
                tool_name=tool_name,
                result=payload,
            )
        )
    return cards


def cards_for_tool_results(tool_results: list[tuple[str, Any]]) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for tool_name, result in tool_results:
        cards.extend(cards_for_tool_result(tool_name, result))
    return cards


def cards_for_execution_result(execution_result: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(execution_result, dict):
        return []
    cards: list[dict[str, Any]] = []
    for step in execution_result.get("steps") or []:
        if not isinstance(step, dict):
            continue
        cards.extend(cards_for_tool_result(str(step.get("tool_name") or ""), step.get("result")))
    return cards


def chat_message_metadata(
    *,
    grounding: dict[str, Any] | None = None,
    proposal_id: int | None = None,
    mode: str | None = None,
    plan_status: str | None = None,
    execution_result: dict[str, Any] | None = None,
    response_cards: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    public_grounding = attach_response_cards(grounding, response_cards)
    metadata: dict[str, Any] = {
        "grounding": public_grounding,
        "response_cards": normalize_response_cards(public_grounding.get("response_cards")),
    }
    if proposal_id is not None:
        metadata["proposal_id"] = proposal_id
    if mode is not None:
        metadata["mode"] = mode
    if plan_status is not None:
        metadata["plan_status"] = plan_status
    if execution_result is not None:
        metadata["execution_result"] = _jsonable(execution_result)
    return metadata
