"""Small deterministic entity helpers for EaseAI runtime routing.

These functions intentionally work from already-visible rows supplied by MCP
tools. They do not query the database and they never expand access beyond the
backend policy-filtered roster.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any

_THAI_RE = re.compile(r"[\u0e00-\u0e7f]")
_WORD_RE = re.compile(r"[a-z0-9]+")

_STOPWORDS = {
    "a",
    "about",
    "and",
    "are",
    "at",
    "current",
    "currently",
    "for",
    "from",
    "get",
    "give",
    "history",
    "in",
    "is",
    "latest",
    "location",
    "me",
    "movement",
    "of",
    "patient",
    "patients",
    "please",
    "room",
    "show",
    "the",
    "them",
    "timeline",
    "to",
    "where",
}

# Common Thai phonetic spellings that users type for English demo names. The
# resolver still scores against the live patient roster; these are not patient
# ids or fixed database rows.
_THAI_NAME_HINTS: tuple[tuple[str, str], ...] = (
    ("โรเบิร์ต", " robert "),
    ("โรเบิต", " robert "),
    ("โรเบิด", " robert "),
    ("โรเบิรต", " robert "),
    ("เกรซ", " grace "),
    ("เกรส", " grace "),
    ("แดเนียล", " daniel "),
    ("ดาเนียล", " daniel "),
    ("เดเนียล", " daniel "),
    ("ซามูเอล", " samuel "),
    ("แซมูเอล", " samuel "),
    ("ซามูแอล", " samuel "),
)


def response_locale_for_text(text: str) -> str:
    """Return the response locale implied by the user's current message."""
    return "th" if _THAI_RE.search(text or "") else "en"


def _compact_latin(value: str) -> str:
    return "".join(_WORD_RE.findall((value or "").lower()))


def _message_variants(text: str) -> list[str]:
    base = (text or "").lower()
    variants = [base]
    hinted = base
    for thai, latin in _THAI_NAME_HINTS:
        hinted = hinted.replace(thai, latin)
    if hinted != base:
        variants.append(hinted)
    return variants


def _message_tokens(text: str) -> list[str]:
    tokens: list[str] = []
    for variant in _message_variants(text):
        for token in _WORD_RE.findall(variant):
            if len(token) < 3 or token in _STOPWORDS:
                continue
            if token not in tokens:
                tokens.append(token)
    return tokens


def patient_display_name(row: dict[str, Any]) -> str:
    full = f"{row.get('first_name') or ''} {row.get('last_name') or ''}".strip()
    return full or str(row.get("nickname") or row.get("id") or "Patient")


def _candidate_strings(row: dict[str, Any]) -> list[str]:
    values = [
        row.get("first_name"),
        row.get("last_name"),
        row.get("nickname"),
        patient_display_name(row),
    ]
    out: list[str] = []
    for value in values:
        text = str(value or "").strip().lower()
        if not text:
            continue
        for part in re.split(r"[\s,()/-]+", text):
            compact = _compact_latin(part)
            if len(compact) >= 3 and compact not in out:
                out.append(compact)
        compact_full = _compact_latin(text)
        if len(compact_full) >= 3 and compact_full not in out:
            out.append(compact_full)
    return out


def _score_token_against_candidates(token: str, candidates: list[str]) -> float:
    best = 0.0
    for candidate in candidates:
        if token == candidate:
            return 1.0
        if token in candidate or candidate in token:
            best = max(best, 0.92)
            continue
        if len(token) >= 4 and len(candidate) >= 4:
            best = max(best, SequenceMatcher(None, token, candidate).ratio())
    return best


def resolve_patient_mentions(
    message: str,
    patients: list[dict[str, Any]],
    *,
    min_score: float = 0.78,
    max_results: int = 6,
) -> list[dict[str, Any]]:
    """Find roster patients mentioned in free text.

    The input roster must already be policy-filtered. Results are returned in
    message-order where possible, then by score.
    """
    tokens = _message_tokens(message)
    if not tokens or not patients:
        return []

    scored: list[tuple[int, float, dict[str, Any]]] = []
    for row in patients:
        pid = row.get("id")
        if pid is None:
            continue
        candidates = _candidate_strings(row)
        if not candidates:
            continue
        best_score = 0.0
        first_position = 10_000
        for pos, token in enumerate(tokens):
            score = _score_token_against_candidates(token, candidates)
            if score > best_score:
                best_score = score
                first_position = pos
        if best_score >= min_score:
            scored.append((first_position, best_score, row))

    scored.sort(key=lambda item: (item[0], -item[1], int(item[2].get("id") or 0)))
    out: list[dict[str, Any]] = []
    seen: set[int] = set()
    for _, _, row in scored:
        pid = int(row["id"])
        if pid in seen:
            continue
        seen.add(pid)
        out.append(row)
        if len(out) >= max_results:
            break
    return out

