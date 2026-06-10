"""Agent Runtime service for intent classification and plan execution."""

from __future__ import annotations

import json
import logging
import re
import asyncio
from typing import Any

from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from sqlalchemy import select

from app.api.dependencies import assert_patient_record_access_db, resolve_current_user_from_token
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.core import Room, SmartDevice, Workspace
from app.mcp.server import execute_workspace_tool
from app.schemas.agent_runtime import (
    AgentRuntimeExecuteResponse,
    AgentRuntimeProposeResponse,
    ExecutionPlan,
    ExecutionPlanStep,
)
from app.schemas.chat import ChatMessagePart
from app.schemas.chat_actions import ChatActionProposeIn
from app.services import ai_chat
from app.services.patient import patient_service
from app.agent_runtime import llm_tool_router
from app.agent_runtime.llm_tool_router import propose_llm_tool_turn
from app.agent_runtime.orchestrator import orchestrate_turn
from app.agent_runtime.response_cards import (
    attach_response_cards,
    cards_for_plan,
    cards_for_tool_result,
    cards_for_tool_results,
    make_response_card,
    task_clarification_card,
    vague_target_choices_card,
)
from app.agent_runtime.entity_resolution import (
    patient_display_name,
    resolve_patient_mentions,
    response_locale_for_text,
)
from app.agent_runtime.intent import (
    ConversationContext,
    IntentClassifier,
    get_classifier,
    pick_patient_id_for_followup,
    LOW_CONFIDENCE_THRESHOLD,
)
from app.agent_runtime.layers.contracts import ActorFacts, SafeFailure, new_correlation
from app.agent_runtime.layers.layer3_behavioral_state import schedule_behavioral_state_refresh
from app.agent_runtime.layers.layer4_constrained_synthesis import (
    MCP_TOOL_READ_ONLY_NAMES,
    is_mcp_tool_read_only,
)
from app.agent_runtime.layers.layer5_safety_execution import execute_confirmed_plan
from app.agent_runtime.layers.observability import PipelineEventEmitter, get_default_emitter
from app.agent_runtime.language_bridge import normalize_message_for_intent
from app.agent_runtime.conversation_fastpath import is_general_conversation_only
from app.agent_runtime.task_request import normalize_task_create_title as normalize_task_title_from_request

logger = logging.getLogger("wheelsense.agent_runtime")

_AI_RESPONSE_TIMEOUT_SECONDS = 45

_ROOM_CONTROL_ALIAS_TARGETS: dict[str, str] = {
    "bedroom": "room 401",
    "living room": "room 402",
    "livingroom": "room 402",
    "bathroom": "bathroom",
    "dining": "dining room",
    "dining room": "dining room",
    "kitchen": "dining room",
    "kitchen dining": "dining room",
    "kitchen / dining": "dining room",
    "main hall": "main hall",
    "physiotherapy": "physiotherapy room",
    "physiotherapy room": "physiotherapy room",
    "nurse station": "nurses station",
    "nurses station": "nurses station",
    "nursing station": "nurses station",
    "garden": "garden lounge",
    "garden lounge": "garden lounge",
}


