# app/patient/page.tsx

- MeProfileResponse · type · L40-L56 — type MeProfileResponse = { user: { id: number; username: string; role: string; email?: string | null; phone?: string | null; profile_image_url?: string | null; }; linked_patient?: { id: number; first_name?: string | null; last_name?: string | null; /** Same hosted path as `GET /patients/{id}` when staff set a patient portrait. */ photo_url?: string | null; } | null; };
- mergedPatientPortalAvatarUrl · function · L59-L68 — function mergedPatientPortalAvatarUrl( patient: GetPatientResponse, profile: MeProfileResponse | null, ): string | null
- PatientDashboardPage · function · L70-L286 — function PatientDashboardPage()
- PatientHomeContent · function · L288-L416 — function PatientHomeContent({ patientId, previewPatientId, isPending, onRaise, t, }: { patientId: number; previewPatientId: number | null; isPending: boolean; onRaise: (kind: "assistance" | "sos") => void; t: (key: string) => string; })
- ProfileTab · function · L418-L499 — function ProfileTab({ patient, profile, nowMs, roomDisplay, }: { patient: GetPatientResponse; profile: MeProfileResponse | null; nowMs: number; roomDisplay: string; })
- InfoCard · function · L501-L508 — function InfoCard({ label, value }: { label: string; value: string })
