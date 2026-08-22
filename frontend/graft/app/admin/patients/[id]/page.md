# app/admin/patients/[id]/page.tsx

- caregiverSearchText · function · L67-L78 — function caregiverSearchText(c: Caregiver): string
- formatCondition · function · L80-L87 — function formatCondition(c: MedicalConditionEntry): string
- splitMultilineList · function · L89-L94 — function splitMultilineList(value: string): string[]
- EditableCard · type · L96-L96 — type EditableCard = "about" | "chronic" | "allergies" | "medications" | "emergency" | "notes";
- CardDrafts · type · L98-L119 — type CardDrafts = { first_name: string; last_name: string; date_of_birth: string; gender: string; care_level: string; mobility_type: string; blood_type: string; height_cm: string; weight_kg: string; room_id: string; is_active: boolean; medical_conditions_raw: string; allergies_raw: string; medications_raw: string; emergency_contact_name: string; emergency_contact_relationship: string; emergency_contact_phone: string; emergency_contact_email: string; emergency_contact_notes: string; notes: string; };
- buildCardDrafts · function · L121-L155 — function buildCardDrafts(patient: Patient, contacts: PatientContact[]): CardDrafts
- PatientDetailPage · function · L157-L1210 — function PatientDetailPage()
- withAccountPhotoFallback · function · L246-L251 — withAccountPhotoFallback = (caregiver: Caregiver): Caregiver
- openAccountEditor · function · L594-L605 — function openAccountEditor(user: PortalUser)
- saveAccountEditor · function · L607-L628 — async function saveAccountEditor(userId: number)
- ProfileCard · function · L1212-L1239 — function ProfileCard({ title, badge, editSlot, children, }: { title: string; badge?: string; editSlot?: React.ReactNode; children: React.ReactNode; })
- EditBtn · function · L1241-L1251 — function EditBtn({ onClick, t }: { onClick: () => void; t: (k: string) => string })
- EditActions · function · L1253-L1270 — function EditActions({ onCancel, onSave, saving, t, }: { onCancel: () => void; onSave: () => void; saving: boolean; t: (k: string) => string; })
