# app/admin/personnel/page.tsx

- ViewTab · type · L42-L42 — type ViewTab = "staff" | "patients" | "accounts";
- User · type · L43-L43 — type User = ListUsersResponse[number];
- personnelTabFromQuery · function · L45-L50 — function personnelTabFromQuery(raw: string | null | undefined): ViewTab | null
- formatUserRole · function · L69-L72 — function formatUserRole(role: string, t: (key: TranslationKey) => string): string
- personName · function · L74-L76 — function personName(firstName?: string | null, lastName?: string | null, fallback = "Person"): string
- PersonnelPageContent · function · L78-L956 — function PersonnelPageContent()
- PersonnelPage · function · L958-L970 — function PersonnelPage()
