from __future__ import annotations

import re
from datetime import datetime, time, timedelta, timezone
from typing import Any, Callable


TASK_FIELD_TITLE = "task title / work objective"
TASK_FIELD_TARGET = "target patient, room, bed, or ward"
TASK_FIELD_ASSIGNEE = "assignee, either yourself or a specific role/user"
TASK_FIELD_DEADLINE = "deadline date/time"
TASK_FIELD_PRIORITY = "priority"
TASK_FIELD_STEPS = "exact checklist / steps to perform"
TASK_FIELD_REPORT = "what result/report staff must record"

TASK_FORM_FIELDS = (
    TASK_FIELD_TITLE,
    TASK_FIELD_TARGET,
    TASK_FIELD_ASSIGNEE,
    TASK_FIELD_DEADLINE,
    TASK_FIELD_PRIORITY,
    TASK_FIELD_STEPS,
    TASK_FIELD_REPORT,
)

_FIELD_LABELS = (
    TASK_FIELD_TITLE,
    TASK_FIELD_TARGET,
    TASK_FIELD_ASSIGNEE,
    TASK_FIELD_DEADLINE,
    TASK_FIELD_PRIORITY,
    TASK_FIELD_STEPS,
    TASK_FIELD_REPORT,
    "title",
    "task",
    "objective",
    "target",
    "patient",
    "room",
    "ward",
    "assignee",
    "assigned to",
    "deadline",
    "due",
    "due date",
    "priority",
    "checklist",
    "steps",
    "subtasks",
    "result",
    "report",
    "report requirement",
)

_FIELD_RE = re.compile(
    r"(?:^|;)\s*(?P<label>" + "|".join(re.escape(label) for label in _FIELD_LABELS) + r")\s*:\s*",
    flags=re.IGNORECASE,
)

_THAI_CREATE = "\u0e2a\u0e23\u0e49\u0e32\u0e07|\u0e40\u0e1e\u0e34\u0e48\u0e21|\u0e17\u0e33"
_THAI_TASK = "task|\u0e17\u0e32\u0e2a\u0e01\u0e4c|\u0e07\u0e32\u0e19"
_THAI_FOR = "\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a|\u0e43\u0e2b\u0e49"
_THAI_POLITE_SUFFIX = "\u0e43\u0e2b\u0e49\u0e2b\u0e19\u0e48\u0e2d\u0e22|\u0e2b\u0e19\u0e48\u0e2d\u0e22"


def canonical_task_field(label: str) -> str | None:
    normalized = re.sub(r"[^a-z0-9]+", " ", (label or "").lower()).strip()
    if not normalized:
        return None
    if "title" in normalized or "objective" in normalized or normalized == "task":
        return TASK_FIELD_TITLE
    if (
        "target patient" in normalized
        or normalized in {"target", "patient", "room", "ward"}
        or "bed" in normalized
    ):
        return TASK_FIELD_TARGET
    if "assignee" in normalized or "assigned to" in normalized:
        return TASK_FIELD_ASSIGNEE
    if "deadline" in normalized or normalized in {"due", "due date"}:
        return TASK_FIELD_DEADLINE
    if "priority" in normalized:
        return TASK_FIELD_PRIORITY
    if "checklist" in normalized or "steps" in normalized or "subtasks" in normalized:
        return TASK_FIELD_STEPS
    if "result" in normalized or "report" in normalized:
        return TASK_FIELD_REPORT
    return None


def parse_task_form_fields(message: str) -> tuple[str, dict[str, str]]:
    text = (message or "").strip()
    matches = list(_FIELD_RE.finditer(text))
    if not matches:
        return text, {}

    base_request = text[: matches[0].start()].strip(" ;")
    fields: dict[str, str] = {}
    for index, match in enumerate(matches):
        canonical = canonical_task_field(match.group("label"))
        if canonical is None:
            continue
        value_start = match.end()
        value_end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        value = text[value_start:value_end].strip(" ;\n\t")
        if value:
            fields[canonical] = value
    return base_request, fields


