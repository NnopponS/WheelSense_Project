/**
 * Appends `previewAs=<patientId>` for admin (or staff) previewing the patient portal as a specific patient.
 * Preserves existing query string and hash.
 */
export function withPatientPreview(path: string, previewPatientId: number | null | undefined): string {
  if (previewPatientId == null || !Number.isFinite(previewPatientId) || previewPatientId <= 0) {
    return path;
  }
  const id = Math.floor(Number(previewPatientId));
  const hashIdx = path.indexOf("#");
  const pathAndQuery = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
  const hash = hashIdx >= 0 ? path.slice(hashIdx) : "";
  const qIdx = pathAndQuery.indexOf("?");
  const base = qIdx >= 0 ? pathAndQuery.slice(0, qIdx) : pathAndQuery;
  const existing = qIdx >= 0 ? pathAndQuery.slice(qIdx + 1) : "";
  const q = new URLSearchParams(existing);
  q.set("previewAs", String(id));
  return `${base}?${q.toString()}${hash}`;
}
