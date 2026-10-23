# components/workflow/WorkflowJobCreateDialog.tsx

- DraftStepRow · type · L33-L38 — type DraftStepRow = { key: string; title: string; instructions: string; assigned_user_id: number | ""; };
- newRow · function · L40-L47 — function newRow(): DraftStepRow
- pad2 · function · L49-L51 — function pad2(n: number): string
- defaultDateParts · function · L53-L60 — function defaultDateParts(): { date: string; time: string }
- toIso · function · L62-L66 — function toIso(date: string, time: string): string
- minutesBetween · function · L68-L74 — function minutesBetween(startIso: string, endDate: string, endTime: string): number
- Props · type · L76-L83 — type Props = { open: boolean; onOpenChange: (v: boolean) => void; patients: ListPatientsResponse; users: ListUsersResponse; submitting: boolean; onSubmit: (payload: CreateCareWorkflowJobInput) => void; };
- WorkflowJobCreateDialog · function · L85-L480 — function WorkflowJobCreateDialog({ open, onOpenChange, patients, users, submitting, onSubmit, }: Props)
- toggle · function · L161-L164 — toggle = (arr: number[], id: number, set: (n: number[]) => void)
- applyPreset · function · L166-L179 — applyPreset = (preset: "vitals" | "meds" | "doc")