def normalize_task_create_title(text: str) -> str:
    base_request, fields = parse_task_form_fields(text)
    title = (fields.get(TASK_FIELD_TITLE) or base_request or text or "").strip()
    title = re.sub(
        r"^\s*(?:please\s+)?(?:create|add|make)\s+(?:a\s+|new\s+)?",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(
        r"^\s*(?:task|todo|work item)\s*(?:for|to)?\s*",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(
        r"\b(?:task|todo|work item)\b\s*$",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(
        rf"^\s*(?:{_THAI_CREATE})\s*(?:{_THAI_TASK})?\s*(?:{_THAI_FOR})?\s*",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(rf"(?:{_THAI_POLITE_SUFFIX})\s*$", "", title, flags=re.IGNORECASE)
    title = re.sub(r"(?:please)\s*$", "", title, flags=re.IGNORECASE)
    return title.strip(" :.-'\"")[:256]


def extract_task_due_at(text: str) -> str | None:
    explicit = re.search(
        r"\b(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2})(?::(\d{2}))?)?\b",
        text or "",
        flags=re.IGNORECASE,
    )
    if explicit:
        date_part = explicit.group(1)
        hour = int(explicit.group(2) or 17)
        minute = int(explicit.group(3) or 0)
        return datetime.fromisoformat(f"{date_part}T{hour:02d}:{minute:02d}:00+00:00").isoformat()

    relative = re.search(
        r"\b(today|tomorrow)\b(?:.*?\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?",
        text or "",
        flags=re.IGNORECASE,
    )
    if not relative:
        return None

    base_date = datetime.now(timezone.utc).date()
    if relative.group(1).lower() == "tomorrow":
        base_date += timedelta(days=1)
    hour = int(relative.group(2) or 17)
    minute = int(relative.group(3) or 0)
    suffix = (relative.group(4) or "").lower()
    if suffix == "pm" and hour < 12:
        hour += 12
    if suffix == "am" and hour == 12:
        hour = 0
    return datetime.combine(base_date, time(hour, minute, tzinfo=timezone.utc)).isoformat()


def extract_task_priority(text: str) -> str:
    lowered = (text or "").lower()
    if re.search(r"\b(critical|stat|emergency)\b", lowered):
        return "critical"
    if re.search(r"\b(high|urgent|asap)\b", lowered):
        return "high"
    if re.search(r"\blow\b", lowered):
        return "low"
    return "normal"


def extract_task_assignee(text: str) -> dict[str, Any]:
    lowered = (text or "").lower()
    args: dict[str, Any] = {}
    if re.search(r"\b(?:assign(?:ed)?\s+to|assignee|for|to)?\s*(?:me|myself|self)\b", lowered):
        args["assign_to_self"] = True
        args.pop("assigned_role", None)
        args.pop("assigned_user_id", None)
        return args

    user_match = re.search(r"\b(?:assigned\s+user|user|staff)\s*#?\s*(\d+)\b", lowered)
    if user_match:
        args["assigned_user_id"] = int(user_match.group(1))
        return args

    role_patterns = [
        ("head_caregiver", r"\b(head\s*nurse|headnurse|duty\s*nurse|nurse\s*team|nurses?|nursing\s*team|head\s*caregiver|caregiver\s*lead|desk\s*coordinator)\b"),
        ("caregiver", r"\b(observer|caregiver|care\s*team|staff|floor\s*staff)\b"),
        ("head_caregiver", r"\bsupervisor\b"),
        ("admin", r"\badmin\b"),
    ]
    for role, pattern in role_patterns:
        if re.search(pattern, lowered):
            args["assigned_role"] = role
            break
    return args


def extract_task_checklist(text: str) -> list[str]:
    raw = (text or "").strip(" .;\n")
    if not raw:
        return []
    raw = re.sub(
        r"^\s*(?:checklist(?:\s+steps?)?|steps?|subtasks?)\s*[:=-]\s*",
        "",
        raw,
        flags=re.IGNORECASE,
    )
    parts = re.split(r"\s*(?:,|;|\n|\band then\b|\bthen\b)\s*", raw, flags=re.IGNORECASE)
    checklist: list[str] = []
    for part in parts:
        item = re.sub(r"^\s*(?:\d+[\).]|[-*])\s*", "", part).strip(" .;-")
        if item and len(item) >= 2 and item.lower() not in {"and", "then"}:
            checklist.append(item[:256])
    return checklist


def _patient_id_from_target(value: str) -> int | None:
    match = re.search(r"\b(?:current\s+patient|patient)\s*#?\s*(\d+)\b", value or "", flags=re.IGNORECASE)
    return int(match.group(1)) if match else None


def _is_unlinked_target(value: str) -> bool:
    lowered = (value or "").lower()
    return any(
        phrase in lowered
        for phrase in (
            "general ward task",
            "not linked",
            "not tied",
            "no patient",
        )
    )


def _clean_target(value: str) -> str:
    cleaned = (value or "").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:256]


def _report_template_from_requirement(*, title: str, report_requirement: str) -> dict[str, Any] | None:
    title_lower = (title or "").lower()
    report_lower = (report_requirement or "").lower()
    if not report_requirement.strip():
        return None

    if "blood pressure" in title_lower or re.search(r"\bbp\b", title_lower):
        fields = [
            {"key": "systolic_mmhg", "label": "Systolic BP (mmHg)", "type": "number", "required": True},
            {"key": "diastolic_mmhg", "label": "Diastolic BP (mmHg)", "type": "number", "required": True},
            {"key": "pulse_bpm", "label": "Pulse (bpm)", "type": "number", "required": False},
            {"key": "posture", "label": "Posture", "type": "select", "required": False, "options": ["sitting", "standing", "lying"]},
            {"key": "symptoms", "label": "Symptoms", "type": "textarea", "required": False},
            {"key": "abnormal_reading", "label": "Abnormal reading", "type": "boolean", "required": True},
        ]
    elif "blood test" in title_lower or "lab" in report_lower:
        fields = [
            {"key": "sample_collected", "label": "Sample collected", "type": "boolean", "required": True},
            {"key": "lab_reference", "label": "Lab reference", "type": "text", "required": False},
            {"key": "result_summary", "label": "Result summary", "type": "textarea", "required": True},
            {"key": "abnormal_result", "label": "Abnormal result", "type": "boolean", "required": True},
            {"key": "escalation_note", "label": "Escalation note", "type": "textarea", "required": False},
        ]
    else:
        fields = [
            {"key": "completion_note", "label": "Completion note", "type": "textarea", "required": True},
            {"key": "findings", "label": "Findings", "type": "textarea", "required": "finding" in report_lower},
            {"key": "escalation_needed", "label": "Escalation needed", "type": "boolean", "required": False},
            {"key": "escalation_note", "label": "Escalation note", "type": "textarea", "required": False},
        ]
    return {"mode": "structured", "fields": fields, "body_html": "", "attachments": []}


def normalize_task_arguments(
    message: str,
    arguments: dict[str, Any] | None = None,
    *,
    patient_resolver: Callable[[str], int | None] | None = None,
) -> dict[str, Any]:
    args = dict(arguments or {})
    base_request, fields = parse_task_form_fields(message)
    clean_title = normalize_task_create_title(message)
    existing_title = str(args.get("title") or "").strip()

    if fields or not existing_title or ";" in existing_title or existing_title.lower().startswith(("create ", "add ", "make ")):
        if clean_title:
            args["title"] = clean_title

    target = fields.get(TASK_FIELD_TARGET)
    if target:
        patient_id = _patient_id_from_target(target)
        if patient_id is None and patient_resolver is not None and not _is_unlinked_target(target):
            patient_id = patient_resolver(target)
        if patient_id is not None:
            args["patient_id"] = patient_id
        elif _is_unlinked_target(target):
            args.pop("patient_id", None)
    elif args.get("patient_id") is None and patient_resolver is not None:
        patient_id = patient_resolver(message)
        if patient_id is not None:
            args["patient_id"] = patient_id

    assignee = fields.get(TASK_FIELD_ASSIGNEE)
    if assignee:
        args.update(extract_task_assignee(assignee))

    deadline = fields.get(TASK_FIELD_DEADLINE)
    due_at = extract_task_due_at(deadline or message)
    if due_at:
        args["due_at"] = due_at

    priority_source = fields.get(TASK_FIELD_PRIORITY) or str(args.get("priority") or "") or message
    args["priority"] = extract_task_priority(priority_source)

    steps = fields.get(TASK_FIELD_STEPS)
    checklist = extract_task_checklist(steps or "")
    if checklist:
        args["checklist"] = checklist

    report_requirement = fields.get(TASK_FIELD_REPORT, "").strip()
    report_template = _report_template_from_requirement(
        title=str(args.get("title") or clean_title),
        report_requirement=report_requirement,
    )
    if report_template is not None:
        args["report_template"] = report_template

    if fields:
        description_parts: list[str] = []
        if target:
            description_parts.append(f"Target: {_clean_target(target)}")
        if checklist:
            description_parts.append("Checklist:\n" + "\n".join(f"- {item}" for item in checklist))
        if report_requirement:
            description_parts.append(f"Report requirement: {report_requirement}")
        if not description_parts:
            description_parts.append(base_request)
        args["description"] = "\n\n".join(description_parts).strip()[:4096]
    elif "description" not in args:
        args["description"] = message[:4096]

    return args
