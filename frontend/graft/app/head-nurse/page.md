# app/head-caregiver/page.tsx

- AttentionEntry · type · L65-L73 — type AttentionEntry = { patient: PatientOut; score: number; alerts: number; tasks: number; messages: number; handovers: number; roomMissing: boolean; };
- WorkloadEntry · type · L75-L83 — type WorkloadEntry = { key: string; label: string; roleLabel: string; total: number; tasks: number; schedules: number; directives: number; };
- DeviceWarningEntry · type · L85-L90 — type DeviceWarningEntry = { device: ListSmartDevicesResponse[number]; roomLabel: string; reasons: string[]; score: number; };
- RoomLite · type · L92-L95 — type RoomLite = { id: number; name: string; };
- caregiverRoleLabel · function · L97-L107 — function caregiverRoleLabel(role: string, translate: (key: TranslationKey) => string): string
- normalizeLabel · function · L109-L111 — function normalizeLabel(value: string | null | undefined): string
- patientName · function · L113-L116 — function patientName(patient: PatientOut): string
- formatTemplate · function · L118-L123 — function formatTemplate(template: string, values: Record<string, string | number>): string
- HeadNurseDashboardPage · function · L125-L1300 — function HeadNurseDashboardPage()
- ensure · function · L329-L343 — ensure = (patient: PatientOut)
- ensure · function · L402-L416 — ensure = (key: string, label: string, roleLabel: string)
- bucketKeyForItem · function · L417-L424 — bucketKeyForItem = ( person: NonNullable<CareTaskOut["assigned_person"]> | null | undefined, fallbackRole: string | null | undefined, )
- bucketLabelForItem · function · L425-L432 — bucketLabelForItem = ( person: NonNullable<CareTaskOut["assigned_person"]> | null | undefined, fallbackRole: string | null | undefined, )
- bucketRoleForItem · function · L433-L440 — bucketRoleForItem = ( person: NonNullable<CareTaskOut["assigned_person"]> | null | undefined, fallbackRole: string | null | undefined, )
