# lib/forms/patientForm.ts

- isPositiveNumber · function · L36-L40 — function isPositiveNumber(value: string)
- emergencyContactRefine · function · L42-L59 — function emergencyContactRefine( values: { emergencyContactName: string; emergencyContactPhone: string; }, ctx: z.RefinementCtx, )
- PatientCreateFormValues · type · L83-L83 — type PatientCreateFormValues = z.infer<typeof patientCreateFormSchema>;
- PatientEditorFormValues · type · L95-L95 — type PatientEditorFormValues = z.infer<typeof patientEditorFormSchema>;
- createPatientFormDefaultValues · function · L97-L117 — function createPatientFormDefaultValues(): PatientCreateFormValues
- parseOptionalNumber · function · L119-L123 — function parseOptionalNumber(value: string)
- pickOption · function · L125-L127 — function pickOption<T extends readonly string[]>(options: T, value: string | null | undefined, fallback: T[number])
- buildPatientCreatePayload · function · L129-L160 — function buildPatientCreatePayload(values: PatientCreateFormValues)
- medicalConditionsToInput · function · L162-L173 — function medicalConditionsToInput(conditions: MedicalConditionEntry[] | undefined)
- createPatientEditorFormValues · function · L175-L216 — function createPatientEditorFormValues( patient: Patient, primaryContact: PatientContact | null, ): PatientEditorFormValues
- buildPatientUpdatePayload · function · L218-L224 — function buildPatientUpdatePayload(values: PatientEditorFormValues)
- buildEmergencyContactPayload · function · L226-L238 — function buildEmergencyContactPayload(values: PatientCreateFormValues)
- buildPatientEditorEmergencyContactPayload · function · L240-L254 — function buildPatientEditorEmergencyContactPayload(values: PatientEditorFormValues)
