# app/head-caregiver/specialists/page.tsx

- SpecialistFormValues · type · L43-L43 — type SpecialistFormValues = z.infer<typeof specialistSchema>;
- SpecialistRow · type · L45-L53 — type SpecialistRow = { id: number; fullName: string; specialty: string; licenseNumber: string | null; phone: string | null; email: string | null; status: "active" | "inactive"; };
- errorText · function · L55-L59 — function errorText(error: unknown): string
- HeadNurseSpecialistsPage · function · L61-L277 — function HeadNurseSpecialistsPage()
