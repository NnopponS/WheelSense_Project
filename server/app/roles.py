from collections.abc import Iterable
from typing import TypeVar


RoleValue = TypeVar("RoleValue", str, None)


_LEGACY_ROLE_MAP: dict[str, str] = {
    "head_nurse": "head_caregiver",
    "supervisor": "head_caregiver",
    "observer": "caregiver",
}


def canonicalize_role(role: RoleValue) -> RoleValue:
    """Accept legacy role names while emitting the canonical role.

    Legacy → canonical mapping:
      head_nurse  → head_caregiver
      supervisor  → head_caregiver
      observer    → caregiver
    """
    if role is None:
        return None
    return _LEGACY_ROLE_MAP.get(role, role)


def role_is_allowed(role: str, allowed_roles: Iterable[str]) -> bool:
    canonical_allowed = {canonicalize_role(allowed) for allowed in allowed_roles}
    return canonicalize_role(role) in canonical_allowed
