# components/dashboard/DashboardMapLauncher.tsx

- DashboardMapLauncherProps · type · L19-L29 — type DashboardMapLauncherProps = { href: string; title: string; description: string; primaryLabel?: string; emergencyCount?: number; peopleCount?: number; roomLabel?: string; compact?: boolean; className?: string; };
- MapLauncherMetric · function · L31-L60 — function MapLauncherMetric({ icon: Icon, label, value, tone = "neutral", }: { icon: LucideIcon; label: string; value: string | number; tone?: "danger" | "primary" | "neutral"; })
- DashboardMapLauncher · function · L62-L157 — function DashboardMapLauncher({ href, title, description, primaryLabel, emergencyCount = 0, peopleCount, roomLabel, compact = false, className, }: DashboardMapLauncherProps)
