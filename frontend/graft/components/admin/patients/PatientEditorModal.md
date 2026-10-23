# components/admin/patients/PatientEditorModal.tsx

- RoomOption · type · L51-L55 — type RoomOption = { id: number; name: string; floor_name?: string | null; };
- createPatientEditorSchemas · function · L63-L178 — function createPatientEditorSchemas(t: (key: TranslationKey) => string)
- PatientEditorFormValues · type · L180-L182 — type PatientEditorFormValues = z.infer< ReturnType<typeof createPatientEditorSchemas>["editorBaseSchema"] >;
- SaveStage · type · L184-L184 — type SaveStage = "idle" | "patient" | "contact" | "account";
- PatientEditorModalProps · interface · L186-L191 — interface PatientEditorModalProps
- parseNumberOrNull · function · L193-L198 — function parseNumberOrNull(value: string): number | null
- roomTitle · function · L200-L202 — function roomTitle(room: RoomOption): string
- buildDefaultValues · function · L204-L237 — function buildDefaultValues( patient: PatientOut, contact: ListPatientContactsResponse[number] | null, linkedUser: ListUsersResponse[number] | null, ): PatientEditorFormValues
- extractErrorMessage · function · L239-L243 — function extractErrorMessage(error: unknown, t: (key: TranslationKey) => string): string
- PatientEditorModal · function · L245-L843 — function PatientEditorModal({ open, patientId, onClose, onSaved, }: PatientEditorModalProps)
- Field · function · L845-L866 — function Field({ label, hint, error, className, children, }: { label: string; hint?: string; error?: string; className?: string; children: React.ReactNode; })
- SelectField · function · L868-L910 — function SelectField({ control, name, label, options, disabled, }: { control: ReturnType<typeof useForm<PatientEditorFormValues>>["control"]; name: "gender" | "careLevel" | "mobilityType" | "bloodType"; label: string; options: Array<{ value: string; label: string }>; disabled: boolean; })
