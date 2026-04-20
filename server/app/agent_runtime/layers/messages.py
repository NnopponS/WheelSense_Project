"""Localized en/th failure copy shared by all pipeline layers.

Every key MUST carry both locales. Backend returns `{locale, text}` pairs so
the frontend does not translate error strings (per ADR 0015 §i18n).
"""

from __future__ import annotations

from typing import TypedDict


class LocalizedMessage(TypedDict):
    en: str
    th: str


# Keys are stable reason_codes; never rename without migrating callers.
MESSAGES: dict[str, LocalizedMessage] = {
    "empty_message": {
        "en": "Please enter a message to continue.",
        "th": "กรุณาพิมพ์ข้อความเพื่อดำเนินการต่อ",
    },
    "message_too_long": {
        "en": "The message is too long. Please shorten it and try again.",
        "th": "ข้อความยาวเกินไป กรุณาย่อและลองใหม่อีกครั้ง",
    },
    "role_not_permitted": {
        "en": "This action is not permitted for your role.",
        "th": "บทบาทของคุณไม่มีสิทธิ์ใช้คำสั่งนี้",
    },
    "policy_denied": {
        "en": "Your request was blocked by a safety policy.",
        "th": "คำขอของคุณถูกบล็อกโดยนโยบายความปลอดภัย",
    },
    "missing_patient_context": {
        "en": "A patient reference is required for this action.",
        "th": "ต้องระบุผู้ป่วยสำหรับคำสั่งนี้",
    },
    "missing_facts_generic": {
        "en": "Not enough information is available to act safely.",
        "th": "ข้อมูลไม่เพียงพอสำหรับดำเนินการอย่างปลอดภัย",
    },
}


def get(reason_code: str, locale: str = "en") -> str:
    """Return localized copy for a reason_code. Falls back to English when the
    key is missing from the `th` map, and to the reason_code itself when the
    key is missing entirely — so callers never have to branch.
    """
    entry = MESSAGES.get(reason_code)
    if entry is None:
        return reason_code
    if locale == "th":
        return entry.get("th") or entry["en"]
    return entry["en"]


def pair(reason_code: str) -> tuple[str, str]:
    """Return `(en, th)` pair used when constructing contract instances."""
    entry = MESSAGES.get(reason_code)
    if entry is None:
        return (reason_code, reason_code)
    return (entry["en"], entry.get("th") or entry["en"])


__all__ = ["MESSAGES", "get", "pair"]
