# components/head-caregiver/HeadNurseStaffMemberSheet.tsx

- CaregiverSummary · type · L33-L37 — type CaregiverSummary = { id: number; fullName: string; role: string; };
- nextNewRowSequence · function · L39-L46 — function nextNewRowSequence(items: ShiftChecklistItemApi[]): number
- TemplateEditorProps · type · L57-L63 — type TemplateEditorProps = { initialItems: ShiftChecklistItemApi[]; linkedUser: User; /** Hide bottom save button when parent shows a sticky footer save. */ hideBottomSave?: boolean; onSavingChange?: (pending: boolean) => void; };
- StaffChecklistTemplateEditorHandle · type · L65-L67 — type StaffChecklistTemplateEditorHandle = { save: () => void; };
- addItem · function · L133-L138 — addItem = (category: ShiftChecklistItemApi["category"])
- removeRow · function · L140-L142 — removeRow = (id: string)
- updateRow · function · L144-L146 — updateRow = (id: string, patch: Partial<ShiftChecklistItemApi>)
- previewLabel · function · L148-L151 — previewLabel = (labelText: string)
- Props · type · L273-L280 — type Props = { open: boolean; onOpenChange: (open: boolean) => void; caregiver: CaregiverSummary | null; linkedUser: User | null; tasksForUser: CareTaskOut[]; schedulesForUser: CareScheduleOut[]; };
- HeadNurseStaffMemberSheet · function · L282-L506 — function HeadNurseStaffMemberSheet({ open, onOpenChange, caregiver, linkedUser, tasksForUser, schedulesForUser, }: Props)
