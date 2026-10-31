"""Heuristic fast path: obvious chitchat goes straight to the chat model (no MCP / intent pipeline)."""

from __future__ import annotations

import re

# If any of these appear, the user may be asking for ward data or actions — do not fast-path.
_DOMAIN_HINT = re.compile(
    r"(?:\bpatient|\balert|\broom|\bdevice|\bward|\bmcp\b|\back\b|\bresolve\b|\bmove\b|"
    r"\bassign\b|\bcamera\b|\bfloor|\btask|\bschedule|\bmessage|\bworkflow|\blist\b|\bshow\b|"
    r"ผู้ป่วย|คนไข้|แจ้งเตือน|ห้อง|อุปกรณ์|รายชื่อ|รายการ|ยืนยัน|รับทราบ|ย้าย|"
    r"acknowledge|visible|active|health\b|status\b|system\b)",
    re.IGNORECASE,
)

_DIGITS = re.compile(r"\d")

# Short greeting / thanks / bye only (whole message).
_CHITCHAT = re.compile(
    r"^\s*("
    r"hi+\b|hello|hey\b|good\s+(morning|afternoon|evening)|"
    r"thanks?\s*(you)?|thank\s+you|ty\b|thx\b|"
    r"สวัสดี(?:ครับ|คะ|ค่ะ)?|หวัดดี|ว่าไง|ดีจ้า|ดีครับ|ดีค่ะ|"
    r"ขอบคุณ(?:มาก|นะ)?(?:ครับ|ค่ะ|คะ)?|"
    r"how\s+are\s+you|what'?s\s+up\b|"
    r"bye|goodbye|see\s+you|ลาก่อน|ไปละ"
    r")\s*[!.?…]*\s*$",
    re.IGNORECASE,
)


def is_general_conversation_only(text: str, *, max_chars: int = 96) -> bool:
    """True when the message is almost certainly social / small-talk (no tools).

    Conservative: prefer a false negative (run intent) over skipping a real command.
    """
    t = (text or "").strip()
    if not t or len(t) > max_chars:
        return False
    if _DIGITS.search(t):
        return False
    if _DOMAIN_HINT.search(t):
        return False
    return bool(_CHITCHAT.match(t))
