/** Split comma/semicolon/newline-separated clinical list fields (matches Add Patient). */
export function splitList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
