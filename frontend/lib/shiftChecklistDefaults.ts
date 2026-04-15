import type { ShiftChecklistItemApi } from "@/lib/api/task-scope-types";

export type ShiftChecklistCategory = "shift" | "room" | "patient";

export type ShiftChecklistRow = {
  id: string;
  /** i18n key or plain label key from server template */
  labelKey: string;
  checked: boolean;
  category: ShiftChecklistCategory;
};

/** Fallback when API returns no items (offline / error). Matches server default_shift_template. */
export const DEFAULT_SHIFT_CHECKLIST: ShiftChecklistRow[] = [
  { id: "1", labelKey: "observer.checklist.signIn", checked: false, category: "shift" },
  { id: "2", labelKey: "observer.checklist.emergencyEquip", checked: false, category: "shift" },
  { id: "3", labelKey: "observer.checklist.reviewPatients", checked: false, category: "shift" },
  { id: "4", labelKey: "observer.checklist.room101", checked: false, category: "room" },
  { id: "5", labelKey: "observer.checklist.room102", checked: false, category: "room" },
  { id: "6", labelKey: "observer.checklist.room103", checked: false, category: "room" },
  { id: "7", labelKey: "observer.checklist.docObs", checked: false, category: "patient" },
  { id: "8", labelKey: "observer.checklist.careLog", checked: false, category: "patient" },
];

export function utcShiftDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Maps GET /shift-checklist/me items to UI rows (server already merges template + daily state). */
export function mergeServerShiftChecklist(serverItems: ShiftChecklistItemApi[] | undefined): ShiftChecklistRow[] {
  if (!serverItems?.length) {
    return DEFAULT_SHIFT_CHECKLIST.map((r) => ({ ...r }));
  }
  return serverItems.map((i) => ({
    id: i.id,
    labelKey: i.label_key,
    checked: !!i.checked,
    category: i.category,
  }));
}

export function rowsToApiPayload(rows: ShiftChecklistRow[]): ShiftChecklistItemApi[] {
  return rows.map((r) => ({
    id: r.id,
    label_key: r.labelKey,
    checked: r.checked,
    category: r.category,
  }));
}
