# components/admin/caregivers/EditCaregiverModal.tsx

- Props · type · L10-L15 — type Props = { open: boolean; caregiver: Caregiver | null; onClose: () => void; onSaved: (updated: Caregiver) => void; };
- CaregiverRole · type · L17-L17 — type CaregiverRole = "admin" | "observer" | "supervisor";
- CaregiverDepartment · type · L18-L18 — type CaregiverDepartment = "nursing" | "rehab" | "pharmacy" | "operations" | "support";
- EmploymentType · type · L19-L19 — type EmploymentType = "full_time" | "part_time" | "contract" | "agency";
- CaregiverSpecialty · type · L20-L26 — type CaregiverSpecialty = | "general_care" | "fall_risk" | "mobility_support" | "vitals_monitoring" | "medication_support" | "rehab_support";
- FormState · type · L28-L43 — type FormState = { first_name: string; last_name: string; role: CaregiverRole; employee_code: string; department: CaregiverDepartment | ""; employment_type: EmploymentType | ""; specialty: CaregiverSpecialty | ""; license_number: string; phone: string; email: string; emergency_contact_name: string; emergency_contact_phone: string; photo_url: string; is_active: boolean; };
- SelectOption · type · L45-L48 — type SelectOption = { value: string; label: string; };
- emptyForm · function · L77-L94 — function emptyForm(): FormState
- hydrateForm · function · L96-L114 — function hydrateForm(caregiver: Caregiver | null): FormState
- toStringValue · function · L116-L118 — function toStringValue(value: string): string
- FormSection · function · L120-L138 — function FormSection({ title, description, children, }: { title: string; description: string; children: ReactNode; })
- TextField · function · L140-L170 — function TextField({ id, label, value, onChange, type = "text", placeholder, }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; })
- SelectField · function · L172-L204 — function SelectField({ id, label, value, onChange, options, }: { id: string; label: string; value: string; onChange: (value: string) => void; options: SelectOption[]; })
- EditCaregiverModal · function · L206-L465 — function EditCaregiverModal({ open, caregiver, onClose, onSaved }: Props)
- update · function · L229-L231 — update = (patch: Partial<FormState>)
- handleSubmit · function · L233-L263 — async function handleSubmit(event: FormEvent<HTMLFormElement>)
