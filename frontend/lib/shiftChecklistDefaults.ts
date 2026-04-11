import type { TranslationKey } from "@/lib/i18n";
import type { ShiftChecklistItemApi } from "@/lib/api/task-scope-types";

export type ShiftChecklistCategory = "shift" | "room" | "patient";

export type ShiftChecklistRow = {
  id: string;
  labelKey: TranslationKey;
  checked: boolean;
  category: ShiftChecklistCategory;
};

/** Canonical template — server stores `id` + `checked` + `label_key` + `category`. */
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

export function mergeServerShiftChecklist(serverItems: ShiftChecklistItemApi[] | undefined): ShiftChecklistRow[] {
  if (!serverItems?.length) {
    return DEFAULT_SHIFT_CHECKLIST.map((r) => ({ ...r }));
  }
  const byId = new Map(serverItems.map((i) => [i.id, i]));
  return DEFAULT_SHIFT_CHECKLIST.map((def) => {
    const s = byId.get(def.id);
    return {
      ...def,
      checked: s?.checked ?? def.checked,
    };
  });
}

export function rowsToApiPayload(rows: ShiftChecklistRow[]): ShiftChecklistItemApi[] {
  return rows.map((r) => ({
    id: r.id,
    label_key: r.labelKey,
    checked: r.checked,
    category: r.category,
  }));
}
