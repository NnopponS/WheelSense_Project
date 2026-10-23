# app/head-nurse/personnel/[id]/page.tsx

- VitalsRow · type · L33-L41 — type VitalsRow = { id: number; timestamp: string; heartRate: number | null; spo2: number | null; rrInterval: number | null; battery: number | null; source: string; };
- AlertRow · type · L43-L50 — type AlertRow = { id: number; title: string; severity: string; status: string; description: string; timestamp: string; };
- TimelineRow · type · L52-L59 — type TimelineRow = { id: number; eventType: string; description: string; roomName: string; timestamp: string; source: string; };
- AssignmentRow · type · L61-L67 — type AssignmentRow = { id: number; deviceId: string; deviceRole: string; assignedAt: string; isActive: boolean; };
- asTimestampMs · function · L69-L72 — function asTimestampMs(value: string): number
- HeadNursePatientDetailPage · function · L74-L527 — function HeadNursePatientDetailPage()
- QuickInfo · function · L529-L536 — function QuickInfo({ label, value }: { label: string; value: string })
