export function ageYears(dobIso: string | null, referenceMs: number): number | null {
  if (!dobIso) return null;
  const birth = new Date(`${dobIso}T12:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const ref = new Date(referenceMs);
  let age = ref.getUTCFullYear() - birth.getUTCFullYear();
  const birthMonth = birth.getUTCMonth();
  const birthDay = birth.getUTCDate();
  if (
    ref.getUTCMonth() < birthMonth ||
    (ref.getUTCMonth() === birthMonth && ref.getUTCDate() < birthDay)
  ) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}
