export const CANONICAL_STAFF_ROLES = ["admin", "head_caregiver", "caregiver"] as const;

const LEGACY_ROLE_MAP: Record<string, string> = {
  head_nurse: "head_caregiver",
  supervisor: "head_caregiver",
  observer: "caregiver",
};

export function canonicalizeRole(role: string): string {
  return LEGACY_ROLE_MAP[role] ?? role;
}
