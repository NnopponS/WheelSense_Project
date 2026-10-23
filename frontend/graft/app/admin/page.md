# app/admin/page.tsx

- HealthStatus · type · L25-L25 — type HealthStatus = "healthy" | "warning";
- MenuItem · type · L27-L31 — type MenuItem = { label: string; href: string; note: string; };
- MenuGroup · type · L33-L38 — type MenuGroup = { group: string; icon: LucideIcon; summary: string; items: MenuItem[]; };
- healthVariant · function · L53-L55 — function healthVariant(status: HealthStatus)
- healthLabel · function · L57-L59 — function healthLabel(status: HealthStatus, t: (key: string) => string)
- formatTemplate · function · L61-L66 — function formatTemplate(template: string, values: Record<string, string | number>): string
- AdminDashboardPage · function · L68-L817 — function AdminDashboardPage()
