# app/head-caregiver/prescriptions/page.tsx

- PrescriptionFormValues · type · L47-L47 — type PrescriptionFormValues = z.infer<typeof prescriptionFormSchema>;
- PrescriptionRow · type · L49-L58 — type PrescriptionRow = { id: number; medicationName: string; dosage: string; frequency: string; patientName: string; specialistId: number | null; status: string; createdAt: string; };
- errorText · function · L60-L64 — function errorText(error: unknown): string
- SupervisorPrescriptionsPage · function · L66-L339 — function SupervisorPrescriptionsPage()