def _room_control_base_text(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace("&", " and ").replace("'", "")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _normalize_room_control_text(value: str) -> str:
    text = _room_control_base_text(value)
    text = _room_control_base_text(_ROOM_CONTROL_ALIAS_TARGETS.get(text, text))
    text = re.sub(r"\b(?:the|room|area|zone)\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = _room_control_base_text(_ROOM_CONTROL_ALIAS_TARGETS.get(text, text))
    text = re.sub(r"\b(?:the|room|area|zone)\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _room_alias_keys(room: Room) -> set[str]:
    name = _normalize_room_control_text(str(room.name or ""))
    aliases = {name}
    if name == "nurses station":
        aliases.update({"nurse station", "nursing station"})
    if name == "dining":
        aliases.update({"kitchen", "kitchen dining", "kitchen / dining"})
    if name == "401":
        aliases.add("bedroom")
    if name == "402":
        aliases.update({"living room", "livingroom"})
    return {_normalize_room_control_text(alias) for alias in aliases if alias}


def _parse_room_smart_device_command(message: str) -> dict[str, str] | None:
    text = (message or "").strip()
    if not text:
        return None
    lowered = text.lower()

    action = ""
    if (
        "ปิด" in text
        or re.search(r"\b(?:turn|switch)\s+off\b|\boff\b|\bdisable\b", lowered)
    ):
        action = "turn_off"
    elif (
        "เปิด" in text
        or re.search(r"\b(?:turn|switch)\s+on\b|\bon\b|\benable\b", lowered)
    ):
        action = "turn_on"
    if not action:
        return None

    device_kind = ""
    if "ไฟ" in text or re.search(r"\b(?:light|lamp)\b", lowered):
        device_kind = "light"
    elif "แอร์" in text or re.search(r"\b(?:ac|air\s*con|aircon|air\s*conditioner|climate)\b", lowered):
        device_kind = "climate"
    elif "พัดลม" in text or re.search(r"\bfan\b", lowered):
        device_kind = "fan"
    elif "ทีวี" in text or re.search(r"\b(?:tv|television)\b", lowered):
        device_kind = "tv"
    elif "สัญญาณ" in text or re.search(r"\balarm\b", lowered):
        device_kind = "alarm"
    elif re.search(r"\bswitch\b", lowered):
        device_kind = "switch"
    if not device_kind:
        return None

    room_query = ""
    for alias in sorted(_ROOM_CONTROL_ALIAS_TARGETS, key=len, reverse=True):
        if re.search(rf"\b{re.escape(alias)}\b", lowered):
            room_query = alias
            break

    room_match = re.search(r"ห้อง\s*([A-Za-z0-9][A-Za-z0-9\s/'-]{1,80})", text, flags=re.IGNORECASE)
    if room_match:
        room_query = room_match.group(1)
    if not room_query:
        room_match = re.search(
            r"\b(?:room|area|zone)\s+([A-Za-z0-9][A-Za-z0-9\s/'-]{1,80})",
            text,
            flags=re.IGNORECASE,
        )
        if room_match:
            room_query = room_match.group(1)
    if not room_query:
        return None

    cleaned_room_query = re.sub(
        r"\b(?:light|lamp|fan|ac|air\s*con|aircon|air\s*conditioner|climate|tv|television|alarm|switch|on|off|turn|switch|enable|disable)\b.*$",
        "",
        room_query,
        flags=re.IGNORECASE,
    ).strip(" /'-")
    if cleaned_room_query:
        room_query = cleaned_room_query
    elif room_query not in _ROOM_CONTROL_ALIAS_TARGETS:
        return None

    return {
        "action": action,
        "device_kind": device_kind,
        "room_query": room_query,
    }


def _smart_device_kind_score(device: SmartDevice, requested_kind: str) -> int:
    kind = (requested_kind or "").strip().lower()
    text = f"{device.name} {device.device_type} {device.ha_entity_id}".lower()
    device_type = str(device.device_type or "").lower()
    if not kind:
        return 1
    if kind == "tv":
        return 100 if "tv" in text or "television" in text else 0
    if kind == "alarm":
        return 100 if "alarm" in text else 0
    if kind == "light":
        if device_type == "light":
            return 100
        if "light" in text or "lamp" in text:
            return 90
        return 0
    if kind == "switch":
        if device_type == "switch":
            return 100
        if "switch" in text:
            return 90
        return 0
    if kind == "climate":
        if device_type == "climate":
            return 100
        if re.search(r"\b(?:ac|aircon|air conditioner|climate)\b", text):
            return 90
        return 0
    if kind == "fan":
        if device_type == "fan":
            return 100
        if "fan" in text:
            return 90
        return 0
    return 0


async def _resolve_room_smart_device_command(
    db,
    workspace_id: int,
    parsed: dict[str, str],
) -> tuple[Room, SmartDevice] | None:
    room_key = _normalize_room_control_text(parsed.get("room_query", ""))
    if not room_key:
        return None
    rooms = (
        await db.execute(select(Room).where(Room.workspace_id == workspace_id).order_by(Room.id.asc()))
    ).scalars().all()
    matched_rooms = [room for room in rooms if room_key in _room_alias_keys(room)]
    if not matched_rooms:
        matched_rooms = [
            room
            for room in rooms
            if any(room_key in alias or alias in room_key for alias in _room_alias_keys(room))
        ]
    if len(matched_rooms) != 1:
        return None

    room = matched_rooms[0]
    devices = (
        await db.execute(
            select(SmartDevice)
            .where(
                SmartDevice.workspace_id == workspace_id,
                SmartDevice.room_id == room.id,
                SmartDevice.is_active.is_(True),
            )
            .order_by(SmartDevice.id.asc())
        )
    ).scalars().all()
    if not devices:
        return None

    requested_kind = parsed.get("device_kind", "")
    scored = [
        (score, device)
        for device in devices
        if (score := _smart_device_kind_score(device, requested_kind)) > 0
    ]
    if not scored and requested_kind == "light":
        switch_fallbacks = [device for device in devices if str(device.device_type or "").lower() == "switch"]
        if len(switch_fallbacks) == 1:
            return room, switch_fallbacks[0]
    if not scored:
        return None
    scored.sort(key=lambda item: (-item[0], item[1].id or 0))
    return room, scored[0][1]


def _action_label(action: str, locale: str) -> str:
    if locale == "th":
        return "ปิด" if action == "turn_off" else "เปิด"
    return "turn off" if action == "turn_off" else "turn on"


def _is_task_management_create_request(message: str) -> bool:
    text = message or ""
    lowered = text.lower()
    unicode_has_create = any(token in text for token in ("สร้าง", "เพิ่ม", "ทำ"))
    unicode_has_task = any(token in text for token in ("งาน", "ทาสก์", "ตรวจ"))
    has_create = bool(re.search(r"\b(create|add|make|new)\b", lowered)) or any(
        token in text for token in ("สร้าง", "เพิ่ม", "ทำ")
    )
    has_task = bool(re.search(r"\b(tasks?|todo|work item|checkup|check)\b", lowered)) or any(
        token in text for token in ("งาน", "ทาสก์", "ตรวจ")
    )
    return (has_create or unicode_has_create) and (has_task or unicode_has_task)


def _looks_thai(text: str) -> bool:
    return bool(re.search(r"[\u0e00-\u0e7f]", text or ""))


def _normalize_task_create_title(text: str) -> str:
    return normalize_task_title_from_request(text)
    title = str(text or "").split(";")[0].strip()
    title = re.sub(r"^\s*(?:please\s+)?(?:create|add|make)\s+(?:a\s+|new\s+)?", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\b(?:task|todo|work item)\b\s*$", "", title, flags=re.IGNORECASE)
    title = re.sub(
        r"^\s*(?:task|todo|work item)\s*(?:for|to)?\s*",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(
        r"^\s*(?:สร้าง|เพิ่ม|ทำ)\s*(?:task|ทาสก์|งาน)?\s*(?:สำหรับ|ให้)?\s*",
        "",
        title,
        flags=re.IGNORECASE,
    )
    return re.sub(
        r"(?:ให้หน่อย|หน่อย|please)\s*$",
        "",
        title,
        flags=re.IGNORECASE,
    ).strip(" :：-")


def _task_field_slug(field: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", field.lower()).strip("_") or "field"


def _task_append_reply(base_request: str, field: str, value: str) -> str:
    base = (base_request or "").strip().rstrip(".")
    if not base:
        base = "create task"
    return f"{base}; {field}: {value}"


def _task_field_custom_template(base_request: str, field: str) -> str:
    return _task_append_reply(base_request, field, "{input}")


def _task_field_question(*, field: str, title: str, thai: bool) -> str:
    task_name = title or "this task"
    if field == "task title / work objective":
        return "ต้องการสร้าง task เรื่องอะไรครับ?" if thai else "What should this task be about?"
    if field == "target patient, room, bed, or ward":
        return (
            f"งาน `{task_name}` นี้สำหรับผู้ป่วย ห้อง เตียง หรือ ward ไหนครับ?"
            if thai
            else f"Who or which room is `{task_name}` for?"
        )
    if field == "assignee, either yourself or a specific role/user":
        return (
            f"จะมอบหมายงาน `{task_name}` ให้ใครครับ?"
            if thai
            else f"Who should handle `{task_name}`?"
        )
    if field == "deadline date/time":
        return (
            f"กำหนดเสร็จของ `{task_name}` คือวันและเวลาไหนครับ?"
            if thai
            else f"When should `{task_name}` be due?"
        )
    if field == "priority":
        return (
            f"ความสำคัญของ `{task_name}` อยู่ระดับไหนครับ?"
            if thai
            else f"What priority should `{task_name}` have?"
        )
    if field == "exact checklist / steps to perform":
        return (
            f"งาน `{task_name}` ต้องทำขั้นตอนอะไรบ้างครับ?"
            if thai
            else f"What steps should staff follow for `{task_name}`?"
        )
    if field == "what result/report staff must record":
        return (
            f"หลังทำ `{task_name}` เสร็จ เจ้าหน้าที่ต้องบันทึกผลอะไรครับ?"
            if thai
            else f"What result or report should staff record after `{task_name}`?"
        )
    return f"Please provide {field} for `{task_name}`."


def _task_choice(
    *,
    base_request: str,
    field: str,
    value: str,
    label: str,
    description: str = "",
    recommended: bool = False,
) -> dict[str, Any]:
    return {
        "id": f"{_task_field_slug(field)}_{_task_field_slug(label)}",
        "label": label,
        "description": description,
        "reply": _task_append_reply(base_request, field, value),
        "recommended": recommended,
    }


def _task_field_choices(
    *,
    field: str,
    title: str,
    base_request: str,
    context: ConversationContext | None,
    thai: bool,
) -> tuple[list[dict[str, Any]], str]:
    focused_patient_id = context.last_focused_patient_id if context is not None else None
    page_context = context.last_page_context if context is not None else {}
    page_patient_id = page_context.get("page_patient_id") if isinstance(page_context, dict) else None
    contextual_patient_id = focused_patient_id or page_patient_id
    title_lower = title.lower()

    if field == "task title / work objective":
        return [
            _task_choice(
                base_request=base_request,
                field=field,
                value="blood pressure check",
                label="Blood pressure check" if not thai else "ตรวจความดัน",
                description="Common clinical task.",
                recommended=True,
            ),
            _task_choice(
                base_request=base_request,
                field=field,
                value="medication follow-up",
                label="Medication follow-up" if not thai else "ติดตามยา",
                description="Use for medication-related follow-up.",
            ),
            _task_choice(
                base_request=base_request,
                field=field,
                value="room safety check",
                label="Room safety check" if not thai else "ตรวจความปลอดภัยห้อง",
                description="Use for environmental or ward operations.",
            ),
        ], "Type the task objective..."

    if field == "target patient, room, bed, or ward":
        choices: list[dict[str, Any]] = []
        if contextual_patient_id is not None:
            choices.append(
                _task_choice(
                    base_request=base_request,
                    field=field,
                    value=f"current patient #{contextual_patient_id}",
                    label="Use current patient" if not thai else "ใช้ผู้ป่วยในหน้าปัจจุบัน",
                    description="Best when the chat is opened from a patient detail page.",
                    recommended=True,
                )
            )
        choices.extend(
            [
                _task_choice(
                    base_request=base_request,
                    field=field,
                    value="general ward task, not linked to a patient yet",
                    label="General ward task" if not thai else "งาน ward ทั่วไป",
                    description="Use when this is not tied to one patient.",
                    recommended=contextual_patient_id is None,
                ),
                _task_choice(
                    base_request=base_request,
                    field=field,
                    value="room to be specified by staff",
                    label="Choose by room" if not thai else "เลือกจากห้อง",
                    description="Use this if you want to type a room number below.",
                ),
            ]
        )
        return choices[:3], "Type patient name, room, bed, or ward..."

    if field == "assignee, either yourself or a specific role/user":
        return [
            _task_choice(
                base_request=base_request,
                field=field,
                value="duty nurse",
                label="Duty nurse" if not thai else "พยาบาลเวร",
                description="Recommended default for routine clinical checks.",
                recommended=True,
            ),
            _task_choice(
                base_request=base_request,
                field=field,
                value="me",
                label="Assign to me" if not thai else "มอบหมายให้ฉัน",
                description="Use when you will handle it yourself.",
            ),
            _task_choice(
                base_request=base_request,
                field=field,
                value="head nurse",
                label="Head nurse" if not thai else "หัวหน้าพยาบาล",
                description="Use for escalation or shift-level oversight.",
            ),
        ], "Type staff name, role, or username..."

    if field == "deadline date/time":
        return [
            _task_choice(
                base_request=base_request,
                field=field,
                value="today at 16:00",
                label="Today 16:00" if not thai else "วันนี้ 16:00",
                description="Good for same-day routine checks.",
                recommended=True,
            ),
            _task_choice(
                base_request=base_request,
                field=field,
                value="tomorrow at 09:00",
                label="Tomorrow 09:00" if not thai else "พรุ่งนี้ 09:00",
                description="Use when it can wait until the next day shift.",
            ),
            _task_choice(
                base_request=base_request,
                field=field,
                value="as soon as possible",
                label="ASAP" if not thai else "เร็วที่สุด",
                description="Use for urgent clinical follow-up.",
            ),
        ], "Type due date and time..."

    if field == "priority":
        priority_description = (
            "Recommended for routine clinical tasks."
            if "blood" in title_lower
            else "Recommended for routine care tasks."
        )
        return [
            _task_choice(
                base_request=base_request,
                field=field,
                value="normal",
                label="Normal" if not thai else "ปกติ",
                description=priority_description,
                recommended=True,
            ),
            _task_choice(
                base_request=base_request,
                field=field,
                value="high",
                label="High" if not thai else "สูง",
                description="Use when symptoms or recent readings are concerning.",
            ),
            _task_choice(
                base_request=base_request,
                field=field,
                value="urgent",
                label="Urgent" if not thai else "ด่วน",
                description="Use only when staff should act immediately.",
            ),
        ], "Type priority..."

    if field == "exact checklist / steps to perform":
        if "blood test" in title_lower:
            recommended = (
                "verify patient or ward request, collect blood sample, label specimen, "
                "send to lab, record collection time and follow up result"
            )
            description = "Clinical default for a usable blood test task."
        elif "blood pressure" in title_lower or "bp" in title_lower:
            recommended = "measure blood pressure, record systolic/diastolic and pulse, repeat once if abnormal"
            description = "Clinical default for a usable BP task."
        else:
            recommended = "perform the check, record findings, escalate abnormal results"
            description = "Safe default for a routine care task."
        return [
            _task_choice(
                base_request=base_request,
                field=field,
                value=recommended,
                label="Standard check" if not thai else "ขั้นตอนมาตรฐาน",
                description=description,
                recommended=True,
            ),
            _task_choice(
                base_request=base_request,
                field=field,
                value="check patient status, notify nurse team, record note",
                label="Check and notify" if not thai else "ตรวจและแจ้งทีม",
                description="Use when follow-up communication matters.",
            ),
        ], "Type checklist steps..."

    if field == "what result/report staff must record":
        if "blood test" in title_lower:
            recommended = (
                "record specimen ID, collection time, lab result summary, abnormal result flag, "
                "and escalation note if needed"
            )
        elif "blood pressure" in title_lower or "bp" in title_lower:
            recommended = "record BP value, pulse, posture, measurement time, and symptoms; flag abnormal readings"
        else:
            recommended = "record completion note, findings, and any escalation needed"
        return [
            _task_choice(
                base_request=base_request,
                field=field,
                value=recommended,
                label="Structured result" if not thai else "บันทึกผลแบบครบถ้วน",
                description="Recommended so the task is auditable.",
                recommended=True,
            ),
            _task_choice(
                base_request=base_request,
                field=field,
                value="completion note only",
                label="Completion note" if not thai else "บันทึกว่าเสร็จแล้ว",
                description="Use for low-risk operational tasks.",
            ),
        ], "Type result/report requirement..."

    return [], f"Type {field}..."


def _missing_task_ready_fields(
    *,
    message: str,
    title: str,
    context: ConversationContext | None,
) -> list[str]:
    lowered = (message or "").lower()
    missing: list[str] = []
    generic_titles = {"", "task", "tasks", "todo", "งาน", "ทาสก์"}

    if title.lower() in generic_titles:
        missing.append("task title / work objective")

    resolved_patient_id = pick_patient_id_for_followup(message, context)
    has_target = bool(
        re.search(r"\b(room|patient|bed|ward)\s*#?\s*[A-Za-z0-9-]+\b", lowered)
        or re.search(r"\b#\d+\b", lowered)
        or (context is not None and context.last_focused_patient_id is not None)
        or resolved_patient_id is not None
        or any(token in message for token in ("ห้อง", "ผู้ป่วย", "เตียง", "วอร์ด"))
    )
    if not has_target:
        missing.append("target patient, room, bed, or ward")

    has_assignee = bool(
        re.search(
            r"\b(assign(?:ed)?\s+to|assigned\s+user|assignee|for\s+(?:me|myself|nurse|staff|caregiver|observer|supervisor|head nurse|admin)|to\s+(?:me|myself|nurse|staff|caregiver|observer|supervisor|head nurse|admin)|user\s*#?\d+)\b",
            lowered,
        )
        or any(token in message for token in ("มอบหมาย", "ให้ฉัน", "ให้ผม", "ให้พยาบาล", "ให้เจ้าหน้าที่", "ผู้รับผิดชอบ"))
    )
    if not has_assignee:
        missing.append("assignee, either yourself or a specific role/user")

    has_deadline = bool(
        re.search(
            r"\b(due|deadline|by|before|today|tomorrow|tonight|asap|urgent|stat|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2})\b",
            lowered,
        )
        or any(token in message for token in ("วันนี้", "พรุ่งนี้", "ด่วน", "ภายใน", "ก่อน", "กำหนด", "เดดไลน์", "เวลา"))
    )
    if not has_deadline:
        missing.append("deadline date/time")

    has_priority = bool(
        re.search(r"\b(priority|low|normal|medium|high|critical|urgent|stat|routine)\b", lowered)
        or any(token in message for token in ("ความสำคัญ", "ปกติ", "สูง", "วิกฤต", "ด่วน"))
    )
    if not has_priority:
        missing.append("priority")

    has_steps = bool(
        re.search(
            r"\b(steps?|checklist|subtasks?|draw|collect|label|send|deliver|record|notify|follow[- ]?up|verify|confirm)\b",
            lowered,
        )
        or any(token in message for token in ("ขั้นตอน", "เช็กลิสต์", "รายการย่อย", "เก็บ", "ส่ง", "บันทึก", "แจ้ง", "ติดตาม", "ยืนยัน"))
    )
    if not has_steps:
        missing.append("exact checklist / steps to perform")

    has_result_requirement = bool(
        re.search(r"\b(report|result|note|attachment|photo|lab result|record result|upload|document)\b", lowered)
        or any(token in message for token in ("รายงาน", "ผลตรวจ", "บันทึกผล", "แนบ", "เอกสาร", "รูป"))
    )
    if not has_result_requirement:
        missing.append("what result/report staff must record")

    return missing


def _task_ready_clarification_reply(*, title: str, active_field: str, thai: bool) -> str:
    return _task_field_question(field=active_field, title=title, thai=thai)


def _clarification_reply_for_ambiguous_request(
    message: str,
    context: ConversationContext | None,
) -> tuple[str, list[dict[str, Any]]] | None:
    text = (message or "").strip()
    if not text:
        return None
    lowered = text.lower()
    thai = _looks_thai(text)

    if _is_task_management_create_request(text):
        normalized = _normalize_task_create_title(text)
        missing = _missing_task_ready_fields(message=text, title=normalized, context=context)
        if missing:
            active_field = missing[0]
            reply = _task_ready_clarification_reply(
                title=normalized,
                active_field=active_field,
                thai=thai,
            )
            choices, placeholder = _task_field_choices(
                field=active_field,
                title=normalized,
                base_request=text,
                context=context,
                thai=thai,
            )
            draft = {
                "title": normalized if normalized.lower() not in {"task", "tasks", "todo"} else "",
                "raw_request": text,
                "next_field": active_field,
                "remaining_fields": missing,
            }
            return reply, [
                task_clarification_card(
                    question=reply,
                    missing_fields=missing,
                    draft=draft,
                    active_field=active_field,
                    choices=choices,
                    custom_placeholder=placeholder,
                    custom_reply_template=_task_field_custom_template(text, active_field),
                )
            ]

    destructive_cue = bool(
        re.search(r"\b(delete|remove|cancel|archive|close|resolve|acknowledge|move|transfer|assign|update|change)\b", lowered)
        or any(token in text for token in ("ลบ", "ยกเลิก", "ปิด", "รับทราบ", "แก้", "เปลี่ยน", "ย้าย", "มอบหมาย"))
    )
    vague_reference = bool(
        re.search(r"\b(that|this|it|them|him|her|there)\b", lowered)
        or any(token in text for token in ("นั้น", "นี้", "คนนั้น", "อันนั้น", "ตรงนั้น"))
    )
    has_digit = bool(re.search(r"\d", text))
    has_patient_context = context is not None and context.last_focused_patient_id is not None
    if destructive_cue and vague_reference and not has_digit and not has_patient_context:
        reply = (
            "คำสั่งนี้ยังไม่ชัดเจนพอครับ ต้องการให้ทำกับรายการ/ผู้ป่วย/ห้องหมายเลขใด? "
            "กรุณาระบุชื่อหรือ ID ก่อน ผมจะสร้างแผนให้ยืนยันอีกครั้ง."
            if thai
            else "I need a specific target before I can prepare that action. "
            "Please provide the patient, room, alert, task, or item name/ID; I will ask for confirmation before executing."
        )
        return reply, [vague_target_choices_card(question=reply)]

    return None


def _tool_result_payload(result: Any) -> Any:
    def unwrap_result(payload: Any) -> Any:
        if isinstance(payload, dict) and set(payload.keys()) == {"result"}:
            return payload["result"]
        return payload

    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        return unwrap_result(structured)
    content = getattr(result, "content", None)
    if content is None:
        return result
    chunks: list[str] = []
    for item in content:
        text = getattr(item, "text", None)
        if text:
            chunks.append(text)
    joined = "\n".join(chunks).strip()
    if not joined:
        return {}
    try:
        return unwrap_result(json.loads(joined))
    except Exception:
        return {"text": joined}


_PATIENT_SCOPED_READ_TOOLS = frozenset(
    {"get_patient_vitals", "get_patient_timeline", "get_patient_health_analysis"}
)

# Immediate MCP reads that attach entity hints in IntentMatch but must still auto-run in propose.
_IMMEDIATE_PATIENT_READS_WITH_ENTITIES = frozenset(
    {
        "get_patient_vitals",
        "get_patient_timeline",
        "get_patient_health_analysis",
        "get_patient_details",
        "list_patient_caregivers",
    }
)


def _ingest_patient_context_from_tool_result(
    conversation_id: int | None,
    tool_name: str,
    result: Any,
    tool_arguments: dict[str, Any] | None = None,
) -> None:
    """Update per-conversation patient roster/focus after MCP reads (Thai follow-ups)."""
    if conversation_id is None:
        return
    ctx = _get_or_create_context(conversation_id)
    payload = _tool_result_payload(result)

    if tool_name == "list_visible_patients" and isinstance(payload, list):
        cards: list[dict[str, Any]] = []
        entities: list[dict[str, Any]] = []
        for row in payload:
            if isinstance(row, dict) and row.get("id") is not None:
                cards.append(
                    {
                        "id": row["id"],
                        "first_name": row.get("first_name"),
                        "last_name": row.get("last_name"),
                        "nickname": row.get("nickname"),
                    }
                )
                entities.append({"type": "patient", "id": row["id"]})
        ctx.last_patient_cards = cards[:40]
        ctx.last_entities = entities[:40]
        ctx.last_focused_patient_id = int(cards[0]["id"]) if len(cards) == 1 else None
        return

    if tool_name == "get_patient_details" and isinstance(payload, dict) and payload.get("id") is not None:
        pid = int(payload["id"])
        card = {
            "id": pid,
            "first_name": payload.get("first_name"),
            "last_name": payload.get("last_name"),
            "nickname": payload.get("nickname"),
        }
        ctx.last_patient_cards = [card]
        ctx.last_entities = [{"type": "patient", "id": pid}]
        ctx.last_focused_patient_id = pid
        return

    if tool_name in _PATIENT_SCOPED_READ_TOOLS:
        pid = (tool_arguments or {}).get("patient_id")
        if pid is not None:
            try:
                ctx.last_focused_patient_id = int(pid)
            except (TypeError, ValueError):
                pass

    if tool_name == "list_patient_caregivers":
        pid = (tool_arguments or {}).get("patient_id")
        if pid is not None:
            try:
                ctx.last_focused_patient_id = int(pid)
            except (TypeError, ValueError):
                pass


def _ingest_patient_context_from_grounding(
    conversation_id: int | None,
    grounding: dict[str, Any] | None,
) -> None:
    if conversation_id is None or not isinstance(grounding, dict):
        return
    rows = grounding.get("tool_results")
    if not isinstance(rows, list):
        return
    for row in rows:
        if not isinstance(row, dict):
            continue
        tool_name = row.get("tool_name")
        if not isinstance(tool_name, str):
            continue
        result = row.get("result")
        arguments = row.get("arguments")
        _ingest_patient_context_from_tool_result(
            conversation_id,
            tool_name,
            result,
            arguments if isinstance(arguments, dict) else {},
        )


async def _call_mcp_tool_direct(actor_access_token: str, tool_name: str, arguments: dict[str, Any]) -> Any:
    async with AsyncSessionLocal() as db:
        user, _, _ = await resolve_current_user_from_token(db, actor_access_token)
        return await execute_workspace_tool(
            tool_name=tool_name,
            workspace_id=user.workspace_id,
            arguments=arguments,
            actor_context={
                "user_id": user.id,
                "workspace_id": user.workspace_id,
                "role": user.role,
                "patient_id": getattr(user, "patient_id", None),
                "caregiver_id": getattr(user, "caregiver_id", None),
                "scopes": list(getattr(user, "_token_scopes", set())),
            },
        )


async def _call_mcp_tool_via_streamable_http(
    actor_access_token: str, tool_name: str, arguments: dict[str, Any]
) -> Any:
    """Invoke MCP tools/call through the official Streamable HTTP client (matches external MCP clients)."""
    mode = settings.agent_runtime_mcp_tool_transport
    mcp_url = settings.resolved_mcp_streamable_http_url
    headers = {"Authorization": f"Bearer {actor_access_token}"}
    host_header = settings.mcp_streamable_http_host_header.strip()
    if host_header:
        headers["Host"] = host_header

    if mode == "asgi":
        from app.main import app as platform_app

        base = "http://wheelsense.test"
        url = f"{base}/mcp/mcp"
        transport = ASGITransport(app=platform_app)
        client_cm = AsyncClient(
            transport=transport, base_url=base, headers=headers, timeout=120.0
        )
    elif mode == "http":
        url = mcp_url
        client_cm = AsyncClient(headers=headers, timeout=120.0)
    else:
        raise ValueError(f"Unsupported agent_runtime_mcp_tool_transport: {mode}")

    async with client_cm as client:
        async with streamable_http_client(url, http_client=client) as (read_stream, write_stream, _get_id):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                raw = await session.call_tool(tool_name, arguments)
                if getattr(raw, "isError", False):
                    detail = _tool_result_payload(raw)
                    raise RuntimeError(detail if detail else "MCP tool returned isError")
                return _tool_result_payload(raw)


async def _call_mcp_tool(actor_access_token: str, tool_name: str, arguments: dict[str, Any]) -> Any:
    try:
        if settings.agent_runtime_mcp_tool_transport == "direct":
            return await _call_mcp_tool_direct(actor_access_token, tool_name, arguments)
        return await _call_mcp_tool_via_streamable_http(actor_access_token, tool_name, arguments)
    except Exception:
        logger.exception(
            "MCP tool execution failed (transport=%s tool=%s)",
            settings.agent_runtime_mcp_tool_transport,
            tool_name,
        )
        raise


def _sync_llm_tool_router_read_only_policy() -> None:
    """Keep the v2 llm_tools adapter on the strict read-only catalog."""
    if llm_tool_router.MCP_TOOL_READ_ONLY_ROUTING != MCP_TOOL_READ_ONLY_NAMES:
        llm_tool_router.MCP_TOOL_READ_ONLY_ROUTING = MCP_TOOL_READ_ONLY_NAMES


async def _call_mcp_tool_read_only_during_propose(
    actor_access_token: str,
    tool_name: str,
    arguments: dict[str, Any],
) -> Any:
    if not is_mcp_tool_read_only(tool_name):
        raise RuntimeError(f"MCP tool `{tool_name}` requires confirmation before execution")
    return await _call_mcp_tool(actor_access_token, tool_name, arguments)


# Conversation context store (in production, use Redis or DB)
_conversation_contexts: dict[int, ConversationContext] = {}


def _get_or_create_context(conversation_id: int | None) -> ConversationContext:
    """Get or create conversation context for multi-turn awareness."""
    if conversation_id is None:
        return ConversationContext()
    if conversation_id not in _conversation_contexts:
        _conversation_contexts[conversation_id] = ConversationContext()
    return _conversation_contexts[conversation_id]


def _sanitize_page_context(page_context: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(page_context, dict):
        return {}
    path = str(page_context.get("path") or page_context.get("pathname") or "").strip()
    search = str(page_context.get("search") or "").strip()
    title = str(page_context.get("title") or "").strip()
    role = str(page_context.get("role") or "").strip()
    out: dict[str, Any] = {}
    if path.startswith("/") and not path.startswith("//"):
        out["path"] = path[:256]
    if search.startswith("?"):
        out["search"] = search[:512]
    if title:
        out["title"] = title[:120]
    if role:
        out["role"] = role[:40]
    for key in ("page_patient_id", "patient_id", "caregiver_id", "room_id", "device_id"):
        value = page_context.get(key)
        if isinstance(value, (int, str)) and str(value).strip():
            out[key] = value
    return out


def _seed_page_context(conversation_id: int | None, page_context: dict[str, Any] | None) -> None:
    if conversation_id is None:
        return
    sanitized = _sanitize_page_context(page_context)
    if not sanitized:
        return
    _get_or_create_context(conversation_id).last_page_context = sanitized


def _is_identity_request(message: str) -> bool:
    lowered = (message or "").lower().strip()
    return bool(
        re.search(r"\b(who\s+am\s+i|whoami|my\s+(?:profile|account|identity)|what\s+is\s+my\s+role)\b", lowered)
        or any(token in message for token in ("ฉันคือใคร", "ผมคือใคร", "เราเป็นใคร", "บัญชีของฉัน", "โปรไฟล์ของฉัน"))
    )


def _is_page_context_request(message: str) -> bool:
    lowered = (message or "").lower()
    thai_page_question = (
        any(token in message for token in ("หน้า", "หน้าจอ", "เพจ"))
        and any(token in message for token in ("อะไร", "ไหน", "ปัจจุบัน", "กำลังเปิด", "เปิดอยู่"))
        and any(token in message for token in ("ฉัน", "ผม", "เรา", "ตอนนี้", "เปิด"))
    )
    return bool(
        re.search(r"\b(this|current)\s+page\b|\bwhere\s+am\s+i\b|\bwhat\s+page\b|\bwhich\s+page\b", lowered)
        or any(token in message for token in ("หน้านี้", "หน้าอะไร", "หน้าจออะไร", "อยู่หน้าไหน", "หน้าปัจจุบัน"))
        or thai_page_question
    )


def _is_patient_detail_navigation_request(message: str) -> bool:
    if _is_page_context_request(message):
        return False
    lowered = (message or "").lower()
    has_open = bool(re.search(r"\b(open|go\s+to|navigate|show|view)\b", lowered)) or any(
        token in message for token in ("เปิด", "ไปที่", "แสดง", "ดู")
    )
    has_detail = bool(re.search(r"\b(detail|details|profile|page|record)\b", lowered)) or any(
        token in message for token in ("รายละเอียด", "โปรไฟล์", "หน้า", "ประวัติ")
    )
    return has_open and has_detail


def _role_patient_detail_path(role: str, patient_id: int) -> str:
    normalized = (role or "admin").replace("_", "-")
    if role == "patient":
        return "/patient?tab=profile"
    if role == "admin":
        return f"/admin/patients/{patient_id}"
    if role in {"head_nurse", "supervisor", "observer"}:
        return f"/{normalized}/personnel/{patient_id}"
    return f"/{normalized}/patients/{patient_id}"


def _navigation_card(*, title: str, href: str, description: str = "", auto_open: bool = False) -> dict[str, Any]:
    return make_response_card(
        "navigation",
        title=title,
        href=href,
        description=description,
        auto_open=auto_open,
    )


def _is_patient_location_request(message: str) -> bool:
    lowered = (message or "").lower()
    return bool(
        re.search(r"\b(where\s+(?:is|are)|which\s+room|current\s+location|location)\b", lowered)
        or any(token in message for token in ("อยู่ที่ไหน", "อยู่ห้องไหน", "ห้องอะไร", "ตำแหน่ง"))
    )


def _is_patient_timeline_request(message: str) -> bool:
    lowered = (message or "").lower()
    return bool(
        re.search(r"\b(timeline|movement\s+history|activity\s+history|history)\b", lowered)
        or any(token in message for token in ("ไทม์ไลน์", "ประวัติ", "เหตุการณ์", "กิจกรรม"))
    )


def _is_patient_list_request(message: str) -> bool:
    lowered = (message or "").lower()
    has_patient = bool(re.search(r"\bpatients?\b", lowered)) or any(
        token in message for token in ("ผู้ป่วย", "คนไข้")
    )
    has_list = bool(re.search(r"\b(list|show|display|visible|all)\b", lowered)) or any(
        token in message for token in ("รายการ", "ทั้งหมด", "มองเห็น", "แสดง", "ดู")
    )
    return has_patient and has_list


def _is_device_status_request(message: str) -> bool:
    lowered = (message or "").lower()
    has_thai_device = "อุปกรณ์" in message
    has_thai_status = any(token in message for token in ("ออนไลน์", "ออฟไลน์", "สถานะ"))
    return bool(
        re.search(r"\b(device|devices?)\b.*\b(online|offline|status|available|working)\b", lowered)
        or re.search(r"\b(is|are)\b.*\b(online|offline)\b", lowered)
        or (has_thai_device and has_thai_status)
    )


def _is_device_inventory_request(message: str) -> bool:
    lowered = (message or "").lower()
    has_thai_device = "อุปกรณ์" in message
    has_thai_inventory = any(token in message for token in ("อะไรบ้าง", "ทั้งหมด", "รายการ", "มี"))
    return bool(
        re.search(r"\b(?:what|which|list|show|all)\b.*\bdevices?\b", lowered)
        or re.search(r"\bdevices?\b.*\b(?:list|inventory|available|registered)\b", lowered)
        or (has_thai_device and has_thai_inventory)
    )


def _is_system_status_request(message: str) -> bool:
    lowered = (message or "").lower()
    has_thai_system = "ระบบ" in message
    has_thai_status = any(token in message for token in ("สถานะ", "สุขภาพ", "พร้อม", "ทำงาน"))
    return bool(
        re.search(r"\b(system|server|platform)\b.*\b(status|health|healthy|working|ready)\b", lowered)
        or re.search(r"\b(status|health)\b.*\b(system|server|platform)\b", lowered)
        or (has_thai_system and has_thai_status)
    )


def _is_workspace_inventory_request(message: str) -> bool:
    lowered = (message or "").lower()
    return bool(
        re.search(r"\b(workspaces?|workspace\s+list|workspace\s+status)\b", lowered)
        or any(token in message for token in ("เวิร์กสเปซ", "workspace"))
    )


def _device_display_name(row: dict[str, Any]) -> str:
    return str(row.get("display_name") or row.get("device_id") or row.get("id") or "Device")


def _device_status_line(row: dict[str, Any]) -> str:
    status = str(row.get("status") or ("online" if row.get("online") else "offline"))
    latest = row.get("latest_reading_at") or row.get("last_seen")
    latest_type = row.get("latest_reading_type")
    suffix = f", latest {latest_type or 'reading'} at {latest}" if latest else ""
    return f"- {_device_display_name(row)} (`{row.get('device_id')}`): {status}{suffix}"


def _patient_location_line(row: dict[str, Any]) -> str:
    room = row.get("room")
    room_name = None
    if isinstance(room, dict):
        room_name = room.get("name")
    if not room_name:
        room_name = row.get("room_name") or row.get("room_id")
    if room_name:
        return f"- {patient_display_name(row)}: {room_name}"
    return f"- {patient_display_name(row)}: no room/location recorded"


def _patient_roster_line(row: dict[str, Any]) -> str:
    parts = [patient_display_name(row)]
    room = row.get("room")
    room_name = room.get("name") if isinstance(room, dict) else None
    room_name = room_name or row.get("room_name") or row.get("room_id")
    if room_name:
        parts.append(f"room {room_name}")
    care_level = row.get("care_level")
    if care_level:
        parts.append(f"care {care_level}")
    status = row.get("status")
    if status:
        parts.append(str(status))
    elif row.get("is_active") is False:
        parts.append("inactive")
    return "- " + " | ".join(str(part) for part in parts if str(part).strip())


def _patient_list_reply(locale: str, patients: list[dict[str, Any]]) -> str:
    if not patients:
        return (
            "ยังไม่พบผู้ป่วยที่คุณมองเห็นในระบบตอนนี้"
            if locale == "th"
            else "I do not see any visible patients for your account right now."
        )
    heading = (
        f"ผู้ป่วยที่คุณมองเห็นตอนนี้ ({len(patients)} ราย):"
        if locale == "th"
        else f"Visible patients ({len(patients)}):"
    )
    lines = [_patient_roster_line(row) for row in patients[:12]]
    if len(patients) > 12:
        lines.append(f"- ...and {len(patients) - 12} more")
    return heading + "\n" + "\n".join(lines)


def _timeline_sections(tool_results: list[tuple[str, Any]]) -> list[str]:
    details_by_id: dict[int, dict[str, Any]] = {}
    timelines: list[dict[str, Any]] = []
    for tool_name, result in tool_results:
        if tool_name == "get_patient_details" and isinstance(result, dict) and result.get("id") is not None:
            details_by_id[int(result["id"])] = result
        if tool_name == "get_patient_timeline" and isinstance(result, dict):
            timelines.append(result)

    sections: list[str] = []
    for timeline in timelines:
        raw_pid = timeline.get("patient_id")
        try:
            pid = int(raw_pid)
        except (TypeError, ValueError):
            pid = -1
        patient = details_by_id.get(pid)
        name = str(timeline.get("patient_name") or "")
        if not name and patient is not None:
            name = patient_display_name(patient)
        if not name:
            name = f"Patient #{raw_pid}"
        events = [event for event in timeline.get("events") or [] if isinstance(event, dict)]
        if not events:
            sections.append(f"{name}:\n- No timeline events recorded in the selected range.")
            continue
        lines = [f"{name}:"]
        for event in events[:8]:
            timestamp = str(event.get("timestamp") or "unknown time")
            event_type = str(event.get("event_type") or "event")
            room_name = event.get("room_name")
            description = event.get("description")
            source = event.get("source")
            detail_parts = [event_type]
            if room_name:
                detail_parts.append(str(room_name))
            if description:
                detail_parts.append(str(description))
            if source:
                detail_parts.append(f"source: {source}")
            lines.append(f"- {timestamp}: " + " | ".join(detail_parts))
        sections.append("\n".join(lines))
    return sections


def _patient_read_reply(
    *,
    locale: str,
    wants_location: bool,
    wants_timeline: bool,
    details: list[dict[str, Any]],
    tool_results: list[tuple[str, Any]],
) -> str:
    blocks: list[str] = []
    if wants_location and details:
        heading = "ตำแหน่งล่าสุดจากข้อมูลในระบบ:" if locale == "th" else "Current location from WheelSense:"
        blocks.append(heading + "\n" + "\n".join(_patient_location_line(row) for row in details))
    if wants_timeline:
        sections = _timeline_sections(tool_results)
        heading = "ไทม์ไลน์ล่าสุด:" if locale == "th" else "Timeline:"
        blocks.append(heading + "\n" + "\n\n".join(sections))
    return "\n\n".join(blocks).strip()


def _patient_not_resolved_reply(locale: str, patients: list[dict[str, Any]]) -> str:
    choices = ", ".join(patient_display_name(row) for row in patients[:8])
    if locale == "th":
        return (
            "ผมหาผู้ป่วยจากชื่อนี้ไม่เจออย่างมั่นใจครับ "
            f"ผู้ป่วยที่มองเห็นตอนนี้คือ: {choices}. "
            "กรุณาเลือกชื่อหรือพิมพ์ชื่อ/นามสกุล/ชื่อเล่นอีกครั้ง"
        )
    return (
        "I could not confidently match that patient name. "
        f"Visible patients are: {choices}. "
        "Please choose one name or provide a first name, last name, nickname, or patient ID."
    )


def _system_health_lines(result: Any) -> list[str]:
    if not isinstance(result, dict):
        return [f"- {result}"]
    keys = ["status", "database", "mqtt", "environment", "version"]
    lines = []
    for key in keys:
        if key in result and result[key] is not None:
            lines.append(f"- {key}: {result[key]}")
    if lines:
        return lines
    return [f"- {key}: {value}" for key, value in list(result.items())[:8]]


def _workspace_lines(result: Any) -> list[str]:
    rows = result if isinstance(result, list) else [result] if isinstance(result, dict) else []
    lines: list[str] = []
    for row in rows[:10]:
        if not isinstance(row, dict):
            continue
        name = row.get("name") or row.get("display_name") or f"Workspace #{row.get('id')}"
        workspace_id = row.get("id")
        active = row.get("is_active")
        id_part = f" (id: {workspace_id})" if workspace_id is not None else ""
        suffix = ""
        if active is not None:
            suffix = f" ({'active' if active else 'inactive'})"
        lines.append(f"- {name}{id_part}{suffix}")
    return lines or ["- No workspaces returned by MCP."]


def _system_workspace_reply(
    *,
    locale: str,
    system_result: Any | None,
    workspace_result: Any | None,
) -> str:
    blocks: list[str] = []
    if system_result is not None:
        heading = "สถานะระบบจาก WheelSense:" if locale == "th" else "WheelSense system status:"
        blocks.append(heading + "\n" + "\n".join(_system_health_lines(system_result)))
    if workspace_result is not None:
        heading = "Workspace ที่มองเห็นตอนนี้:" if locale == "th" else "Visible workspaces:"
        blocks.append(heading + "\n" + "\n".join(_workspace_lines(workspace_result)))
    return "\n\n".join(blocks).strip()


def _identity_reply(locale: str, context_payload: dict[str, Any]) -> str:
    user = context_payload.get("user") if isinstance(context_payload.get("user"), dict) else {}
    workspace = context_payload.get("workspace") if isinstance(context_payload.get("workspace"), dict) else {}
    patient = context_payload.get("linked_patient") if isinstance(context_payload.get("linked_patient"), dict) else {}
    staff = context_payload.get("linked_staff") if isinstance(context_payload.get("linked_staff"), dict) else {}
    role = str(user.get("role") or context_payload.get("role") or "user")
    username = str(user.get("username") or context_payload.get("user_id") or "unknown")
    display_name = (
        str(patient.get("display_name") or "")
        or str(staff.get("display_name") or "")
        or username
    )
    workspace_name = str(workspace.get("name") or context_payload.get("workspace_id") or "current workspace")
    details: list[str] = []
    if patient:
        room = patient.get("room_name") or patient.get("room_id")
        if room:
            details.append(f"Room: {room}")
        if patient.get("care_level"):
            details.append(f"Care level: {patient.get('care_level')}")
    if staff:
        if staff.get("employee_code"):
            details.append(f"Staff ID: {staff.get('employee_code')}")
        if staff.get("department"):
            details.append(f"Department: {staff.get('department')}")
    detail_text = ("\n" + "\n".join(f"- {item}" for item in details)) if details else ""
    if locale == "th":
        return (
            f"คุณคือ {display_name} ใช้บัญชี `{username}` ในบทบาท `{role}` "
            f"ภายใต้ workspace {workspace_name}.{detail_text}"
        )
    return (
        f"You are {display_name}, signed in as `{username}` with role `{role}` "
        f"in workspace {workspace_name}.{detail_text}"
    )


def _page_context_reply(locale: str, page_context: dict[str, Any]) -> str:
    path = str(page_context.get("path") or "unknown page")
    title = str(page_context.get("title") or "").strip()
    role = str(page_context.get("role") or "").strip()
    label = f"{title} ({path})" if title else path
    if locale == "th":
        return f"ตอนนี้คุณอยู่ที่หน้า {label}" + (f" สำหรับบทบาท {role}" if role else "")
    return f"You are currently on {label}" + (f" for role {role}" if role else "")


async def _try_deterministic_room_control_plan(
    *,
    actor_access_token: str,
    message: str,
    conversation_id: int | None,
) -> AgentRuntimeProposeResponse | None:
    parsed = _parse_room_smart_device_command(message)
    if parsed is None:
        return None

    async with AsyncSessionLocal() as db:
        user, workspace = await _load_runtime_actor_context(db, actor_access_token)
        resolved = await _resolve_room_smart_device_command(db, workspace.id, parsed)
        if resolved is None:
            return None
        room, device = resolved

    locale = response_locale_for_text(message)
    action = parsed["action"]
    action_label = _action_label(action, locale)
    summary = (
        f"{action_label} {device.name} ใน {room.name}"
        if locale == "th"
        else f"{action_label.title()} {device.name} in {room.name}"
    )
    step = ExecutionPlanStep(
        id=f"step-1-control-room-smart-device-{device.id}",
        title=summary,
        tool_name="control_room_smart_device",
        arguments={"device_id": int(device.id), "action": action},
        risk_level="medium",
        permission_basis=["room_controls.use"],
        affected_entities=[
            {"type": "room", "id": int(room.id), "name": room.name},
            {"type": "smart_device", "id": int(device.id), "name": device.name},
        ],
        requires_confirmation=True,
    )
    plan = ExecutionPlan(
        playbook="device-control",
        summary=summary,
        reasoning_target="low",
        model_target="deterministic:room_smart_device_control",
        risk_level="medium",
        steps=[step],
        permission_basis=["room_controls.use"],
        affected_entities=step.affected_entities,
    )
    steps_payload = [
        {
            "intent": step.title,
            "tool_name": step.tool_name,
            "arguments": step.arguments,
            "permission_basis": step.permission_basis,
            "affected_entities": step.affected_entities,
            "risk_level": step.risk_level,
        }
    ]
    action_payload = ChatActionProposeIn(
        conversation_id=conversation_id,
        title=summary,
        action_type="mcp_plan",
        tool_name=None,
        tool_arguments={},
        summary=summary,
        proposed_changes={
            "mode": "plan",
            "execution_plan": plan.model_dump(mode="json"),
            "steps": steps_payload,
            "affected_entities": plan.affected_entities,
            "permission_basis": plan.permission_basis,
            "reasoning_target": plan.reasoning_target,
            "model_target": plan.model_target,
            "intent_confidence": 0.96,
        },
    )
    reply = (
        f"พบ {device.name} ใน {room.name} แล้ว กรุณายืนยันเพื่อ{action_label}อุปกรณ์นี้"
        if locale == "th"
        else f"I found {device.name} in {room.name}. Please confirm to {action_label} it."
    )
    _get_or_create_context(conversation_id).add_message("user", message)
    return AgentRuntimeProposeResponse(
        mode="plan",
        assistant_reply=reply,
        plan=plan,
        action_payload=action_payload.model_dump(mode="json"),
        grounding=attach_response_cards(
            {
                "confidence": 0.96,
                "classification_method": "deterministic_room_smart_device_control",
                "resolved_room": {"id": int(room.id), "name": room.name},
                "resolved_device": {
                    "id": int(device.id),
                    "name": device.name,
                    "device_type": device.device_type,
                    "ha_entity_id": device.ha_entity_id,
                },
            },
            cards_for_plan(plan),
        ),
    )


async def _try_deterministic_read_answer(
    *,
    actor_access_token: str,
    message: str,
    conversation_id: int | None,
    page_context: dict[str, Any] | None = None,
) -> AgentRuntimeProposeResponse | None:
    """Resolve common live-data asks before LLM tool routing.

    This covers name-heavy questions where an LLM may choose only
    list_visible_patients and then summarize incorrectly.
    """
    wants_timeline = _is_patient_timeline_request(message)
    wants_location = _is_patient_location_request(message)
    wants_patient_list = _is_patient_list_request(message)
    wants_device_status = _is_device_status_request(message)
    wants_device_inventory = _is_device_inventory_request(message)
    wants_system_status = _is_system_status_request(message)
    wants_workspace_inventory = _is_workspace_inventory_request(message)
    wants_identity = _is_identity_request(message)
    wants_page_context = _is_page_context_request(message)
    wants_patient_navigation = _is_patient_detail_navigation_request(message)
    if wants_patient_list and (wants_timeline or wants_location or wants_patient_navigation):
        wants_patient_list = False
    if not (
        wants_timeline
        or wants_location
        or wants_patient_list
        or wants_device_status
        or wants_device_inventory
        or wants_system_status
        or wants_workspace_inventory
        or wants_identity
        or wants_page_context
        or wants_patient_navigation
    ):
        return None

    tool_results: list[tuple[str, Any]] = []
    grounding_method = "easeai_deterministic_read_resolution"
    locale = response_locale_for_text(message)
    effective_page_context = _sanitize_page_context(page_context) or _get_or_create_context(conversation_id).last_page_context

    if wants_identity:
        current_user = await _call_mcp_tool(actor_access_token, "get_current_user_context", {})
        tool_results.append(("get_current_user_context", current_user))
        if isinstance(current_user, dict):
            reply = _identity_reply(locale, current_user)
            return AgentRuntimeProposeResponse(
                mode="answer",
                assistant_reply=reply,
                grounding=attach_response_cards(
                    {
                        "tool_names": ["get_current_user_context"],
                        "tool_results": [{"tool_name": "get_current_user_context", "result": current_user}],
                        "page_context": effective_page_context,
                        "confidence": 0.98,
                        "classification_method": grounding_method,
                    },
                    cards_for_tool_results(tool_results),
                ),
            )

    if wants_page_context and effective_page_context:
        reply = _page_context_reply(locale, effective_page_context)
        return AgentRuntimeProposeResponse(
            mode="answer",
            assistant_reply=reply,
            grounding=attach_response_cards(
                {
                    "page_context": effective_page_context,
                    "confidence": 0.95,
                    "classification_method": grounding_method,
                },
                [
                    _navigation_card(
                        title="Current page",
                        href=str(effective_page_context.get("path") or "/"),
                        description=reply,
                    )
                ],
            ),
        )

    if wants_patient_list:
        roster = await _call_mcp_tool(actor_access_token, "list_visible_patients", {})
        _ingest_patient_context_from_tool_result(conversation_id, "list_visible_patients", roster, {})
        patients = [row for row in roster if isinstance(row, dict)] if isinstance(roster, list) else []
        return AgentRuntimeProposeResponse(
            mode="answer",
            assistant_reply=_patient_list_reply(locale, patients),
            grounding=attach_response_cards(
                {
                    "tool_names": ["list_visible_patients"],
                    "tool_results": [
                        {"tool_name": "list_visible_patients", "result": roster}
                    ],
                    "confidence": 0.97,
                    "classification_method": grounding_method,
                },
                cards_for_tool_results([("list_visible_patients", roster)]),
            ),
        )

    if wants_timeline or wants_location or wants_patient_navigation:
        roster = await _call_mcp_tool(actor_access_token, "list_visible_patients", {})
        _ingest_patient_context_from_tool_result(conversation_id, "list_visible_patients", roster, {})
        tool_results.append(("list_visible_patients", roster))
        patients = [row for row in roster if isinstance(row, dict)] if isinstance(roster, list) else []
        hits = resolve_patient_mentions(message, patients)
        if hits:
            details: list[dict[str, Any]] = []
            role = ""
            if wants_patient_navigation:
                if effective_page_context:
                    role = str(effective_page_context.get("role") or "")
                if not role:
                    try:
                        current_user = await _call_mcp_tool(actor_access_token, "get_current_user_context", {})
                        if isinstance(current_user, dict):
                            user_payload = current_user.get("user") if isinstance(current_user.get("user"), dict) else {}
                            role = str(user_payload.get("role") or current_user.get("role") or "")
                    except Exception:
                        role = ""
            for hit in hits:
                pid = hit.get("id")
                if pid is None:
                    continue
                detail_args = {"patient_id": int(pid)}
                detail = await _call_mcp_tool(actor_access_token, "get_patient_details", detail_args)
                _ingest_patient_context_from_tool_result(
                    conversation_id, "get_patient_details", detail, detail_args
                )
                tool_results.append(("get_patient_details", detail))
                if isinstance(detail, dict):
                    details.append(detail)
                if wants_timeline:
                    timeline_args = {"patient_id": int(pid)}
                    timeline = await _call_mcp_tool(
                        actor_access_token, "get_patient_timeline", timeline_args
                    )
                    _ingest_patient_context_from_tool_result(
                        conversation_id, "get_patient_timeline", timeline, timeline_args
                    )
                    tool_results.append(("get_patient_timeline", timeline))

            if wants_patient_navigation and len(details) == 1:
                patient = details[0]
                patient_id = int(patient.get("id") or hits[0].get("id"))
                href = _role_patient_detail_path(role, patient_id)
                name = patient_display_name(patient)
                reply = (
                    f"เปิดหน้ารายละเอียดของ {name} ให้แล้วครับ"
                    if locale == "th"
                    else f"Opening the detail page for {name}."
                )
                return AgentRuntimeProposeResponse(
                    mode="answer",
                    assistant_reply=reply,
                    grounding=attach_response_cards(
                        {
                            "tool_names": [name for name, _ in tool_results],
                            "tool_results": [
                                {"tool_name": name, "result": result}
                                for name, result in tool_results
                            ],
                            "page_context": effective_page_context,
                            "confidence": 0.97,
                            "classification_method": grounding_method,
                        },
                        [
                            *cards_for_tool_results(tool_results),
                            _navigation_card(
                                title=f"Open {name}",
                                href=href,
                                description=f"{name} detail page for role {role or 'current user'}",
                                auto_open=True,
                            ),
                        ],
                    ),
                )

            reply = _patient_read_reply(
                locale=locale,
                wants_location=wants_location,
                wants_timeline=wants_timeline,
                details=details,
                tool_results=tool_results,
            )
            if reply:
                return AgentRuntimeProposeResponse(
                    mode="answer",
                    assistant_reply=reply,
                    grounding=attach_response_cards(
                        {
                            "tool_names": [name for name, _ in tool_results],
                            "tool_results": [
                                {"tool_name": name, "result": result}
                                for name, result in tool_results
                            ],
                            "confidence": 0.97,
                            "classification_method": grounding_method,
                        },
                        cards_for_tool_results(tool_results),
                    ),
                )

        elif patients:
            reply = _patient_not_resolved_reply(locale, patients)
            return AgentRuntimeProposeResponse(
                mode="answer",
                assistant_reply=reply,
                grounding=attach_response_cards(
                    {
                        "tool_names": ["list_visible_patients"],
                        "tool_results": [
                            {"tool_name": "list_visible_patients", "result": roster}
                        ],
                        "confidence": 0.82,
                        "classification_method": grounding_method,
                        "reason_code": "patient_name_not_resolved",
                    },
                    cards_for_tool_results(tool_results),
                ),
            )

    if wants_device_status or wants_device_inventory:
        devices = await _call_mcp_tool(actor_access_token, "list_devices", {})
        tool_results.append(("list_devices", devices))
        device_rows = [row for row in devices if isinstance(row, dict)] if isinstance(devices, list) else []
        if device_rows:
            lines = [_device_status_line(row) for row in device_rows[:12]]
            if locale == "th":
                heading = "สถานะอุปกรณ์ล่าสุดจากระบบ:" if wants_device_status else "อุปกรณ์ในระบบตอนนี้:"
            else:
                heading = "Current device status from WheelSense:" if wants_device_status else "Current devices in WheelSense:"
            reply = heading + "\n" + "\n".join(lines)
            return AgentRuntimeProposeResponse(
                mode="answer",
                assistant_reply=reply,
                grounding=attach_response_cards(
                    {
                        "tool_names": ["list_devices"],
                        "tool_results": [{"tool_name": "list_devices", "result": devices}],
                        "confidence": 0.96,
                        "classification_method": grounding_method,
                    },
                    cards_for_tool_results(tool_results),
                ),
            )

    if wants_system_status or wants_workspace_inventory:
        system_result = None
        workspace_result = None
        if wants_system_status:
            system_result = await _call_mcp_tool(actor_access_token, "get_system_health", {})
            tool_results.append(("get_system_health", system_result))
        if wants_workspace_inventory:
            workspace_result = await _call_mcp_tool(actor_access_token, "list_workspaces", {})
            tool_results.append(("list_workspaces", workspace_result))
        reply = _system_workspace_reply(
            locale=locale,
            system_result=system_result,
            workspace_result=workspace_result,
        )
        if reply:
            return AgentRuntimeProposeResponse(
                mode="answer",
                assistant_reply=reply,
                grounding=attach_response_cards(
                    {
                        "tool_names": [name for name, _ in tool_results],
                        "tool_results": [
                            {"tool_name": name, "result": result}
                            for name, result in tool_results
                        ],
                        "confidence": 0.96,
                        "classification_method": grounding_method,
                    },
                    cards_for_tool_results(tool_results),
                ),
            )

    return None


def _build_ai_trace(events: list[Any]) -> list[dict[str, Any]]:
    labels = {
        1: "Intent Router",
        2: "Context Engine",
        3: "Behavioral State",
        4: "LLM Synthesis",
        5: "Safety Execution",
    }
    latest_by_layer: dict[int, Any] = {}
    for event in events:
        latest_by_layer[event.layer] = event
    return [
        {
            "layer": layer,
            "label": labels.get(layer, f"Layer {layer}"),
            "phase": event.phase,
            "outcome": event.outcome,
            "latency_ms": event.latency_ms,
        }
        for layer, event in sorted(latest_by_layer.items())
    ]


async def _seed_page_patient_context(
    conversation_id: int | None,
    page_patient_id: int | None,
    actor_access_token: str,
) -> None:
    """When EaseAI is opened from a patient record page, prime roster/focus for Thai follow-ups."""
    if conversation_id is None or page_patient_id is None:
        return
    try:
        async with AsyncSessionLocal() as db:
            user, _, _ = await resolve_current_user_from_token(db, actor_access_token)
            await assert_patient_record_access_db(db, user.workspace_id, user, page_patient_id)
            patient = await patient_service.get(db, ws_id=user.workspace_id, id=page_patient_id)
            if patient is None:
                return
            pid = int(patient.id)
            card: dict[str, Any] = {
                "id": pid,
                "first_name": patient.first_name,
                "last_name": patient.last_name,
                "nickname": patient.nickname,
            }
        ctx = _get_or_create_context(conversation_id)
        ctx.last_patient_cards = [card]
        ctx.last_entities = [{"type": "patient", "id": pid}]
        ctx.last_focused_patient_id = pid
    except HTTPException:
        logger.info(
            "page_patient_id=%s seed skipped for conversation_id=%s (access policy)",
            page_patient_id,
            conversation_id,
        )
    except Exception:
        logger.warning(
            "Could not seed page_patient_id=%s for conversation_id=%s",
            page_patient_id,
            conversation_id,
            exc_info=True,
        )


async def _seed_patient_self_context(
    conversation_id: int | None,
    actor_access_token: str,
) -> None:
    """Prime roster/focus for patient-role users from their linked patient_id (Thai follow-ups)."""
    if conversation_id is None:
        return
    try:
        async with AsyncSessionLocal() as db:
            user, _, _ = await resolve_current_user_from_token(db, actor_access_token)
            if getattr(user, "role", None) != "patient":
                return
            raw_pid = getattr(user, "patient_id", None)
            if raw_pid is None:
                return
            pid = int(raw_pid)
            await assert_patient_record_access_db(db, user.workspace_id, user, pid)
            patient = await patient_service.get(db, ws_id=user.workspace_id, id=pid)
            if patient is None:
                return
            pid_int = int(patient.id)
            card = {
                "id": pid_int,
                "first_name": patient.first_name,
                "last_name": patient.last_name,
                "nickname": patient.nickname,
            }
        ctx = _get_or_create_context(conversation_id)
        ctx.last_patient_cards = [card]
        ctx.last_entities = [{"type": "patient", "id": pid_int}]
        ctx.last_focused_patient_id = pid_int
    except HTTPException:
        logger.info(
            "patient self-context seed skipped for conversation_id=%s (access policy)",
            conversation_id,
        )
    except Exception:
        logger.warning(
            "Could not seed patient self-context for conversation_id=%s",
            conversation_id,
            exc_info=True,
        )


async def _seed_visible_patient_context_for_task_request(
    *,
    conversation_id: int | None,
    actor_access_token: str,
    message: str,
    context: ConversationContext,
) -> None:
    """Load the visible roster before task clarification so named targets count."""
    if not _is_task_management_create_request(message):
        return
    if context.last_patient_cards or context.last_focused_patient_id is not None:
        return
    try:
        roster = await _call_mcp_tool(actor_access_token, "list_visible_patients", {})
    except Exception:
        logger.info(
            "Task clarification roster seed skipped for conversation_id=%s",
            conversation_id,
            exc_info=True,
        )
        return
    if conversation_id is not None:
        _ingest_patient_context_from_tool_result(conversation_id, "list_visible_patients", roster, {})
        seeded = _get_or_create_context(conversation_id)
        context.last_patient_cards = list(seeded.last_patient_cards)
        context.last_entities = list(seeded.last_entities)
        context.last_focused_patient_id = seeded.last_focused_patient_id
        return
    payload = _tool_result_payload(roster)
    if not isinstance(payload, list):
        return
    cards: list[dict[str, Any]] = []
    entities: list[dict[str, Any]] = []
    for row in payload:
        if isinstance(row, dict) and row.get("id") is not None:
            cards.append(
                {
                    "id": row["id"],
                    "first_name": row.get("first_name"),
                    "last_name": row.get("last_name"),
                    "nickname": row.get("nickname"),
                }
            )
            entities.append({"type": "patient", "id": row["id"]})
    context.last_patient_cards = cards[:40]
    context.last_entities = entities[:40]
    context.last_focused_patient_id = int(cards[0]["id"]) if len(cards) == 1 else None


async def _plan_for_message(
    message: str,
    conversation_id: int | None = None,
    classifier: IntentClassifier | None = None,
    actor_access_token: str | None = None,
) -> tuple[str, ExecutionPlan | None, tuple[str, dict[str, Any]] | None, float]:
    """Plan execution for a user message using intent classification.

    Order: regex + multilingual semantic (inside ``classify``) on the original text;
    if no intents match, optionally LLM-normalize to English and classify once more.

    Returns tuple of (mode, plan, immediate_tool, confidence).
    """
    if classifier is None:
        classifier = get_classifier()

    # Get or create conversation context
    context = _get_or_create_context(conversation_id)

    # Detect compound intents first (regex then semantic embeddings)
    compound_intents = classifier.detect_compound_intents(message, context)

    if (
        not compound_intents
        and actor_access_token
        and (message or "").strip()
    ):
        normalized = await normalize_message_for_intent(
            actor_access_token=actor_access_token,
            raw_message=message,
        )
        if normalized:
            compound_intents = classifier.detect_compound_intents(normalized, context)
            if compound_intents:
                logger.debug(
                    "Intent matched after LLM normalize: original=%r normalized=%r",
                    message[:80],
                    normalized[:120],
                )

    # Log classification attempt
    logger.debug(
        "Intent classification for message: %r, detected %d intents",
        message[:100],
        len(compound_intents),
    )

    if len(compound_intents) > 1:
        # Compound intent: build multi-step plan
        plan = classifier.build_execution_plan(compound_intents, message)
        if plan:
            # Update context with detected entities
            context.add_message("user", message)
            context.last_entities = plan.affected_entities
            context.last_intent = "compound"
            context.last_playbook = plan.playbook

            # Calculate aggregate confidence
            avg_confidence = sum(i.confidence for i in compound_intents) / len(compound_intents)

            logger.info(
                "Compound intent detected: %d steps, playbook=%s, confidence=%.2f",
                len(plan.steps),
                plan.playbook,
                avg_confidence,
            )

            return "plan", plan, None, avg_confidence

    elif len(compound_intents) == 1:
        # Single intent
        intent = compound_intents[0]

        # Update context
        context.add_message("user", message)
        context.update_entities(intent.entities)
        context.last_intent = intent.intent
        context.last_playbook = intent.playbook

        # Only auto-run high-confidence read-only tools.
        # Mutations must always go through plan -> confirm -> execute,
        # even when they map to a single tool and have no extracted entities.
        # Patient-scoped reads (vitals/timeline) carry entity hints for context; still safe to auto-run.
        allow_entities_for_tool = intent.tool_name in _IMMEDIATE_PATIENT_READS_WITH_ENTITIES
        if (
            intent.confidence >= 0.9
            and intent.tool_name
            and not intent.requires_confirmation
            and (not intent.entities or allow_entities_for_tool)
        ):
            logger.info(
                "Immediate tool match: intent=%s, tool=%s, confidence=%.2f",
                intent.intent,
                intent.tool_name,
                intent.confidence,
            )
            return "answer", None, (intent.tool_name, intent.arguments), intent.confidence

        # Build execution plan for actionable intents
        plan = classifier.build_execution_plan(compound_intents, message)
        if plan:
            logger.info(
                "Single intent plan: intent=%s, playbook=%s, confidence=%.2f",
                intent.intent,
                intent.playbook,
                intent.confidence,
            )
            return "plan", plan, None, intent.confidence

    # Low confidence or no match: trigger AI fallback
    logger.info(
        "Low confidence or no intent match for message: %r. Triggering AI fallback.",
        message[:100],
    )

    # Still update context even for AI fallback
    context.add_message("user", message)

    return "answer", None, None, 0.0


async def _collect_ai_reply(
    *,
    actor_access_token: str,
    messages: list[ChatMessagePart],
) -> str:
    reply, _ = await _collect_ai_reply_with_attempts(
        actor_access_token=actor_access_token,
        messages=messages,
    )
    return reply


async def _collect_ai_reply_with_attempts(
    *,
    actor_access_token: str,
    messages: list[ChatMessagePart],
) -> tuple[str, list[dict[str, object]]]:
    async with AsyncSessionLocal() as db:
        user, workspace = await _load_runtime_actor_context(db, actor_access_token)
        provider_attempts: list[dict[str, object]] = []
        reply = await ai_chat.collect_chat_reply_best_effort(
            db=db,
            user=user,
            workspace=workspace,
            messages=messages,
            provider_attempts_out=provider_attempts,
        )
        return reply, provider_attempts


async def _try_v2_llm_tools_strategy(
    *,
    actor_access_token: str,
    message: str,
    messages: list[ChatMessagePart],
    conversation_id: int | None,
) -> AgentRuntimeProposeResponse | None:
    if settings.agent_routing_mode != "llm_tools":
        return None

    _sync_llm_tool_router_read_only_policy()
    try:
        routed = await propose_llm_tool_turn(
            actor_access_token=actor_access_token,
            message=message,
            messages=messages,
            conversation_id=conversation_id,
            call_mcp_tool=_call_mcp_tool_read_only_during_propose,
        )
    except Exception:
        logger.exception("V2 llm_tools strategy failed; falling back to intent pipeline")
        return None

    if routed is None:
        logger.info("V2 llm_tools strategy returned no route; falling back to intent pipeline")
        return None

    grounding = dict(routed.grounding or {})
    grounding.setdefault("classification_method", "llm_tool_router")
    grounding["pipeline_version"] = "v2"
    grounding["strategy"] = "llm_tools"
    if routed.plan is not None:
        grounding = attach_response_cards(grounding, cards_for_plan(routed.plan))
    else:
        grounding = attach_response_cards(grounding)
    routed.grounding = grounding
    return routed


async def _load_runtime_actor_context(db, actor_access_token: str) -> tuple[Any, Workspace]:
    user, _, _ = await resolve_current_user_from_token(db, actor_access_token)
    workspace = (
        await db.execute(select(Workspace).where(Workspace.id == user.workspace_id))
    ).scalar_one()
    return user, workspace


async def _collect_grounded_tool_answer_or_fallback(
    *,
    db,
    user,
    workspace,
    user_message: str,
    tool_name: str,
    tool_result: Any,
    provider_attempts_out: list[dict[str, object]] | None = None,
) -> str:
    try:
        return await asyncio.wait_for(
            ai_chat.collect_grounded_tool_answer(
                db=db,
                user=user,
                workspace=workspace,
                user_message=user_message,
                tool_name=tool_name,
                tool_result=tool_result,
                provider_attempts_out=provider_attempts_out,
            ),
            timeout=_AI_RESPONSE_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.warning("AI grounded answer fallback for %s: %s", tool_name, exc)
        if provider_attempts_out is not None:
            provider_attempts_out.append(
                {
                    "phase": "grounded_tool_answer",
                    "status": "fallback",
                    "fallback_reason": str(exc) or type(exc).__name__,
                }
            )
        return _format_grounded_answer(tool_name, tool_result)


async def _collect_plan_confirmation_reply_or_fallback(
    *,
    db,
    user,
    workspace,
    user_message: str,
    execution_plan: ExecutionPlan,
    provider_attempts_out: list[dict[str, object]] | None = None,
) -> str:
    try:
        return await asyncio.wait_for(
            ai_chat.collect_plan_confirmation_reply(
                db=db,
                user=user,
                workspace=workspace,
                user_message=user_message,
                execution_plan=execution_plan,
                provider_attempts_out=provider_attempts_out,
            ),
            timeout=_AI_RESPONSE_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.warning("AI plan confirmation fallback: %s", exc)
        if provider_attempts_out is not None:
            provider_attempts_out.append(
                {
                    "phase": "plan_confirmation",
                    "status": "fallback",
                    "fallback_reason": str(exc) or type(exc).__name__,
                }
            )
        steps = "\n".join(f"{index + 1}. {step.title} ({step.tool_name})" for index, step in enumerate(execution_plan.steps))
        return f"Here is the action plan. Please confirm before I execute it.\n\n{steps}"


async def propose_turn(
    *,
    actor_access_token: str,
    message: str,
    messages: list[ChatMessagePart],
    conversation_id: int | None,
    page_patient_id: int | None = None,
    page_context: dict[str, Any] | None = None,
) -> AgentRuntimeProposeResponse:
    _seed_page_context(conversation_id, page_context)
    await _seed_page_patient_context(conversation_id, page_patient_id, actor_access_token)
    await _seed_patient_self_context(conversation_id, actor_access_token)
    context = _get_or_create_context(conversation_id)
    await _seed_visible_patient_context_for_task_request(
        conversation_id=conversation_id,
        actor_access_token=actor_access_token,
        message=message,
        context=context,
    )
    clarification = _clarification_reply_for_ambiguous_request(message, context)
    if clarification is not None:
        clarification_reply, clarification_cards = clarification
        context.add_message("user", message)
        return AgentRuntimeProposeResponse(
            mode="answer",
            assistant_reply=clarification_reply,
            grounding=attach_response_cards(
                {
                    "confidence": 0.96,
                    "classification_method": "deterministic_clarification",
                    "reason_code": "clarification_required",
                },
                clarification_cards,
            ),
        )

    try:
        deterministic_room_control = await _try_deterministic_room_control_plan(
            actor_access_token=actor_access_token,
            message=message,
            conversation_id=conversation_id,
        )
        if deterministic_room_control is not None:
            return deterministic_room_control
    except Exception:
        logger.exception("Deterministic room smart-device control failed; falling back to normal runtime")

    try:
        deterministic_read = await _try_deterministic_read_answer(
            actor_access_token=actor_access_token,
            message=message,
            conversation_id=conversation_id,
            page_context=page_context,
        )
        if deterministic_read is not None:
            return deterministic_read
    except Exception:
        logger.exception("Deterministic read resolution failed; falling back to normal runtime")

    if settings.easeai_pipeline_v2:
        llm_tools_attempted = settings.agent_routing_mode == "llm_tools"
        classifier = get_classifier()
        if _is_task_management_create_request(message) and settings.agent_routing_mode != "llm_tools":
            mode, plan, _, confidence = await _plan_for_message(
                message,
                conversation_id=conversation_id,
                classifier=classifier,
                actor_access_token=actor_access_token,
            )
            if (
                mode == "plan"
                and plan is not None
                and any(step.tool_name == "create_task_management_task" for step in plan.steps)
            ):
                async with AsyncSessionLocal() as db:
                    user, workspace = await _load_runtime_actor_context(db, actor_access_token)
                    provider_attempts: list[dict[str, object]] = []
                    assistant_reply = await _collect_plan_confirmation_reply_or_fallback(
                        db=db,
                        user=user,
                        workspace=workspace,
                        user_message=message,
                        execution_plan=plan,
                        provider_attempts_out=provider_attempts,
                    )
                steps = [
                    {
                        "intent": step.title,
                        "tool_name": step.tool_name,
                        "arguments": step.arguments,
                        "permission_basis": step.permission_basis,
                        "affected_entities": step.affected_entities,
                        "risk_level": step.risk_level,
                    }
                    for step in plan.steps
                ]
                action_payload = ChatActionProposeIn(
                    conversation_id=conversation_id,
                    title=plan.summary,
                    action_type="mcp_plan",
                    tool_name=None,
                    tool_arguments={},
                    summary=plan.summary,
                    proposed_changes={
                        "mode": "plan",
                        "execution_plan": plan.model_dump(mode="json"),
                        "steps": steps,
                        "affected_entities": plan.affected_entities,
                        "permission_basis": plan.permission_basis,
                        "reasoning_target": plan.reasoning_target,
                        "model_target": plan.model_target,
                        "intent_confidence": confidence,
                    },
                )
                grounding: dict[str, Any] = {
                    "confidence": confidence,
                    "classification_method": "easeai_pipeline_v2_task_precheck",
                    "pipeline_version": "v2",
                    "strategy": "deterministic_task_precheck",
                    "fallback_from": "llm_tools" if llm_tools_attempted else None,
                }
                if provider_attempts:
                    grounding["provider_attempts"] = provider_attempts
                return AgentRuntimeProposeResponse(
                    mode="plan",
                    assistant_reply=assistant_reply,
                    plan=plan,
                    action_payload=action_payload.model_dump(mode="json"),
                    grounding=attach_response_cards(grounding, cards_for_plan(plan)),
                )

        deterministic_match, deterministic_immediate = classifier.classify(
            message,
            context,
            allow_semantic=False,
        )
        if deterministic_immediate is not None:
            tool_name, tool_arguments = deterministic_immediate
            if is_mcp_tool_read_only(tool_name):
                result = await _call_mcp_tool(actor_access_token, tool_name, tool_arguments)
                _ingest_patient_context_from_tool_result(conversation_id, tool_name, result, tool_arguments)
                async with AsyncSessionLocal() as db:
                    user, workspace = await _load_runtime_actor_context(db, actor_access_token)
                    provider_attempts: list[dict[str, object]] = []
                    assistant_reply = await _collect_grounded_tool_answer_or_fallback(
                        db=db,
                        user=user,
                        workspace=workspace,
                        user_message=message,
                        tool_name=tool_name,
                        tool_result=result,
                        provider_attempts_out=provider_attempts,
                    )
                grounding = {
                    "tool_name": tool_name,
                    "result": result,
                    "confidence": deterministic_match.confidence if deterministic_match else 0.95,
                    "classification_method": "easeai_pipeline_v2_deterministic_precheck",
                    "pipeline_version": "v2",
                    "strategy": "deterministic_precheck",
                    "fallback_from": "llm_tools" if llm_tools_attempted else None,
                }
                if provider_attempts:
                    grounding["provider_attempts"] = provider_attempts
                return AgentRuntimeProposeResponse(
                    mode="answer",
                    assistant_reply=assistant_reply,
                    grounding=attach_response_cards(
                        grounding,
                        cards_for_tool_result(tool_name, result),
                    ),
                )

        llm_routed = await _try_v2_llm_tools_strategy(
            actor_access_token=actor_access_token,
            message=message,
            messages=messages,
            conversation_id=conversation_id,
        )
        if llm_routed is not None:
            _ingest_patient_context_from_grounding(conversation_id, llm_routed.grounding)
            return llm_routed

        context = _get_or_create_context(conversation_id)
        emitter = PipelineEventEmitter(capacity=64)
        async with AsyncSessionLocal() as db:
            user, workspace = await _load_runtime_actor_context(db, actor_access_token)
            actor = ActorFacts(
                role=user.role,
                user_id=user.id,
                workspace_id=user.workspace_id,
                patient_id=getattr(user, "patient_id", None),
            )
            orchestrated = await orchestrate_turn(
                actor=actor,
                message=message,
                context=context,
                classifier=classifier,
                system_state={},
                emitter=emitter,
            )
            if isinstance(orchestrated, SafeFailure):
                return AgentRuntimeProposeResponse(
                    mode="answer",
                    assistant_reply=orchestrated.localized(actor.locale),
                    grounding={
                        "correlation_id": orchestrated.correlation_id,
                        "reason_code": orchestrated.reason_code,
                        "classification_method": (
                            "easeai_pipeline_v2_intent_fallback"
                            if llm_tools_attempted
                            else "easeai_pipeline_v2"
                        ),
                        "fallback_from": "llm_tools" if llm_tools_attempted else None,
                        "ai_trace": _build_ai_trace(emitter.events_for(orchestrated.correlation_id)),
                    },
                )
            schedule_behavioral_state_refresh(
                correlation_id=orchestrated.correlation_id,
                actor=actor,
                message=message,
                context=context,
                synthesis=orchestrated,
                emitter=emitter,
            )
            if orchestrated.mode == "tool" and orchestrated.immediate_tool_name is not None:
                result = await _call_mcp_tool(
                    actor_access_token,
                    orchestrated.immediate_tool_name,
                    orchestrated.immediate_tool_arguments,
                )
                _ingest_patient_context_from_tool_result(
                    conversation_id,
                    orchestrated.immediate_tool_name,
                    result,
                    orchestrated.immediate_tool_arguments,
                )
                provider_attempts: list[dict[str, object]] = []
                assistant_reply = await _collect_grounded_tool_answer_or_fallback(
                    db=db,
                    user=user,
                    workspace=workspace,
                    user_message=message,
                    tool_name=orchestrated.immediate_tool_name,
                    tool_result=result,
                    provider_attempts_out=provider_attempts,
                )
                grounding = {
                    "tool_name": orchestrated.immediate_tool_name,
                    "result": result,
                    "confidence": orchestrated.confidence,
                    "correlation_id": orchestrated.correlation_id,
                    "classification_method": (
                        "easeai_pipeline_v2_intent_fallback"
                        if llm_tools_attempted
                        else "easeai_pipeline_v2"
                    ),
                    "fallback_from": "llm_tools" if llm_tools_attempted else None,
                    "ai_trace": _build_ai_trace(emitter.events_for(orchestrated.correlation_id)),
                }
                if provider_attempts:
                    grounding["provider_attempts"] = provider_attempts
                return AgentRuntimeProposeResponse(
                    mode="answer",
                    assistant_reply=assistant_reply,
                    grounding=attach_response_cards(
                        grounding,
                        cards_for_tool_result(orchestrated.immediate_tool_name, result),
                    ),
                )
            if orchestrated.mode == "plan" and orchestrated.execution_plan is not None:
                plan = orchestrated.execution_plan
                provider_attempts: list[dict[str, object]] = []
                assistant_reply = await _collect_plan_confirmation_reply_or_fallback(
                    db=db,
                    user=user,
                    workspace=workspace,
                    user_message=message,
                    execution_plan=plan,
                    provider_attempts_out=provider_attempts,
                )
                steps = [
                    {
                        "intent": step.title,
                        "tool_name": step.tool_name,
                        "arguments": step.arguments,
                        "permission_basis": step.permission_basis,
                        "affected_entities": step.affected_entities,
                        "risk_level": step.risk_level,
                    }
                    for step in plan.steps
                ]
                action_payload = ChatActionProposeIn(
                    conversation_id=conversation_id,
                    title=plan.summary,
                    action_type="mcp_plan",
                    tool_name=None,
                    tool_arguments={},
                    summary=plan.summary,
                    proposed_changes={
                        "mode": "plan",
                        "execution_plan": plan.model_dump(mode="json"),
                        "steps": steps,
                        "affected_entities": plan.affected_entities,
                        "permission_basis": plan.permission_basis,
                        "reasoning_target": plan.reasoning_target,
                        "model_target": plan.model_target,
                        "intent_confidence": orchestrated.confidence,
                    },
                )
                grounding = {
                    "confidence": orchestrated.confidence,
                    "correlation_id": orchestrated.correlation_id,
                    "classification_method": (
                        "easeai_pipeline_v2_intent_fallback"
                        if llm_tools_attempted
                        else "easeai_pipeline_v2"
                    ),
                    "fallback_from": "llm_tools" if llm_tools_attempted else None,
                    "ai_trace": _build_ai_trace(emitter.events_for(orchestrated.correlation_id)),
                }
                if provider_attempts:
                    grounding["provider_attempts"] = provider_attempts
                return AgentRuntimeProposeResponse(
                    mode="plan",
                    assistant_reply=assistant_reply,
                    plan=plan,
                    action_payload=action_payload.model_dump(mode="json"),
                    grounding=attach_response_cards(grounding, cards_for_plan(plan)),
                )

        try:
            reply, provider_attempts = await _collect_ai_reply_with_attempts(
                actor_access_token=actor_access_token,
                messages=messages,
            )
        except Exception:
            logger.exception("AI fallback failed during propose_turn v2")
            reply = (
                "AI service is temporarily unavailable right now. "
                "Please try again shortly."
            )
            provider_attempts = []
        grounding = {
            "classification_method": (
                "easeai_pipeline_v2_ai_fallback_from_llm_tools"
                if llm_tools_attempted
                else "easeai_pipeline_v2_ai_fallback"
            ),
            "fallback_from": "llm_tools" if llm_tools_attempted else None,
        }
        if provider_attempts:
            grounding["provider_attempts"] = provider_attempts
        return AgentRuntimeProposeResponse(
            mode="answer",
            assistant_reply=reply,
            grounding=grounding,
        )

    # Obvious chitchat: answer immediately via chat model (skip intent, MCP, LLM normalize).
    if settings.intent_ai_conversation_fastpath_enabled and is_general_conversation_only(message):
        logger.info("Conversation fast path: using direct AI reply for message=%r", message[:80])
        reply = await _collect_ai_reply(actor_access_token=actor_access_token, messages=messages)
        return AgentRuntimeProposeResponse(
            mode="answer",
            assistant_reply=reply,
            grounding={
                "confidence": 1.0,
                "classification_method": "conversation_fastpath_ai",
            },
        )

    if settings.agent_routing_mode == "llm_tools":
        try:
            routed = await propose_llm_tool_turn(
                actor_access_token=actor_access_token,
                message=message,
                messages=messages,
                conversation_id=conversation_id,
                call_mcp_tool=_call_mcp_tool,
            )
            if routed is not None:
                _ingest_patient_context_from_grounding(conversation_id, routed.grounding)
                return routed
        except Exception:
            logger.exception("LLM tool router failed; falling back to intent classifier")

    # Get classifier and plan for message with context
    classifier = get_classifier()
    mode, plan, immediate_tool, confidence = await _plan_for_message(
        message,
        conversation_id=conversation_id,
        classifier=classifier,
        actor_access_token=actor_access_token,
    )

    # Log classification confidence for analytics
    logger.info(
        "Intent classification result: mode=%s, confidence=%.2f, conversation_id=%s",
        mode,
        confidence,
        conversation_id,
    )

    # Low confidence check: if confidence is very low, prefer AI answer
    if mode == "plan" and confidence < LOW_CONFIDENCE_THRESHOLD:
        logger.warning(
            "Plan confidence %.2f below threshold %.2f, switching to AI fallback",
            confidence,
            LOW_CONFIDENCE_THRESHOLD,
        )
        mode = "answer"
        plan = None

    if immediate_tool is not None:
        tool_name, arguments = immediate_tool
        try:
            try:
                async with AsyncSessionLocal() as db:
                    actor_user, _, _ = await resolve_current_user_from_token(db, actor_access_token)
                    if (
                        tool_name == "list_visible_patients"
                        and getattr(actor_user, "role", None) == "patient"
                        and getattr(actor_user, "patient_id", None) is not None
                    ):
                        tool_name = "get_patient_details"
                        arguments = {"patient_id": int(actor_user.patient_id)}
            except HTTPException:
                # Tests / callers may use synthetic tokens; keep original tool selection.
                pass
            result = await _call_mcp_tool(actor_access_token, tool_name, arguments)
            _ingest_patient_context_from_tool_result(
                conversation_id, tool_name, result, arguments
            )
            async with AsyncSessionLocal() as db:
                user, workspace = await _load_runtime_actor_context(db, actor_access_token)
                assistant_reply = await _collect_grounded_tool_answer_or_fallback(
                    db=db,
                    user=user,
                    workspace=workspace,
                    user_message=message,
                    tool_name=tool_name,
                    tool_result=result,
                )
        except Exception as exc:
            logger.exception("MCP tool %s failed during propose", tool_name)
            err = str(exc).strip() or type(exc).__name__
            return AgentRuntimeProposeResponse(
                mode="answer",
                assistant_reply=(
                    f"I could not complete the data lookup for `{tool_name}` right now ({err}). "
                    "Please try again shortly."
                ),
                grounding={
                    "tool_name": tool_name,
                    "error": err,
                    "confidence": confidence,
                    "classification_method": "intent_classifier",
                },
            )
        grounding = {
            "tool_name": tool_name,
            "result": result,
            "confidence": confidence,
            "classification_method": "intent_classifier",
        }
        return AgentRuntimeProposeResponse(
            mode="answer",
            assistant_reply=assistant_reply,
            grounding=attach_response_cards(
                grounding,
                cards_for_tool_result(tool_name, result),
            ),
        )

    if plan is not None:
        async with AsyncSessionLocal() as db:
            user, workspace = await _load_runtime_actor_context(db, actor_access_token)
            assistant_reply = await _collect_plan_confirmation_reply_or_fallback(
                db=db,
                user=user,
                workspace=workspace,
                user_message=message,
                execution_plan=plan,
            )
        steps = [
            {
                "intent": step.title,
                "tool_name": step.tool_name,
                "arguments": step.arguments,
                "permission_basis": step.permission_basis,
                "affected_entities": step.affected_entities,
                "risk_level": step.risk_level,
            }
            for step in plan.steps
        ]
        action_payload = ChatActionProposeIn(
            conversation_id=conversation_id,
            title=plan.summary,
            action_type="mcp_plan",
            tool_name=None,
            tool_arguments={},
            summary=plan.summary,
            proposed_changes={
                "mode": "plan",
                "execution_plan": plan.model_dump(mode="json"),
                "steps": steps,
                "affected_entities": plan.affected_entities,
                "permission_basis": plan.permission_basis,
                "reasoning_target": plan.reasoning_target,
                "model_target": plan.model_target,
                "intent_confidence": confidence,
            },
        )
        return AgentRuntimeProposeResponse(
            mode="plan",
            assistant_reply=assistant_reply,
            plan=plan,
            action_payload=action_payload.model_dump(mode="json"),
            grounding=attach_response_cards(
                {
                    "confidence": confidence,
                    "classification_method": "intent_classifier",
                },
                cards_for_plan(plan),
            ),
        )

    try:
        reply = await _collect_ai_reply(actor_access_token=actor_access_token, messages=messages)
    except Exception:
        logger.exception("AI fallback failed during propose_turn")
        reply = (
            "AI service is temporarily unavailable right now. "
            "Please try again shortly."
        )
    return AgentRuntimeProposeResponse(
        mode="answer",
        assistant_reply=reply,
        grounding={
            "confidence": confidence,
            "classification_method": "ai_fallback",
        },
    )


def _format_grounded_answer(tool_name: str, result: Any) -> str:
    if tool_name == "get_system_health":
        return "WheelSense backend is healthy."
    if tool_name in {"list_rooms", "list_devices", "list_visible_patients", "list_active_alerts"}:
        if isinstance(result, list):
            return json.dumps(result, ensure_ascii=False, indent=2)
    if tool_name in {"list_workflow_tasks", "list_workflow_schedules"} and isinstance(result, list):
        return json.dumps(result, ensure_ascii=False, indent=2)
    return json.dumps(result, ensure_ascii=False, indent=2) if isinstance(result, (list, dict)) else str(result)


async def execute_plan(
    *,
    actor_access_token: str,
    execution_plan: ExecutionPlan,
) -> AgentRuntimeExecuteResponse:
    if settings.easeai_pipeline_v2:
        async with AsyncSessionLocal() as db:
            user, _workspace = await _load_runtime_actor_context(db, actor_access_token)
        actor = ActorFacts(
            role=user.role,
            user_id=user.id,
            workspace_id=user.workspace_id,
            patient_id=getattr(user, "patient_id", None),
        )
        executed = await execute_confirmed_plan(
            correlation=new_correlation(),
            actor=actor,
            actor_access_token=actor_access_token,
            execution_plan=execution_plan,
            call_tool=_call_mcp_tool,
            emitter=get_default_emitter(),
        )
        if isinstance(executed, SafeFailure):
            raise HTTPException(status_code=403, detail=executed.localized(actor.locale))
        return executed

    step_results: list[dict[str, Any]] = []
    last_message = execution_plan.summary
    for step in execution_plan.steps:
        result = await _call_mcp_tool(actor_access_token, step.tool_name, step.arguments)
        step_results.append(
            {
                "step_id": step.id,
                "tool_name": step.tool_name,
                "arguments": step.arguments,
                "result": result,
            }
        )
        last_message = f"Executed {step.title}."
    return AgentRuntimeExecuteResponse(
        message=last_message,
        execution_result={
            "playbook": execution_plan.playbook,
            "steps": step_results,
            "risk_level": execution_plan.risk_level,
            "model_target": execution_plan.model_target,
            "reasoning_target": execution_plan.reasoning_target,
        },
    )
