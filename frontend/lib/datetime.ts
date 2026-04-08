import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : parseISO(value);
  return isValid(date) ? date : null;
}

export function formatDateTime(value: string | Date | null | undefined) {
  const date = toDate(value);
  if (!date) return "-";
  return format(date, "dd MMM yyyy, HH:mm");
}

export function formatRelativeTime(value: string | Date | null | undefined) {
  const date = toDate(value);
  if (!date) return "-";
  return formatDistanceToNowStrict(date, { addSuffix: true });
}
