"""Ground common task and person questions without relying on provider availability."""
from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from typing import Any

from app.agent_runtime.entity_resolution import patient_display_name, resolve_patient_mentions
from app.agent_runtime.intent import ConversationContext
from app.agent_runtime.response_cards import attach_response_cards, cards_for_tool_results
from app.schemas.agent_runtime import AgentRuntimeProposeResponse


def read_request_kind(message: str) -> str | None:
    if re.search(r"\b(create|add|make|assign|delete|update|change|cancel)\b|สร้าง|เพิ่ม|มอบหมาย|แก้ไข|ยกเลิก", message, re.I):
        return None
    if re.search(r"\b(due|deadline)\b|กำหนดส่ง|งาน.*เมื่อไหร่", message, re.I):
        return "task"
    if re.search(r"\btask\s*#?\s*\d+\b|\btasks?\b.*\b(details|information|info)\b", message, re.I):
        return "task"
    if re.search(r"\b(timeline|history|information|info|details|profile|who is|tell me about)\b|ไทม์ไลน์|ประวัติ|ข้อมูล|รายละเอียด", message, re.I):
        if not re.search(r"\b(system|platform|device|workspace|page)\b|ระบบ|อุปกรณ์|หน้าจอ", message, re.I):
            return "person"
    if re.search(r"\b(list|show|my|all)\b.*\btasks?\b|งานของฉัน|รายการงาน", message, re.I):
        return "task"
    return None


def _answer(reply: str, results: list[tuple[str, Any]], reason: str | None = None) -> AgentRuntimeProposeResponse:
    grounding = {
        "classification_method": "grounded_read_request",
        "tool_names": [name for name, _ in results],
        "tool_results": [{"tool_name": name, "result": result} for name, result in results],
    }
    if reason:
        grounding["reason_code"] = reason
    return AgentRuntimeProposeResponse(mode="answer", assistant_reply=reply, grounding=attach_response_cards(grounding, [] if reason else cards_for_tool_results(results)))


