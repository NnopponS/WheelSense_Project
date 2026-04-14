/**
 * Split free-form clinical list fields: commas, semicolons, or line breaks.
 * One entry per line is supported; Thai/English punctuation both work.
 */
export function splitList(raw: string): string[] {
  return raw
    .replace(/\r\n/g, "\n")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
