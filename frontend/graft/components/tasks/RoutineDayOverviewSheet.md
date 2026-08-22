# components/tasks/RoutineDayOverviewSheet.tsx

- FloorStaffRole · type · L44-L44 — type FloorStaffRole = "observer" | "supervisor";
- RoleFilter · type · L45-L45 — type RoleFilter = "all" | FloorStaffRole;
- formatStaffRole · function · L47-L50 — function formatStaffRole(role: string, t: (key: TranslationKey) => string): string
- localDateKey · function · L53-L59 — function localDateKey(iso: string): string
- RoutineDayOverviewSheetProps · interface · L61-L64 — interface RoutineDayOverviewSheetProps
- RoutineDayOverviewSheet · function · L68-L371 — function RoutineDayOverviewSheet({ open, onOpenChange }: RoutineDayOverviewSheetProps)
- handlePickStaff · function · L178-L187 — function handlePickStaff(row: ShiftChecklistWorkspaceRow)