async def answer_read_request(
    message: str,
    context: ConversationContext,
    allowed: set[str],
    call_tool: Callable[[str, dict[str, Any]], Awaitable[Any]],
    *,
    actor_user_id: int | None = None,
    actor_role: str | None = None,
) -> AgentRuntimeProposeResponse | None:
    kind = read_request_kind(message)
    if kind is None:
        return None
    results: list[tuple[str, Any]] = []

    async def read(name: str, args: dict[str, Any]) -> Any:
        result = await call_tool(name, args)
        results.append((name, result))
        return result

    if kind == "task":
        if "list_task_management_tasks" not in allowed:
            return None
        rows = await read("list_task_management_tasks", {"limit": 200})
        rows = [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []
        normalized = lambda value: " ".join(re.findall(r"[\w]+", value.lower()))
        text = normalized(message)
        task_id = re.search(r"\btask\s*#?\s*(\d+)\b", message, re.I)
        listing = bool(re.search(r"\b(list|show|my|all)\b.*\btasks?\b|งานของฉัน|รายการงาน", message, re.I))
        matches = [row for row in rows if row.get("id") == int(task_id.group(1))] if task_id else [row for row in rows if row.get("title") and normalized(row["title"]) in text]
        if not matches and not task_id and listing:
            matches = rows
            target = re.search(r"\b(?:for|of|assigned to)\s+(.+)|(?:งานของ(?!ฉัน)|สำหรับ)\s*(.+)", message, re.I)
            mine = bool(re.search(r"\bmy\b|งานของฉัน", message, re.I))
            if target:
                staff_target = bool(re.search(r"\b(staff|caregiver|nurse|assigned to)\b|เจ้าหน้าที่|ผู้ดูแล|พยาบาล", message, re.I))
                roster_tool = "list_staff" if staff_target else "list_visible_patients"
                if roster_tool not in allowed:
                    return _answer("I could not resolve that task's owner with your current access. Please provide the task ID.", results, "person_not_found")
                roster = await read(roster_tool, {})
                roster = [row for row in roster if isinstance(row, dict)] if isinstance(roster, list) else []
                full = [row for row in roster if row.get("first_name") and row.get("last_name") and re.search(rf"(?<!\w){re.escape(patient_display_name(row))}(?!\w)", message, re.I)]
                hits = full or resolve_patient_mentions(message, roster)
                if len(hits) != 1:
                    return _answer("Please provide the full patient or staff name for this task list.", results, "person_ambiguous" if hits else "person_not_found")
                person = hits[0]
                if staff_target:
                    user_ids = {user["id"] for user in person.get("users", []) if user.get("is_active")} or {person.get("user_id")}
                    user_ids.discard(None)
                    matches = [row for row in matches if row.get("assigned_user_id") in user_ids or user_ids.intersection(row.get("assigned_user_ids") or [])]
                else:
                    matches = [row for row in matches if row.get("patient_id") == person["id"]]
            if mine:
                if actor_user_id is None:
                    return _answer("I could not resolve your task assignments. Please try again.", results, "read_failed")
                matches = [row for row in matches if row.get("assigned_user_id") == actor_user_id or actor_user_id in (row.get("assigned_user_ids") or []) or (actor_role and row.get("assigned_role") == actor_role)]
        if not matches:
            reply = "No visible tasks match those filters." if listing and not task_id else "I could not match that task in the visible task list. Please provide its exact title or task ID."
            return _answer(reply, results, "task_not_found")
        response = _answer("\n".join(f"- {row['title']} (task #{row['id']}): due {row.get('due_at') or 'not set'}; status {row.get('status') or 'unknown'}" for row in matches), results)
        response.grounding["response_cards"] = cards_for_tool_results([("list_task_management_tasks", matches)])
        return response

    explicit_staff = bool(re.search(r"\b(staff|caregiver|nurse|supervisor|observer)\b|เจ้าหน้าที่|พยาบาล|ผู้ดูแล", message, re.I))
    explicit_patient = bool(re.search(r"\bpatient\b|ผู้ป่วย|คนไข้", message, re.I))
    timeline = bool(re.search(r"\b(timeline|history)\b|ไทม์ไลน์|ประวัติ", message, re.I))
    candidates: list[tuple[str, dict[str, Any]]] = []
    for person_kind, roster_tool in (("patient", "list_visible_patients"), ("staff", "list_staff")):
        if (explicit_staff and person_kind != "staff") or (explicit_patient and person_kind != "patient"):
            continue
        detail_tool = f"get_{person_kind}_details"
        timeline_tool = f"get_{person_kind}_timeline"
        if not {roster_tool, detail_tool}.issubset(allowed) or (timeline and timeline_tool not in allowed):
            continue
        rows = await read(roster_tool, {})
        rows = [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []
        explicit_id = re.search(rf"\b(?:{person_kind}|{'caregiver' if person_kind == 'staff' else 'patient'})\s*#?\s*(\d+)\b", message, re.I)
        if explicit_id:
            hits = [row for row in rows if row.get("id") == int(explicit_id.group(1))]
        else:
            full_matches = [row for row in rows if row.get("first_name") and row.get("last_name") and re.search(rf"(?<!\w){re.escape(patient_display_name(row))}(?!\w)", message, re.I)]
            hits = full_matches or resolve_patient_mentions(message, rows)
        followup = bool(re.fullmatch(r"(?:show |give me |and |what about )?(?:(?:his|her|their|the|my) )?(?:timeline|history|information|info|details|profile)[?. ]*", message, re.I) or re.fullmatch(r"(?:ขอ|ดู|แล้ว)?\s*(?:ไทม์ไลน์|ประวัติ|ข้อมูล|รายละเอียด)(?:ของ)?(?:เขา|เธอ|คนนี้|คนนั้น)?\s*(?:หน่อย|ล่ะ|ครับ|ค่ะ)?[?. ]*", message))
        if not hits and followup:
            focused = [entity["id"] for entity in context.last_entities if entity.get("type") == person_kind]
            if person_kind == "patient" and not focused and context.last_focused_patient_id:
                focused = [context.last_focused_patient_id]
            hits = [row for row in rows if row.get("id") in focused]
        candidates.extend((person_kind, row) for row in hits)
    if len(candidates) != 1:
        if candidates:
            choices = ", ".join(f"{patient_display_name(row)} ({person_kind} #{row['id']})" for person_kind, row in candidates)
            return _answer(f"Which person do you mean? {choices}", results, "person_ambiguous")
        return _answer("I could not find that person in the records you can access. Please provide their full name or patient/staff ID.", results, "person_not_found")
    person_kind, person = candidates[0]
    args = {"patient_id" if person_kind == "patient" else "caregiver_id": int(person["id"])}
    detail = await read(f"get_{person_kind}_details", args)
    lines = [patient_display_name(person)]
    if isinstance(detail, dict):
        for key in ("role", "department", "specialty", "care_level", "gender", "date_of_birth", "medical_conditions", "allergies", "phone", "email", "notes"):
            value = detail.get(key)
            if value is not None and value != "" and value != []:
                if isinstance(value, list):
                    value = ", ".join(str(item.get("condition") or item.get("name") or item) if isinstance(item, dict) else str(item) for item in value)
                lines.append(f"- {key.replace('_', ' ')}: {value}")
        room = detail.get("room")
        if isinstance(room, dict) and room.get("name"):
            lines.append(f"- Room: {room['name']}")
    if timeline:
        payload = await read(f"get_{person_kind}_timeline", args)
        events = payload.get("events", []) if isinstance(payload, dict) else []
        lines.append("Timeline:")
        for event in events[:20]:
            if isinstance(event, dict):
                lines.append(f"- {event.get('timestamp') or 'Unknown time'}: {event.get('description') or event.get('event_type') or event.get('category') or 'Event'}")
        if not events:
            lines.append("- No timeline events recorded in the selected range.")
    context.last_entities = [{"type": person_kind, "id": int(person["id"])}]
    if person_kind == "patient":
        context.last_patient_cards = [person]
        context.last_focused_patient_id = int(person["id"])
    else:
        context.last_focused_patient_id = None
    return _answer("\n".join(lines), results)
