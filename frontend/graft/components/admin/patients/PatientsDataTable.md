# components/admin/patients/PatientsDataTable.tsx

- Props · type · L34-L41 — type Props = { patients: Patient[] | null | undefined; isLoading: boolean; search: string; careLevel: "all" | Patient["care_level"]; activeStatus: "all" | "active" | "inactive"; room: "all" | "assigned" | "unassigned"; };
- matchesSearch · function · L43-L53 — function matchesSearch(patient: Patient, search: string)
- getCareVariant · function · L55-L59 — function getCareVariant(level: Patient["care_level"])
- PatientsDataTable · function · L61-L290 — function PatientsDataTable({ patients, isLoading, search, careLevel, activeStatus, room, }: Props)
