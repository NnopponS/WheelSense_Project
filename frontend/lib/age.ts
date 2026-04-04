export function ageYears(dobIso: string | null, referenceMs: number): number | null {
  if (!dobIso) return null;
  const birth = new Date(dobIso).getTime();
  return Math.floor((referenceMs - birth) / (365.25 * 24 * 60 * 60 * 1000));
}
