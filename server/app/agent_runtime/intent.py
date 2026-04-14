"""Intent classification for Agent Runtime with semantic matching and context awareness."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Literal

from app.config import settings
from app.schemas.agent_runtime import ExecutionPlan, ExecutionPlanStep

logger = logging.getLogger("wheelsense.agent_runtime.intent")

TOOL_INTENT_METADATA: dict[str, dict[str, Any]] = {
    "get_current_user_context": {"playbook": "system", "permission_basis": [], "risk_level": "low", "read_only": True},
    "get_system_health": {"playbook": "system", "permission_basis": [], "risk_level": "low", "read_only": True},
    "list_workspaces": {"playbook": "system", "permission_basis": ["workspace.read"], "risk_level": "low", "read_only": True},
    "list_visible_patients": {"playbook": "patient-management", "permission_basis": ["patients.read"], "risk_level": "low", "read_only": True},
    "get_patient_details": {"playbook": "patient-management", "permission_basis": ["patients.read"], "risk_level": "low", "read_only": True},
    "update_patient_room": {"playbook": "facility-ops", "permission_basis": ["patients.write"], "risk_level": "high", "read_only": False},
    "create_patient_record": {"playbook": "patient-management", "permission_basis": ["patients.write"], "risk_level": "high", "read_only": False},
    "list_devices": {"playbook": "device-control", "permission_basis": ["devices.read"], "risk_level": "low", "read_only": True},
    "list_active_alerts": {"playbook": "clinical-triage", "permission_basis": ["alerts.read"], "risk_level": "low", "read_only": True},
    "acknowledge_alert": {"playbook": "clinical-triage", "permission_basis": ["alerts.manage"], "risk_level": "medium", "read_only": False},
    "resolve_alert": {"playbook": "clinical-triage", "permission_basis": ["alerts.manage"], "risk_level": "medium", "read_only": False},
    "list_rooms": {"playbook": "facility-ops", "permission_basis": ["rooms.read"], "risk_level": "low", "read_only": True},
    "trigger_camera_photo": {"playbook": "device-control", "permission_basis": ["cameras.capture"], "risk_level": "medium", "read_only": False},
    "control_room_smart_device": {"playbook": "device-control", "permission_basis": ["room_controls.use"], "risk_level": "medium", "read_only": False},
    "list_workflow_tasks": {"playbook": "workflow", "permission_basis": ["workflow.read"], "risk_level": "low", "read_only": True},
    "list_workflow_schedules": {"playbook": "workflow", "permission_basis": ["workflow.read"], "risk_level": "low", "read_only": True},
    "list_facilities": {"playbook": "facility-ops", "permission_basis": ["rooms.read"], "risk_level": "low", "read_only": True},
    "get_ai_runtime_summary": {"playbook": "system", "permission_basis": ["ai_settings.read"], "risk_level": "low", "read_only": True},
    "get_patient_vitals": {"playbook": "clinical-triage", "permission_basis": ["patients.read"], "risk_level": "low", "read_only": True},
    "get_patient_timeline": {"playbook": "clinical-triage", "permission_basis": ["patients.read"], "risk_level": "low", "read_only": True},
    "create_workflow_task": {"playbook": "workflow", "permission_basis": ["workflow.write"], "risk_level": "medium", "read_only": False},
    "update_workflow_task_status": {"playbook": "workflow", "permission_basis": ["workflow.write"], "risk_level": "medium", "read_only": False},
    "send_message": {"playbook": "workflow", "permission_basis": ["workflow.write"], "risk_level": "medium", "read_only": False},
    "get_message_recipients": {"playbook": "workflow", "permission_basis": ["workflow.read"], "risk_level": "low", "read_only": True},
    "get_workspace_analytics": {"playbook": "system", "permission_basis": ["workspace.read"], "risk_level": "low", "read_only": True},
    "send_device_command": {"playbook": "device-control", "permission_basis": ["devices.command"], "risk_level": "high", "read_only": False},
    "get_facility_details": {"playbook": "facility-ops", "permission_basis": ["rooms.read"], "risk_level": "low", "read_only": True},
    "get_floorplan_layout": {"playbook": "facility-ops", "permission_basis": ["rooms.read"], "risk_level": "low", "read_only": True},
}

# Read-only intents where high-confidence semantic similarity may auto-run MCP (same as regex immediate tools).
SEMANTIC_READ_IMMEDIATE: dict[str, tuple[str, dict[str, Any]]] = {
    "patients.read": ("list_visible_patients", {}),
    "alerts.read": ("list_active_alerts", {}),
    "devices.read": ("list_devices", {}),
    "rooms.read": ("list_rooms", {}),
    "tasks.read": ("list_workflow_tasks", {}),
    "schedules.read": ("list_workflow_schedules", {}),
    "system.health": ("get_system_health", {}),
}


@dataclass
class IntentMatch:
    """Result of intent classification."""

    intent: str
    playbook: str
    confidence: float
    tool_name: str | None
    arguments: dict[str, Any]
    entities: list[dict[str, Any]] = field(default_factory=list)
    permission_basis: list[str] = field(default_factory=list)
    risk_level: Literal["low", "medium", "high"] = "low"
    reasoning_target: Literal["low", "medium", "high"] = "medium"
    model_target: str = "copilot:gpt-4.1"
    requires_confirmation: bool = True


@dataclass
class ConversationContext:
    """Tracks conversation state for multi-turn context awareness."""

    messages: list[dict[str, str]] = field(default_factory=list)
    last_entities: list[dict[str, Any]] = field(default_factory=list)
    # Recent patient rows from list_visible_patients / get_patient_details for name follow-ups.
    last_patient_cards: list[dict[str, Any]] = field(default_factory=list)
    # Last patient the user narrowed in on (single-row list or details / vitals / timeline).
    last_focused_patient_id: int | None = None
    last_intent: str | None = None
    last_playbook: str | None = None

    def add_message(self, role: Literal["user", "assistant"], content: str) -> None:
        """Add a message to conversation history."""
        self.messages.append({"role": role, "content": content})
        # Keep only last 10 messages for context window
        if len(self.messages) > 10:
            self.messages = self.messages[-10:]

    def update_entities(self, entities: list[dict[str, Any]]) -> None:
        """Update tracked entities from current turn."""
        self.last_entities = entities


@dataclass
class IntentExample:
    """Labeled example for semantic intent matching."""

    text: str
    intent: str
    playbook: str


# Intent example database for semantic matching
INTENT_EXAMPLES: list[IntentExample] = [
    # Patients
    IntentExample("show me all patients", "patients.read", "patient-management"),
    IntentExample("list patients in the ward", "patients.read", "patient-management"),
    IntentExample("who are the current patients", "patients.read", "patient-management"),
    IntentExample("where is Wichai", "patients.read", "patient-management"),
    IntentExample("which room is Wichai in", "patients.read", "patient-management"),
    IntentExample("get patient details", "patients.read", "patient-management"),
    IntentExample("show patient information", "patients.read", "patient-management"),
    IntentExample("patient profile", "patients.read", "patient-management"),
    IntentExample("move patient to room", "patients.write", "facility-ops"),
    IntentExample("assign patient room", "patients.write", "facility-ops"),
    IntentExample("transfer patient", "patients.write", "facility-ops"),
    IntentExample("update patient room", "patients.write", "facility-ops"),
    IntentExample("create a new patient record", "patients.write", "patient-management"),
    IntentExample("add a patient named Jane Doe age 58 with diabetes", "patients.write", "patient-management"),
    # Alerts
    IntentExample("show alerts", "alerts.read", "clinical-triage"),
    IntentExample("list active alerts", "alerts.read", "clinical-triage"),
    IntentExample("what alerts are active", "alerts.read", "clinical-triage"),
    IntentExample("acknowledge alert", "alerts.manage", "clinical-triage"),
    IntentExample("ack that alert", "alerts.manage", "clinical-triage"),
    IntentExample("resolve the fall alert", "alerts.manage", "clinical-triage"),
    IntentExample("clear alert", "alerts.manage", "clinical-triage"),
    IntentExample("dismiss alert", "alerts.manage", "clinical-triage"),
    # Devices
    IntentExample("list devices", "devices.read", "device-control"),
    IntentExample("show devices", "devices.read", "device-control"),
    IntentExample("device status", "devices.read", "device-control"),
    IntentExample("trigger camera capture", "devices.control", "device-control"),
    IntentExample("take a photo", "devices.control", "device-control"),
    IntentExample("capture camera image", "devices.control", "device-control"),
    # Rooms
    IntentExample("list rooms", "rooms.read", "facility-ops"),
    IntentExample("show rooms", "rooms.read", "facility-ops"),
    IntentExample("what rooms are available", "rooms.read", "facility-ops"),
    # Tasks/Workflow
    IntentExample("my tasks", "tasks.read", "workflow"),
    IntentExample("show my tasks", "tasks.read", "workflow"),
    IntentExample("workflow tasks", "tasks.read", "workflow"),
    IntentExample("my schedule", "schedules.read", "workflow"),
    IntentExample("upcoming schedule", "schedules.read", "workflow"),
    IntentExample("workflow schedules", "schedules.read", "workflow"),
    # System
    IntentExample("system health", "system.health", "system"),
    IntentExample("system status", "system.health", "system"),
    IntentExample("platform status", "system.health", "system"),
    IntentExample("is the system ok", "system.health", "system"),
    # Thai / mixed (multilingual embedding + classifier)
    IntentExample("แสดงรายชื่อผู้ป่วยทั้งหมด", "patients.read", "patient-management"),
    IntentExample("ตอนนี้มีผู้ป่วยใครบ้าง", "patients.read", "patient-management"),
    IntentExample("ผู้ป่วยมีกี่คน", "patients.read", "patient-management"),
    IntentExample("ดูข้อมูลผู้ป่วย", "patients.read", "patient-management"),
    IntentExample("วิชัยอยู่ที่ไหน", "patients.read", "patient-management"),
    IntentExample("ผู้ป่วยวิชัยอยู่ห้องไหน", "patients.read", "patient-management"),
    IntentExample("เพิ่มผู้ป่วยใหม่ชื่อ จรี ชาญชัย อายุ 58 เป็นเบาหวาน", "patients.write", "patient-management"),
    IntentExample("ย้ายผู้ป่วยไปห้อง", "patients.write", "facility-ops"),
    IntentExample("เปลี่ยนห้องผู้ป่วย", "patients.write", "facility-ops"),
    IntentExample("มอบหมายห้องให้ผู้ป่วย", "patients.write", "facility-ops"),
    IntentExample("แสดงการแจ้งเตือน", "alerts.read", "clinical-triage"),
    IntentExample("มีเคสแจ้งเตือนอะไรบ้าง", "alerts.read", "clinical-triage"),
    IntentExample("รับทราบการแจ้งเตือน", "alerts.manage", "clinical-triage"),
    IntentExample("ปิดเคสแจ้งเตือน", "alerts.manage", "clinical-triage"),
    IntentExample("รายการอุปกรณ์", "devices.read", "device-control"),
    IntentExample("แสดงอุปกรณ์ทั้งหมด", "devices.read", "device-control"),
    IntentExample("ถ่ายรูปจากกล้อง", "devices.control", "device-control"),
    IntentExample("รายการห้อง", "rooms.read", "facility-ops"),
    IntentExample("ห้องว่างมีห้องไหนบ้าง", "rooms.read", "facility-ops"),
    IntentExample("งานของฉัน", "tasks.read", "workflow"),
    IntentExample("ตารางงานวันนี้", "schedules.read", "workflow"),
    IntentExample("สถานะระบบเป็นยังไง", "system.health", "system"),
    IntentExample("ระบบทำงานปกติไหม", "system.health", "system"),
    IntentExample("สัญญาณชีพล่าสุด", "patients.read", "patient-management"),
    IntentExample("ประวัติสุขภาพล่าสุด", "patients.read", "patient-management"),
    IntentExample("ไทม์ไลน์ผู้ป่วย", "patients.read", "patient-management"),
    IntentExample("ตอนนี้มีใครในระบบบ้าง", "patients.read", "patient-management"),
    IntentExample("มีโรคเรื้อรังอะไรบ้าง", "patients.read", "patient-management"),
]

# Confidence thresholds
HIGH_CONFIDENCE_THRESHOLD = 0.85
MEDIUM_CONFIDENCE_THRESHOLD = 0.60
LOW_CONFIDENCE_THRESHOLD = 0.40


def _patient_profile_followup(message: str) -> bool:
    """Short questions about chronic conditions / allergies / profile slice (needs patient context)."""
    m = (message or "").strip()
    if not m or len(m) > 160:
        return False
    lowered = m.lower()
    if len(re.findall(r"[ก-๙]{2,}", m)) > 28:
        return False
    return (
        "โรคเรื้อรัง" in m
        or "โรคประจำ" in m
        or "ภาวะสุขภาพ" in m
        or "แพ้ยา" in m
        or ("โรค" in m and ("อะไร" in m or "บ้าง" in m))
        or "chronic" in lowered
        or "medical history" in lowered
        or "allerg" in lowered
    )


def _clinical_slice_followup(message: str) -> bool:
    """True when the user line is a short request for vitals/timeline/history without naming a patient."""
    m = (message or "").strip()
    if not m or len(m) > 140:
        return False
    lowered = m.lower()
    has_cue = (
        "ประวัติ" in m
        or "ไทม์ไลน์" in m
        or "timeline" in lowered
        or "สัญญาณชีพ" in m
        or "ชีพจร" in m
        or "ความดัน" in m
        or "spo2" in lowered
        or "vitals" in lowered
        or "vital" in lowered
        or "heart rate" in lowered
        or "ออกซิเจน" in m
    )
    if not has_cue:
        return False
    # Reject long pasted paragraphs (many Thai tokens).
    if len(re.findall(r"[ก-๙]{2,}", m)) > 22:
        return False
    return True


def _unique_patient_id_from_name_substrings(text: str, cards: list[dict[str, Any]]) -> int | None:
    """Match roster rows when Thai text has no spaces (token split fails). Requires a unique patient hit."""
    if not text or not cards:
        return None
    matched_ids: list[int] = []
    for card in cards:
        pid = card.get("id")
        if pid is None:
            continue
        candidates: list[str] = []
        for key in ("first_name", "last_name", "nickname"):
            val = (card.get(key) or "").strip()
            if len(val) >= 2:
                candidates.append(val)
        candidates.sort(key=len, reverse=True)
        for val in candidates:
            if val in text:
                matched_ids.append(int(pid))
                break
    uniq: list[int] = []
    for p in matched_ids:
        if p not in uniq:
            uniq.append(p)
    if len(uniq) == 1:
        return uniq[0]
    return None


def pick_patient_id_for_followup(message: str, context: ConversationContext | None) -> int | None:
    """Resolve patient_id for short follow-ups (Thai/EN) using roster context."""
    if context is None:
        return None
    m = (message or "").strip()
    if not m:
        return None
    num = re.fullmatch(r"(\d+)", m)
    if num:
        return int(num.group(1))
    roster = [e for e in context.last_entities if e.get("type") == "patient" and e.get("id") is not None]
    if len(roster) == 1:
        return int(roster[0]["id"])
    needle = m.lower()
    raw_pieces = [p for p in re.split(r"[\s,]+", needle) if len(p) >= 2]
    pieces: list[str] = []
    for p in raw_pieces:
        t = p.strip("()[]（）【〕〔").strip()
        if len(t) >= 2:
            pieces.append(t)
    for card in context.last_patient_cards or []:
        pid = card.get("id")
        if pid is None:
            continue
        fn = (card.get("first_name") or "").strip().lower()
        ln = (card.get("last_name") or "").strip().lower()
        nn = (card.get("nickname") or "").strip().lower()
        blob = f"{fn}{ln}{nn}"
        for p in pieces:
            if len(p) >= 2 and (p in fn or p in ln or p in nn or p in blob):
                return int(pid)
    cards = context.last_patient_cards or []
    if cards:
        hit = _unique_patient_id_from_name_substrings(m, cards)
        if hit is not None:
            return hit
    if context.last_focused_patient_id is not None and _clinical_slice_followup(m):
        return int(context.last_focused_patient_id)
    if context.last_focused_patient_id is not None and _patient_profile_followup(m):
        return int(context.last_focused_patient_id)
    if cards and (_clinical_slice_followup(m) or _patient_profile_followup(m)):
        user_blob = "\n".join(
            msg.get("content") or ""
            for msg in context.messages
            if msg.get("role") == "user"
        )
        hit = _unique_patient_id_from_name_substrings(user_blob, cards)
        if hit is not None:
            return hit
    return None


def _human_plan_summary(intent: IntentMatch, original_message: str) -> str:
    """Short operator-facing summary for a single-tool execution plan."""
    tn = intent.tool_name
    args = intent.arguments
    if tn == "acknowledge_alert" and args.get("alert_id") is not None:
        return f"Acknowledge alert {args['alert_id']}"
    if tn == "resolve_alert" and args.get("alert_id") is not None:
        note = (args.get("note") or "").strip()
        base = f"Resolve alert {args['alert_id']}"
        return f"{base} ({note})" if note else base
    if tn == "update_patient_room" and args.get("patient_id") is not None and args.get("room_id") is not None:
        return f"Move patient {args['patient_id']} to room {args['room_id']}"
    if tn == "create_patient_record" and args.get("first_name") and args.get("last_name"):
        return f"Create patient record for {args['first_name']} {args['last_name']}"
    if tn == "trigger_camera_photo" and args.get("device_pk") is not None:
        return f"Trigger camera on device {args['device_pk']}"
    om = (original_message or "").strip()
    if om and len(om) <= 72:
        return om
    if om:
        return f"{om[:69]}..."
    return f"Execute {intent.intent}"


class IntentClassifier:
    """Enhanced intent classifier with regex + semantic fallback."""

    def __init__(self) -> None:
        """Initialize the classifier."""
        self._embedding_model: Any | None = None
        self._embedding_model_name: str | None = None
        self._example_embeddings: Any | None = None
        self._intent_patterns = self._build_regex_patterns()

    def _build_regex_patterns(self) -> list[tuple[str, str, str, dict[str, Any]]]:
        """Build regex patterns for intent matching.

        Returns list of (pattern, intent, playbook, metadata) tuples.
        """
        return [
            # Thai: vitals / health slice follow-ups (need patient context from prior list/detail)
            # "ประวัติสุขภาพ" maps here: get_patient_vitals returns readings + clinical observations.
            (
                r"(?:สัญญาณชีพ|ค่าชีพ|vitals?|vital\s*signs|spo2|ออกซิเจน(?:ในเลือด)?|ชีพจร|heart\s*rate|ความดัน|ประวัติสุขภาพ|ข้อมูลสุขภาพ)(?:\s*(?:ล่าสุด|ปัจจุบัน|ช่วงนี้|ตอนนี้))?",
                "patients.read.vitals",
                "clinical-triage",
                {"immediate_read_context_tool": "get_patient_vitals"},
            ),
            (
                r"(?:ไทม์ไลน์|timeline)(?:\s*(?:ล่าสุด|ย้อนหลัง|ช่วงนี้))?|(?:เหตุการณ์|กิจกรรม)(?:\s*(?:ล่าสุด|ย้อนหลัง))?|(?:ประวัติ(?:การรักษา|การดูแล))(?:\s*(?:ล่าสุด|ย้อนหลัง|ช่วงนี้))?",
                "patients.read.timeline",
                "clinical-triage",
                {"immediate_read_context_tool": "get_patient_timeline"},
            ),
            # Thai: chronic conditions / allergies / profile slice (MCP get_patient_details)
            (
                r"(?:โรคเรื้อรัง|โรคประจำ|แพ้ยา|ภาวะสุขภาพ|chronic\s*(?:disease|condition)|medical\s*history|allergies?)",
                "patients.read.profile",
                "patient-management",
                {"immediate_read_context_tool": "get_patient_details"},
            ),
            # Thai: "ขอของคุณวิชัย" / "ขอข้อมูลคุณสมชาย" after a roster list (substring match on given name)
            (
                r"(?:ขอ|ดู|อยาก(?:ดู|รู้)|ต้องการ)(?:\s*ของ\s*(?:คุณ\s*)?|\s*(?:ข้อมูล|รายละเอียด)\s*(?:ของ\s*(?:คุณ\s*)?)?)([ก-๙A-Za-z]{2,})",
                "patients.read.detail",
                "patient-management",
                {"immediate_read_context_tool": "get_patient_details"},
            ),
            # Thai: "who is in the system" → list visible patients (clinical roster, not IT user directory)
            (
                r"(?:ตอนนี้|วันนี้|ขณะนี้).{0,24}ใคร.{0,36}ระบบ|ใคร.{0,24}ระบบ.{0,16}บ้าง",
                "patients.read",
                "patient-management",
                {"immediate_tool": ("list_visible_patients", {})},
            ),
            # Thai: vague "patient info in the system"
            (
                r"(?:ขอ|ดู|อยากรู้|ต้องการ).{0,24}(?:ข้อมูล|รายชื่อ|รายการ).{0,20}(?:ผู้ป่วย|คนไข้)|(?:ผู้ป่วย|คนไข้).{0,20}(?:ในระบบ|ทั้งหมด|มีใคร)",
                "patients.read",
                "patient-management",
                {"immediate_tool": ("list_visible_patients", {})},
            ),
            # System health - immediate tool
            (
                r"(?:system health|system status|platform status|is the system)",
                "system.health",
                "system",
                {"immediate_tool": ("get_system_health", {})},
            ),
            # Rooms - immediate tool
            (
                r"(?:list|show|all).*?(?:rooms?)|\broom\s+list\b",
                "rooms.read",
                "facility-ops",
                {"immediate_tool": ("list_rooms", {})},
            ),
            # Devices - immediate tool
            (
                r"(?:list|show|all).*?(?:devices?)|\bdevice\s+list\b|device\s+status",
                "devices.read",
                "device-control",
                {"immediate_tool": ("list_devices", {})},
            ),
            # Alerts - immediate tool
            (
                r"(?:active|show|list).*?(?:alerts?|alert list)",
                "alerts.read",
                "clinical-triage",
                {"immediate_tool": ("list_active_alerts", {})},
            ),
            # Tasks - immediate tool
            (
                r"(?:my|show).*?(?:tasks?|workflow tasks|tasks due)",
                "tasks.read",
                "workflow",
                {"immediate_tool": ("list_workflow_tasks", {})},
            ),
            # Schedules - immediate tool
            (
                r"(?:my|upcoming|show).*?(?:schedules?|workflow schedules)",
                "schedules.read",
                "workflow",
                {"immediate_tool": ("list_workflow_schedules", {})},
            ),
            # Patients - immediate tool (English)
            (
                r"(?:list|show|all).*?(?:patients?|patient list)",
                "patients.read",
                "patient-management",
                {"immediate_tool": ("list_visible_patients", {})},
            ),
            (
                r"(?:where\s+is|which\s+room\s+is)\s+(?:patient\s+)?([A-Za-z][A-Za-z\s'-]{1,40})",
                "patients.read",
                "patient-management",
                {
                    "immediate_tool_name": "list_visible_patients",
                    "extract_text": "query",
                },
            ),
            # Patients - immediate tool (Thai: ผู้ป่วย / คนไข้ + who / which / list wording)
            (
                r"(?:ผู้ป่วย|คนไข้).{0,48}(?:ใคร|มีใคร|มีกี่|รายชื่อ|คนไหน|คือใครบ้าง|ทั้งหมด)|(?:ใคร|รายชื่อ).{0,32}(?:ผู้ป่วย|คนไข้)|(?:ตอนนี้|วันนี้).{0,24}(?:ผู้ป่วย|คนไข้)",
                "patients.read",
                "patient-management",
                {"immediate_tool": ("list_visible_patients", {})},
            ),
            (
                r"(?:ผู้ป่วย|คนไข้)?\s*([ก-๙A-Za-z]+)\s*(?:อยู่ที่ไหน|อยู่ห้องไหน|อยู่ห้องอะไร)",
                "patients.read",
                "patient-management",
                {
                    "immediate_tool_name": "list_visible_patients",
                    "extract_text": "query",
                },
            ),
            # Acknowledge alert with ID
            (
                r"(?:acknowledge alert|ack alert)\s*#?(\d+)",
                "alerts.manage",
                "clinical-triage",
                {
                    "extract_id": "alert_id",
                    "tool_name": "acknowledge_alert",
                    "permission_basis": ["alerts.manage"],
                    "risk_level": "medium",
                },
            ),
            # Resolve alert with ID
            (
                r"(?:resolve alert)\s*#?(\d+)",
                "alerts.manage",
                "clinical-triage",
                {
                    "extract_id": "alert_id",
                    "tool_name": "resolve_alert",
                    "permission_basis": ["alerts.manage"],
                    "risk_level": "medium",
                    "default_args": {"note": ""},
                },
            ),
            # Move patient with IDs
            (
                r"(?:move patient|assign patient room)\s*#?(\d+).*?(?:room)\s*#?(\d+)",
                "patients.write",
                "facility-ops",
                {
                    "extract_ids": ["patient_id", "room_id"],
                    "tool_name": "update_patient_room",
                    "permission_basis": ["patients.write"],
                    "risk_level": "high",
                },
            ),
            # Camera capture with ID
            (
                r"(?:capture camera|trigger camera)\s*#?(\d+)",
                "devices.control",
                "device-control",
                {
                    "extract_id": "device_pk",
                    "tool_name": "trigger_camera_photo",
                    "permission_basis": ["cameras.capture"],
                    "risk_level": "medium",
                },
            ),
            # Acknowledge alert by reference (coreference)
            (
                r"(?:acknowledge that alert|ack that|acknowledge it)",
                "alerts.manage.reference",
                "clinical-triage",
                {
                    "requires_context": True,
                    "tool_name": "acknowledge_alert",
                    "permission_basis": ["alerts.manage"],
                    "risk_level": "medium",
                },
            ),
            # Patient reference ("what about patient B?")
            (
                r"(?:what about|and|also)\s+(?:patient)?\s*#?(\d+)",
                "patients.read.reference",
                "patient-management",
                {
                    "requires_context": True,
                    "extract_id": "patient_id",
                    "tool_name": "get_patient_details",
                    "permission_basis": ["patients.read"],
                    "risk_level": "low",
                },
            ),
            # Thai / mixed: line is mostly a person name → list patients with query (disambiguation)
            (
                r"^[\s]*(?:คุณ\s*)?([ก-๙A-Za-z]+(?:\s+[ก-๙A-Za-z]+)+)(?:\s*\([^)]+\))?(?:\s*[–\-—].*)?\s*$",
                "patients.read",
                "patient-management",
                {
                    "immediate_tool_name": "list_visible_patients",
                    "extract_text": "query",
                    "name_line_min_chars": 6,
                },
            ),
        ]

    def _load_embedding_model(self) -> Any:
        """Lazy-load sentence transformer model for semantic matching."""
        if not settings.intent_semantic_enabled:
            return None
        model_name = settings.intent_embedding_model.strip() or "paraphrase-multilingual-MiniLM-L12-v2"
        if self._embedding_model is not None and self._embedding_model_name != model_name:
            self._embedding_model = None
            self._example_embeddings = None
            self._embedding_model_name = None
        if self._embedding_model is None:
            try:
                from sentence_transformers import SentenceTransformer

                self._embedding_model = SentenceTransformer(model_name)
                self._embedding_model_name = model_name
            except ImportError:
                logger.info("sentence-transformers not installed; semantic intent disabled")
                return None
            except Exception:
                logger.exception("Failed to load intent embedding model %r", model_name)
                self._embedding_model = None
                self._embedding_model_name = None
                return None
        return self._embedding_model

    def _compute_semantic_similarity(self, message: str) -> tuple[str, str, float] | None:
        """Compute semantic similarity to intent examples.

        Returns (intent, playbook, confidence) or None if model unavailable.
        """
        model = self._load_embedding_model()
        if model is None:
            return None

        try:
            import numpy as np

            # Precompute example embeddings if not cached
            if self._example_embeddings is None:
                texts = [ex.text for ex in INTENT_EXAMPLES]
                self._example_embeddings = model.encode(texts, convert_to_numpy=True)

            # Encode input message
            message_embedding = model.encode(message, convert_to_numpy=True)

            # Compute cosine similarities
            similarities = np.dot(self._example_embeddings, message_embedding) / (
                np.linalg.norm(self._example_embeddings, axis=1)
                * np.linalg.norm(message_embedding)
            )

            # Find best match
            best_idx = np.argmax(similarities)
            best_similarity = float(similarities[best_idx])
            best_example = INTENT_EXAMPLES[best_idx]

            return (best_example.intent, best_example.playbook, best_similarity)
        except Exception:
            return None

    def _extract_numeric(self, message: str, pattern: str) -> int | None:
        """Extract numeric ID from message using pattern."""
        match = re.search(pattern, message, flags=re.IGNORECASE)
        if not match:
            return None
        return int(match.group(1))

    def _extract_multiple_ids(
        self, message: str, pattern: str
    ) -> list[int | None]:
        """Extract multiple numeric IDs from message."""
        match = re.search(pattern, message, flags=re.IGNORECASE)
        if not match:
            return []
        return [int(g) if g else None for g in match.groups()]

    def _extract_text(self, message: str, pattern: str) -> str | None:
        match = re.search(pattern, message, flags=re.IGNORECASE)
        if not match:
            return None
        value = (match.group(1) or "").strip(" ?.,")
        value = re.sub(r"^(?:ตอนนี้|ขณะนี้|ตอนนี้ผู้ป่วย)\s*", "", value, flags=re.IGNORECASE)
        return value or None

    def _parse_create_patient_command(self, message: str) -> dict[str, Any] | None:
        patterns = [
            r"(?:เพิ่ม|สร้าง)(?:ผู้ป่วย(?:ใหม่)?)?(?:ชื่อ)?\s*([ก-๙A-Za-z]+)\s+([ก-๙A-Za-z]+)(.*)",
            r"(?:add|create)\s+(?:a\s+)?(?:new\s+)?patient(?:\s+(?:named|name))?\s+([A-Za-z]+)\s+([A-Za-z]+)(.*)",
        ]
        for pattern in patterns:
            match = re.search(pattern, message, flags=re.IGNORECASE)
            if not match:
                continue
            first_name = match.group(1).strip()
            last_name = match.group(2).strip()
            tail = (match.group(3) or "").strip()
            age_match = re.search(r"(?:อายุ|age)\s*(\d{1,3})", tail, flags=re.IGNORECASE)
            condition_match = re.search(r"(?:เป็น|with|has)\s*([^,.]+)", tail, flags=re.IGNORECASE)
            notes: list[str] = []
            if age_match:
                notes.append(f"Reported age: {age_match.group(1)}")
            conditions: list[str] = []
            if condition_match:
                conditions.append(condition_match.group(1).strip())
            return {
                "first_name": first_name,
                "last_name": last_name,
                "medical_conditions": conditions,
                "notes": "; ".join(notes),
            }
        return None

    def _parse_explicit_tool_call(
        self,
        message: str,
    ) -> tuple[IntentMatch | None, tuple[str, dict[str, Any]] | None]:
        match = re.match(
            r"^\s*(?:/tool|tool:|run tool)\s+([a-z_]+)(?:\s+(\{.*\}))?\s*$",
            message.strip(),
            flags=re.IGNORECASE | re.DOTALL,
        )
        if not match:
            return (None, None)

        tool_name = match.group(1).strip()
        metadata = TOOL_INTENT_METADATA.get(tool_name)
        if metadata is None:
            return (None, None)

        arguments: dict[str, Any] = {}
        payload = (match.group(2) or "").strip()
        if payload:
            try:
                decoded = json.loads(payload)
                if isinstance(decoded, dict):
                    arguments = decoded
            except Exception:
                arguments = {}

        intent_match = IntentMatch(
            intent=f"tool.{tool_name}",
            playbook=metadata["playbook"],
            confidence=1.0,
            tool_name=tool_name,
            arguments=arguments,
            permission_basis=list(metadata["permission_basis"]),
            risk_level=metadata["risk_level"],
            requires_confirmation=not bool(metadata["read_only"]),
        )
        if metadata["read_only"]:
            return (intent_match, (tool_name, arguments))
        return (intent_match, None)

    def classify(
        self,
        message: str,
        context: ConversationContext | None = None,
    ) -> tuple[IntentMatch | None, tuple[str, dict[str, Any]] | None]:
        """Classify message intent with confidence scoring.

        Returns (intent_match, immediate_tool) tuple.
        immediate_tool is set for simple read operations that don't need planning.
        """
        explicit_tool_match, explicit_immediate = self._parse_explicit_tool_call(message)
        if explicit_tool_match is not None:
            return (explicit_tool_match, explicit_immediate)

        create_patient_arguments = self._parse_create_patient_command(message)
        if create_patient_arguments is not None:
            return (
                IntentMatch(
                    intent="patients.write",
                    playbook="patient-management",
                    confidence=0.95,
                    tool_name="create_patient_record",
                    arguments=create_patient_arguments,
                    permission_basis=["patients.write"],
                    risk_level="high",
                    reasoning_target="medium",
                ),
                None,
            )

        # Try regex patterns first (high precision). Use original `message` so Thai + English both match.
        for pattern, intent, playbook, metadata in self._intent_patterns:
            if not re.search(pattern, message, flags=re.IGNORECASE):
                continue
            confidence = 0.95  # High confidence for exact regex match

            ctx_tool = metadata.get("immediate_read_context_tool")
            if ctx_tool and isinstance(ctx_tool, str):
                pid = pick_patient_id_for_followup(message, context)
                if pid is None:
                    continue
                meta = TOOL_INTENT_METADATA.get(ctx_tool, {})
                args = {"patient_id": pid}
                imm: tuple[str, dict[str, Any]] = (ctx_tool, args)
                return (
                    IntentMatch(
                        intent=intent,
                        playbook=playbook,
                        confidence=confidence,
                        tool_name=ctx_tool,
                        arguments=args,
                        entities=[{"type": "patient", "id": pid}],
                        permission_basis=list(meta.get("permission_basis", [])),
                        risk_level=str(meta.get("risk_level", "low")),
                        requires_confirmation=False,
                    ),
                    imm,
                )

            # Check if this is an immediate tool call
            immediate_tool = metadata.get("immediate_tool")
            if metadata.get("immediate_tool_name"):
                arguments = {}
                if metadata.get("extract_text"):
                    text_arg = self._extract_text(message, pattern)
                    if text_arg is None:
                        continue
                    min_chars = int(metadata.get("name_line_min_chars") or 0)
                    if min_chars and len(text_arg.strip()) < min_chars:
                        continue
                    arguments[metadata["extract_text"]] = text_arg
                immediate_tool = (metadata["immediate_tool_name"], arguments)
            if immediate_tool:
                return (
                    IntentMatch(
                        intent=intent,
                        playbook=playbook,
                        confidence=confidence,
                        tool_name=immediate_tool[0],
                        arguments=immediate_tool[1],
                        permission_basis=[],
                        risk_level="low",
                        requires_confirmation=False,
                    ),
                    immediate_tool,
                )

            # Handle ID extraction for tool calls
            arguments = {}
            entities: list[dict[str, Any]] = []

            if "extract_id" in metadata:
                id_val = self._extract_numeric(message, pattern)
                if id_val is not None:
                    arg_name = metadata["extract_id"]
                    arguments[arg_name] = id_val
                    entities.append({"type": arg_name.replace("_id", ""), "id": id_val})

            if "extract_ids" in metadata:
                ids = self._extract_multiple_ids(message, pattern)
                for i, id_name in enumerate(metadata["extract_ids"]):
                    if i < len(ids) and ids[i] is not None:
                        arguments[id_name] = ids[i]
                        entities.append({"type": id_name.replace("_id", ""), "id": ids[i]})

            # Handle default args
            if "default_args" in metadata:
                arguments.update(metadata["default_args"])

            # Handle context-dependent references (only if no ID was extracted from message)
            has_extracted_id = bool(entities)  # If we already extracted IDs from message
            if metadata.get("requires_context") and context and context.last_entities and not has_extracted_id:
                # Try to resolve reference from context only if no ID was in the message
                for entity in context.last_entities:
                    if entity.get("type") in ("alert", "patient"):
                        arguments[f"{entity['type']}_id"] = entity["id"]
                        entities.append(entity.copy())
                        break

            return (
                IntentMatch(
                    intent=intent,
                    playbook=playbook,
                    confidence=confidence,
                    tool_name=metadata.get("tool_name"),
                    arguments=arguments,
                    entities=entities,
                    permission_basis=metadata.get("permission_basis", []),
                    risk_level=metadata.get("risk_level", "low"),
                    requires_confirmation=metadata.get("tool_name") is not None,
                ),
                None,
            )

        # Fallback: semantic similarity matching (multilingual when enabled)
        semantic_result = self._compute_semantic_similarity(message)
        if semantic_result:
            intent, playbook, similarity = semantic_result

            if similarity >= LOW_CONFIDENCE_THRESHOLD:
                immediate_tool: tuple[str, dict[str, Any]] | None = None
                read_pair = SEMANTIC_READ_IMMEDIATE.get(intent)
                if read_pair and similarity >= float(settings.intent_semantic_immediate_threshold):
                    immediate_tool = read_pair
                return (
                    IntentMatch(
                        intent=intent,
                        playbook=playbook,
                        confidence=similarity,
                        tool_name=immediate_tool[0] if immediate_tool else None,
                        arguments=dict(immediate_tool[1]) if immediate_tool else {},
                        permission_basis=[],
                        risk_level="low",
                        requires_confirmation=immediate_tool is None,
                    ),
                    immediate_tool,
                )

        # No match found - will trigger AI fallback
        return (None, None)

    def detect_compound_intents(
        self,
        message: str,
        context: ConversationContext | None = None,
    ) -> list[IntentMatch]:
        """Detect if message contains multiple intents.

        Returns list of intent matches for compound processing.
        """
        # Check for conjunction patterns that indicate compound intent
        compound_patterns = [
            r"(.+?)\s+(?:and|then|also|plus)\s+(.+)",
            r"(.+?)\s*,\s*(?:and\s+)?(.+)",
        ]

        for pattern in compound_patterns:
            match = re.match(pattern, message, flags=re.IGNORECASE)
            if match:
                parts = [p.strip() for p in match.groups() if p.strip()]
                intents: list[IntentMatch] = []

                for part in parts:
                    intent_match, _ = self.classify(part, context)
                    if intent_match:
                        intents.append(intent_match)

                if len(intents) > 1:
                    return intents

        # Single intent
        single_intent, _ = self.classify(message, context)
        if single_intent:
            return [single_intent]

        return []

    def build_execution_plan(
        self,
        intents: list[IntentMatch],
        original_message: str,
    ) -> ExecutionPlan | None:
        """Build execution plan from detected intents.

        Handles dependencies between compound intent steps.
        """
        if not intents:
            return None

        # Single intent with tool
        if len(intents) == 1 and intents[0].tool_name:
            intent = intents[0]
            step = ExecutionPlanStep(
                id=f"step-{intent.intent}",
                title=f"Execute {intent.intent}",
                tool_name=intent.tool_name,
                arguments=intent.arguments,
                risk_level=intent.risk_level,
                permission_basis=intent.permission_basis,
                affected_entities=intent.entities,
                requires_confirmation=intent.requires_confirmation,
            )
            return ExecutionPlan(
                playbook=intent.playbook,
                summary=_human_plan_summary(intent, original_message),
                reasoning_target=intent.reasoning_target,
                model_target=intent.model_target,
                risk_level=intent.risk_level,
                steps=[step],
                permission_basis=intent.permission_basis,
                affected_entities=intent.entities,
            )

        # Compound intent: build multi-step plan
        steps: list[ExecutionPlanStep] = []
        all_entities: list[dict[str, Any]] = []
        all_permissions: list[str] = []
        max_risk = "low"

        for i, intent in enumerate(intents):
            if not intent.tool_name:
                continue

            step_id = f"step-{i+1}-{intent.intent}"
            # Steps after the first may depend on previous results
            depends_on = [f"step-{i}-{intents[i-1].intent}"] if i > 0 else None

            step = ExecutionPlanStep(
                id=step_id,
                title=f"{i+1}. {intent.intent}",
                tool_name=intent.tool_name,
                arguments=intent.arguments.copy(),
                risk_level=intent.risk_level,
                permission_basis=intent.permission_basis,
                affected_entities=intent.entities,
                requires_confirmation=intent.requires_confirmation,
            )
            steps.append(step)

            # Aggregate entities and permissions
            all_entities.extend(intent.entities)
            all_permissions.extend(intent.permission_basis)
            if intent.risk_level == "high" or max_risk == "high":
                max_risk = "high"
            elif intent.risk_level == "medium" and max_risk == "low":
                max_risk = "medium"

        if not steps:
            return None

        # Deduplicate
        seen_perms = set()
        unique_permissions = [p for p in all_permissions if not (p in seen_perms or seen_perms.add(p))]
        seen_entities = set()
        unique_entities = [
            e for e in all_entities
            if not ((e.get("type"), e.get("id")) in seen_entities
                    or seen_entities.add((e.get("type"), e.get("id"))))
        ]

        # Use first intent's playbook as primary
        primary_playbook = intents[0].playbook if intents else "compound"

        return ExecutionPlan(
            playbook=primary_playbook,
            summary=f"Execute {len(steps)} steps: {original_message[:60]}...",
            reasoning_target="medium",
            model_target="copilot:gpt-4.1",
            risk_level=max_risk,
            steps=steps,
            permission_basis=unique_permissions,
            affected_entities=unique_entities,
        )


# Global classifier instance
_classifier: IntentClassifier | None = None


def get_classifier() -> IntentClassifier:
    """Get or create global intent classifier instance."""
    global _classifier
    if _classifier is None:
        _classifier = IntentClassifier()
    return _classifier
