# components/admin/FacilitiesPanel.tsx

- FormState · type · L13-L17 — type FormState = { name: string; address: string; description: string; };
- FacilitiesPanel · function · L25-L227 — function FacilitiesPanel({ onChanged }: { onChanged?: () => void } = {})
- startCreate · function · L49-L53 — function startCreate()
- startEdit · function · L55-L63 — function startEdit(facility: Facility)
- submitForm · function · L65-L95 — async function submitForm()
- removeFacility · function · L97-L107 — async function removeFacility(id: number)
