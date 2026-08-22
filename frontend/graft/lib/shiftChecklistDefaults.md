# lib/shiftChecklistDefaults.ts

- ShiftChecklistCategory · type · L3-L3 — type ShiftChecklistCategory = "shift" | "room" | "patient";
- ShiftChecklistRow · type · L5-L11 — type ShiftChecklistRow = { id: string; /** Display text stored in API field `label_key` (plain language, not i18n keys). */ labelKey: string; checked: boolean; category: ShiftChecklistCategory; };
- utcShiftDateString · function · L25-L27 — function utcShiftDateString(): string
- mergeServerShiftChecklist · function · L30-L40 — function mergeServerShiftChecklist(serverItems: ShiftChecklistItemApi[] | undefined): ShiftChecklistRow[]
- rowsToApiPayload · function · L42-L49 — function rowsToApiPayload(rows: ShiftChecklistRow[]): ShiftChecklistItemApi[]
