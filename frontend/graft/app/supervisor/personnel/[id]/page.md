# app/supervisor/personnel/[id]/page.tsx

- VitalsRow · type · L31-L39 — type VitalsRow = { id: number; timestamp: string; heartRate: number | null; spo2: number | null; rrInterval: number | null; battery: number | null; source: string; };
- AlertRow · type · L41-L48 — type AlertRow = { id: number; title: string; severity: string; status: string; description: string; timestamp: string; };
- TaskRow · type · L50-L56 — type TaskRow = { id: number; title: string; priority: string; status: string; dueAt: string | null; };
- DirectiveRow · type · L58-L64 — type DirectiveRow = { id: number; title: string; text: string; status: string; effectiveFrom: string; };
- SupervisorPatientDetailPage · function · L66-L569 — function SupervisorPatientDetailPage()
- QuickInfo · function · L571-L578 — function QuickInfo({ label, value }: { label: string; value: string })
