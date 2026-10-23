# app/admin/patients/page.tsx

- CaregiverPatientAccessOut · type · L46-L50 — type CaregiverPatientAccessOut = { caregiver_id: number; patient_id: number; is_active: boolean; };
- PatientRow · type · L52-L63 — type PatientRow = { id: number; fullName: string; photoUrl: string | null; careLevel: "critical" | "special" | "standard"; roomId: number | null; status: "active" | "inactive"; admissionDate: string | null; lastSeen: string | null; assignedCaregivers: string[]; assignedCaregiversCount: number; };
- Routine · type · L65-L73 — type Routine = { id: number; title: string; schedule_type: "medication" | "check_in" | "procedure" | "meal"; time: string; frequency: string; assigned_to: string; status: "active" | "paused" | "completed"; };
- FilterType · type · L75-L75 — type FilterType = "all" | "critical" | "unassigned" | "recent";
- formatCaregiver · function · L77-L79 — function formatCaregiver(caregiver: CaregiverOut): string
- careLevelTranslationKey · function · L81-L90 — function careLevelTranslationKey(level: PatientRow["careLevel"]): TranslationKey
- routineScheduleTypeKey · function · L92-L105 — function routineScheduleTypeKey(type: Routine["schedule_type"]): TranslationKey
- routineStatusKey · function · L107-L118 — function routineStatusKey(status: Routine["status"]): TranslationKey
- AdminPatientsPage · function · L120-L782 — function AdminPatientsPage()
- getCareLevelVariant · function · L288-L297 — getCareLevelVariant = (level: PatientRow["careLevel"])
- getRoutineTypeColor · function · L299-L312 — getRoutineTypeColor = (type: Routine["schedule_type"])
