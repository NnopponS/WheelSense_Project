# components/admin/caregivers/AddCaregiverModal.tsx

- Props · type · L9-L13 — type Props = { open: boolean; onClose: () => void; onCreated: () => void; };
- CaregiverRole · type · L15-L15 — type CaregiverRole = "admin" | "observer" | "supervisor";
- AddCaregiverModal · function · L17-L292 — function AddCaregiverModal({ open, onClose, onCreated }: Props)
- resetForm · function · L40-L50 — function resetForm()
- handleSubmit · function · L52-L93 — async function handleSubmit(e: React.FormEvent)
