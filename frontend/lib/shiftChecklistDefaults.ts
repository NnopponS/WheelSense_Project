import type { ShiftChecklistItemApi } from "@/lib/api/task-scope-types";

export type ShiftChecklistCategory = "shift" | "room" | "patient";

export type ShiftChecklistRow = {
  id: string;
  /** Display text stored in API field `label_key` (plain language, not i18n keys). */
  labelKey: string;
  checked: boolean;
  category: ShiftChecklistCategory;
};

/** Fallback when API returns no items (offline / error). Matches server default_shift_template. */
export const DEFAULT_SHIFT_CHECKLIST: ShiftChecklistRow[] = [
  { id: "1", labelKey: "ลงเวลาเข้ากะ", checked: false, category: "shift" },
  { id: "2", labelKey: "ตรวจอุปกรณ์ฉุกเฉิน", checked: false, category: "shift" },
  { id: "3", labelKey: "ทบทวนผู้ป่วยที่รับผิดชอบ", checked: false, category: "shift" },
  { id: "4", labelKey: "ห้อง 101 - ตรวจสัญญาณชีพ", checked: false, category: "room" },
  { id: "5", labelKey: "ห้อง 102 - ช่วยมื้ออาหาร", checked: false, category: "room" },
  { id: "6", labelKey: "ห้อง 103 - ตรวจยา", checked: false, category: "room" },
  { id: "7", labelKey: "บันทึกการสังเกตผู้ป่วย", checked: false, category: "patient" },
  { id: "8", labelKey: "อัปเดตบันทึกการดูแล", checked: false, category: "patient" },
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
