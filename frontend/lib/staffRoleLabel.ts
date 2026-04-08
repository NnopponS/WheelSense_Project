import type { TranslationKey } from "./i18n";

const STAFF_ROLE_KEYS: Record<string, TranslationKey> = {
  admin: "shell.roleAdmin",
  head_nurse: "shell.roleHeadNurse",
  supervisor: "shell.roleSupervisor",
  observer: "shell.roleObserver",
};

/** Maps `caregivers.role` / user-facing staff roles to shell.* i18n keys. */
export function staffRoleTranslationKey(role: string): TranslationKey | null {
  const k = role.trim().toLowerCase();
  return STAFF_ROLE_KEYS[k] ?? null;
}

export function formatStaffRoleLabel(
  role: string,
  t: (key: TranslationKey) => string,
): string {
  const key = staffRoleTranslationKey(role);
  if (key) return t(key);
  const trimmed = role.trim();
  return trimmed.length > 0 ? trimmed : "—";
}
