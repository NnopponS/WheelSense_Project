# app/admin/account-management/page.tsx

- AdminUser · type · L24-L24 — type AdminUser = ListUsersResponse[number];
- AdminPatient · type · L25-L25 — type AdminPatient = ListPatientsResponse[number];
- AdminCaregiver · type · L26-L26 — type AdminCaregiver = ListCaregiversResponse[number];
- AccountDraft · type · L38-L45 — type AccountDraft = { username: string; password: string; role: (typeof USER_ROLES)[number]; isActive: boolean; caregiverId: string; patientId: string; };
- formatCaregiver · function · L47-L49 — function formatCaregiver(c: AdminCaregiver): string
- formatPatient · function · L51-L53 — function formatPatient(p: AdminPatient): string
- roleLabel · function · L55-L57 — function roleLabel(role: string): string
- isStaffRole · function · L59-L61 — function isStaffRole(role: string): role is (typeof STAFF_ROLES)[number]
- matchText · function · L63-L67 — function matchText(values: Array<string | number | null | undefined>, search: string): boolean
- AccountManagementPage · function · L69-L875 — function AccountManagementPage()
